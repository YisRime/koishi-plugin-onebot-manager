import { Context, Logger, Session } from 'koishi'
import { Config } from './index'

export type Request = 'accept' | 'reject' | 'manual' | 'auto'
export type TimeoutAction = 'accept' | 'reject'
export type RequestType = 'friend' | 'guild' | 'member'

export interface NotifyTarget {
  type: 'group' | 'private',
  id: string
}
export interface OneBotUserInfo {
  user_id: number
  regTime?: number
  reg_time?: number
  qqLevel?: number
  level?: number
  is_vip?: boolean
  is_years_vip?: boolean
  vip_level?: number
}
export interface OneBotGroupInfo {
  group_id: number
  group_name: string
  group_remark?: string
  member_count: number
  max_member_count: number
}

export class OnebotRequest {
  private processedRequests = new Set<string>();
  private pendingRequests = new Map<string, {
    session: Session,
    type: RequestType,
    disposer?: () => void
  }>();
  private requestNumberMap = new Map<number, string>();
  private nextRequestNumber = 1;

  constructor(
    private ctx: Context,
    private logger: Logger,
    private config: Config = {},
  ) {}

  /**
   * 创建请求标识
   * @param session 会话对象
   * @param type 请求类型
   * @returns 唯一请求ID
   * @private
   */
  private createRequestId(session: Session, type: RequestType): string {
    const idMap = {
      'friend': `friend:${session.userId}`,
      'member': `member:${session.userId}:${session.guildId}`,
      'guild': `guild:${session.guildId}`
    };
    return idMap[type] || `${type}:${session.userId}:${session.guildId || 'none'}`;
  }

  /**
   * 标记请求为已处理
   * @param requestId 请求ID
   * @private
   */
  private markRequestAsProcessed(requestId: string): void {
    this.processedRequests.add(requestId);
    const pending = this.pendingRequests.get(requestId);
    if (pending?.disposer) pending.disposer();
    this.pendingRequests.delete(requestId);
    this.requestNumberMap.delete(this.getRequestNumber(requestId));
  }

  /**
   * 获取请求序号
   * @param requestId 请求ID
   * @returns 请求序号
   * @private
   */
  private getRequestNumber(requestId: string): number {
    const requestNumber = this.nextRequestNumber++;
    this.requestNumberMap.set(requestNumber, requestId);
    return requestNumber;
  }

  /**
   * 检查用户条件
   * @param session 会话对象
   * @param regTimeLimit 注册时间限制（年）
   * @param levelLimit QQ等级限制
   * @param vipLevelLimit VIP等级限制
   * @returns 成功返回true，失败返回错误原因字符串，无条件检查则返回false
   * @private
   */
  private async checkUserConditions(session: Session, regTimeLimit: number, levelLimit: number, vipLevelLimit: number): Promise<boolean | string> {
    try {
      const userInfo = await session.onebot.getStrangerInfo(Number(session.userId), false) as OneBotUserInfo;
      // 检查注册时间
      if (regTimeLimit >= 0) {
        const regTime = userInfo.reg_time || userInfo.regTime || 0;
        const regYear = regTime > 0 ? new Date(regTime * 1000).getFullYear() : new Date().getFullYear();
        const accountAge = new Date().getFullYear() - regYear;
        if (accountAge < regTimeLimit) return `注册时间不满${regTimeLimit}年`;
      }
      // 检查QQ等级
      if (levelLimit >= 0) {
        const level = userInfo.level || userInfo.qqLevel || 0;
        if (level < levelLimit) return `QQ等级低于${levelLimit}`;
      }
      // 检查会员等级
      if (vipLevelLimit >= 0 && (!userInfo.is_vip || (userInfo.vip_level || 0) < vipLevelLimit)) {
        return `会员等级低于${vipLevelLimit}`;
      }
      return (regTimeLimit >= 0 || levelLimit >= 0 || vipLevelLimit >= 0) ? true : false;
    } catch (error) {
      return `获取用户信息失败: ${error}`;
    }
  }

  /**
   * 判断是否自动通过
   * @param session 会话对象
   * @param type 请求类型
   * @returns 成功返回true，失败返回错误原因字符串，无条件检查则返回false
   * @private
   */
  private async shouldAutoAccept(session: Session, type: RequestType): Promise<boolean | string> {
    // 好友请求条件
    if (type === 'friend') {
      const { FriendRegTime = -1, FriendLevel = -1, FriendVipLevel = -1 } = this.config;
      return this.checkUserConditions(session, FriendRegTime, FriendLevel, FriendVipLevel);
    }
    // 加群请求条件
    if (type === 'member') {
      const { MemberRegTime = -1, MemberLevel = -1, MemberVipLevel = -1 } = this.config;
      return this.checkUserConditions(session, MemberRegTime, MemberLevel, MemberVipLevel);
    }
    // 入群邀请条件
    if (type === 'guild') {
      const { GuildAllowUsers = [], GuildMinMemberCount = -1, GuildMaxCapacity = -1 } = this.config;
      // 白名单或权限检查
      if (GuildAllowUsers.includes(session.userId)) return true;
      try {
        const user = await this.ctx.database.getUser(session.platform, session.userId);
        if (user?.authority > 1) return true;
      } catch {}
      // 群信息检查
      if (GuildMinMemberCount >= 0 || GuildMaxCapacity >= 0) {
        try {
          const groupInfo = await session.onebot.getGroupInfo(Number(session.guildId), true) as OneBotGroupInfo;
          if (GuildMinMemberCount >= 0 && groupInfo.member_count < GuildMinMemberCount)
            return `群成员数量不足${GuildMinMemberCount}人`;
          if (GuildMaxCapacity >= 0 && groupInfo.max_member_count < GuildMaxCapacity)
            return `群最大容量不足${GuildMaxCapacity}人`;
          return true;
        } catch (error) {
          return `获取群信息失败: ${error}`;
        }
      }
    }
    return false;
  }

  /**
   * 创建通知消息
   * @param session 会话对象
   * @param type 请求类型
   * @param requestId 请求ID
   * @returns 格式化的通知消息
   * @private
   */
  private async createNotificationMessage(session: Session, type: RequestType, requestId: string): Promise<{message: string, requestNumber: number}> {
    try {
      const requestNumber = this.getRequestNumber(requestId);
      const user = await session.bot.getUser?.(session.userId)?.catch(() => null) ?? null;
      const userName = user?.name ?? '未知用户';
      let message = '';
      // 好友申请
      if (type === 'friend') {
        const comment = session.event?._data?.comment ?? '';
        message = `${requestNumber}. 收到来自${userName}[${session.userId}]的好友申请：\n`;
        if (user?.avatar) message += `<image url="${user.avatar}"/>\n`;
        if (comment) message += `验证信息：${comment}\n`;
      }
      // 群请求
      else {
        const guild = await session.bot.getGuild?.(session.guildId)?.catch(() => null) ?? null;
        const guildName = guild?.name ?? '未知群组';
        message = `${requestNumber}. 收到来自${userName}[${session.userId}]的${type === 'guild' ? '入群' : '加群'}${guildName}[${session.guildId}]${type === 'guild' ? '邀请' : '请求'}\n`;
        if (type === 'member' && session.event?._data?.comment) {
          message += `验证信息：${session.event._data.comment}\n`;
        }
      }
      return { message, requestNumber };
    } catch (error) {
      const requestNumber = this.getRequestNumber(requestId);
      return { message: `${requestNumber}. 收到 ${type} 请求（详情获取失败）`, requestNumber };
    }
  }

  /**
   * 处理请求动作
   * @param session 会话对象
   * @param type 请求类型
   * @param approve 是否同意
   * @param reason 拒绝原因
   * @param remark 通过时的备注
   * @returns 处理是否成功
   * @private
   */
  private async processRequestAction(session: Session, type: RequestType, approve: boolean, reason = '', remark = ''): Promise<boolean> {
    try {
      const flag = session.event._data.flag;
      if (type === 'friend') {
        await session.onebot.setFriendAddRequest(flag, approve, remark);
      } else {
        const subType = session.event._data.sub_type ?? 'add';
        await session.onebot.setGroupAddRequest(flag, subType, approve, approve ? '' : reason);
      }
      return true;
    } catch (error) {
      this.logger.error(`请求处理失败: ${error}`);
      return false;
    }
  }

  /**
   * 设置通知与响应监听
   * @param session 会话对象
   * @param type 请求类型
   * @param requestId 请求ID
   * @param isManualMode 是否为手动模式
   * @returns 通知是否发送成功
   * @private
   */
  private async setupNotification(session: Session, type: RequestType, requestId: string, isManualMode: boolean): Promise<boolean> {
    const { enableNotify = false, notifyTarget = '' } = this.config;
    if (!enableNotify || !notifyTarget) return false;
    // 解析目标
    const [targetType, targetId] = notifyTarget.split(':');
    const normalizedType = targetType?.toLowerCase();
    if (!targetId || (normalizedType !== 'group' && normalizedType !== 'private')) {
      this.logger.warn(`通知目标错误: ${notifyTarget}`);
      return false;
    }
    try {
      // 生成并发送通知
      const { message, requestNumber } = await this.createNotificationMessage(session, type, requestId);
      await (normalizedType === 'group'
        ? session.bot.sendMessage(targetId, message)
        : session.bot.sendPrivateMessage(targetId, message));
      // 手动模式
      if (isManualMode) {
        if (normalizedType === 'private') {
          await session.bot.sendPrivateMessage(targetId, `请使用 通过[y]${requestNumber}/拒绝[n]${requestNumber} [备注/理由] 处理此请求`);
        }
        this.createResponseHandler(session, type, requestId, normalizedType, targetId, requestNumber);
      }
      return true;
    } catch (error) {
      this.logger.error(`通知发送失败: ${error}`);
      return false;
    }
  }

  /**
   * 创建响应处理器
   * @param session 会话对象
   * @param type 请求类型
   * @param requestId 请求ID
   * @param targetType 通知类型(group/private)
   * @param targetId 通知目标ID
   * @param requestNumber 请求序号
   * @private
   */
  private createResponseHandler(session: Session, type: RequestType, requestId: string, targetType: string, targetId: string, requestNumber: number): void {
    const disposer = this.ctx.middleware(async (session2, next) => {
      // 检查消息相关性
      const isRelevant = targetType === 'group'
        ? session2.channelId === targetId && !session2.content.startsWith('.')
        : session2.userId === targetId && session2.channelId.startsWith('private:');
      if (!isRelevant) return next();
      const content = session2.content.trim();
      // 检查是否是响应该请求的命令
      let isApprove = false;
      let isReject = false;
      let extraContent = '';
      // 检测格式
      if (content.match(new RegExp(`^y${requestNumber}\\b`))) {
        isApprove = true;
        extraContent = content.substring((`y${requestNumber}`).length).trim();
      } else if (content.match(new RegExp(`^n${requestNumber}\\b`))) {
        isReject = true;
        extraContent = content.substring((`n${requestNumber}`).length).trim();
      } else if (content.match(new RegExp(`^通过${requestNumber}\\b`))) {
        isApprove = true;
        extraContent = content.substring((`通过${requestNumber}`).length).trim();
      } else if (content.match(new RegExp(`^拒绝${requestNumber}\\b`))) {
        isReject = true;
        extraContent = content.substring((`拒绝${requestNumber}`).length).trim();
      }
      if (!isApprove && !isReject) return next();
      // 处理响应
      disposer();
      this.pendingRequests.delete(requestId);
      this.requestNumberMap.delete(requestNumber);
      try {
        if (isApprove) {
          const remark = extraContent && type === 'friend' ? extraContent : '';
          await this.processRequestAction(session, type, true, '', remark);
        } else {
          const reason = extraContent || '';
          await this.processRequestAction(session, type, false, reason);
        }
        if (targetType === 'private') {
          await session.bot.sendPrivateMessage(targetId, isApprove ? '已通过' : '已拒绝');
        }
      } catch (error) {
        this.logger.error(`响应处理失败: ${error}`);
        if (targetType === 'private') {
          await session.bot.sendPrivateMessage(targetId, `处理失败: ${error.message || '未知错误'}`);
        }
      }
      return next();
    });
    this.pendingRequests.set(requestId, { session, type, disposer });
  }

  /**
   * 处理请求流程
   * @param session 会话对象
   * @param type 请求类型
   * @public
   */
  public async processRequest(session: Session, type: RequestType): Promise<void> {
    // 获取请求ID并检查是否处理过
    const requestId = this.createRequestId(session, type);
    if (this.processedRequests.has(requestId)) {
      return;
    }
    // 标记为已处理
    this.markRequestAsProcessed(requestId);
    // 获取处理模式
    const requestMode = this.config[`${type}Request`] as Request || 'reject';
    try {
      // 发送通知
      const notified = await this.setupNotification(session, type, requestId, requestMode === 'manual');
      // 处理逻辑
      if (requestMode === 'auto') {
        // 自动模式：根据条件决定
        const result = await this.shouldAutoAccept(session, type);
        await this.processRequestAction(
          session,
          type,
          result === true,
          typeof result === 'string' ? result : '条件不符'
        );
      }
      else if (requestMode === 'manual' && notified) {
        // 手动模式且通知成功：等待响应
        return;
      }
      else {
        // 其他情况：自动处理
        const approve = requestMode === 'accept';
        const reason = requestMode === 'manual' && !notified ? '通知失败，已自动处理' : '';
        await this.processRequestAction(session, type, approve, reason);
      }
    } catch (error) {
      this.logger.error(`处理请求${requestId}失败: ${error}`);
      // 出错时默认拒绝
      await this.processRequestAction(session, type, false, '处理出错').catch(() => {});
    }
  }

  /**
   * 注册OneBot事件监听器
   * 监听好友申请、群组邀请和加群申请事件
   * @public
   */
  public registerEventListeners(): void {
    const handleRequest = (type: RequestType) => async (session: Session) => {
      session.userId = session.event._data.user_id?.toString();
      if (type !== 'friend') {
        session.guildId = session.event._data.group_id?.toString() || '';
      }
      await this.processRequest(session, type);
    };
    // 注册事件
    this.ctx.on('friend-request', handleRequest('friend'));
    this.ctx.on('guild-request', handleRequest('guild'));
    this.ctx.on('guild-member-request', handleRequest('member'));
    this.ctx.on('guild-added', handleRequest('guild'));
  }
}