import { Context, Logger, Session } from 'koishi'
import { Config } from './index'

/**
 * 请求处理方式
 * @typedef {string} Request
 * - accept: 自动接受
 * - reject: 自动拒绝
 * - manual: 手动处理
 * - auto: 根据条件自动处理
 */
export type Request = 'accept' | 'reject' | 'manual' | 'auto'

/**
 * 超时后的处理方式
 * @typedef {string} TimeoutAction
 */
export type TimeoutAction = 'accept' | 'reject'

/**
 * 请求类型
 * @typedef {string} RequestType
 */
export type RequestType = 'friend' | 'guild' | 'member'

/**
 * 通知目标配置
 * @interface NotifyTarget
 */
export interface NotifyTarget {
  /** 通知类型：群聊或私聊 */
  type: 'group' | 'private',
  /** 目标ID */
  id: string
}

/**
 * OneBot用户信息接口
 * @interface OneBotUserInfo
 */
export interface OneBotUserInfo {
  /** 用户ID */
  user_id: number
  /** 注册时间（秒级时间戳，旧版API） */
  regTime?: number
  /** 注册时间（秒级时间戳，新版API） */
  reg_time?: number
  /** QQ等级（旧版API） */
  qqLevel?: number
  /** QQ等级（新版API） */
  level?: number
  /** 是否为会员 */
  is_vip?: boolean
  /** 是否为年费会员 */
  is_years_vip?: boolean
  /** 会员等级 */
  vip_level?: number
}

/**
 * OneBot群组信息接口
 * @interface OneBotGroupInfo
 */
export interface OneBotGroupInfo {
  /** 群组ID */
  group_id: number
  /** 群名称 */
  group_name: string
  /** 群备注 */
  group_remark?: string
  /** 成员数量 */
  member_count: number
  /** 最大成员数量 */
  max_member_count: number
}

/**
 * OneBot请求管理类
 * 处理好友请求、入群请求和加群请求
 */
export class OnebotRequest {
  /** 已处理的请求ID集合 */
  private processedRequests = new Set<string>();

  /** 待处理的请求映射 */
  private pendingRequests = new Map<string, {
    session: Session,
    type: RequestType,
    disposer?: () => void
  }>();

  /** 请求编号到请求ID的映射 */
  private requestNumberMap = new Map<number, string>();

  /** 下一个请求编号 */
  private nextRequestNumber = 1;

  /**
   * 创建OneBot请求处理器
   * @param ctx Koishi上下文
   * @param logger 日志记录器
   * @param config 配置对象
   */
  constructor(
    private ctx: Context,
    private logger: Logger,
    private config: Config = {},
  ) {}

  /**
   * 处理请求流程
   * @param session 会话对象
   * @param type 请求类型
   * @returns Promise<void>
   */
  public async processRequest(session: Session, type: RequestType): Promise<void> {
    // 创建请求ID
    const requestId = `${type}:${session.userId}:${session.guildId || 'none'}`;
    // 检查是否已处理过
    if (this.processedRequests.has(requestId)) return;
    this.processedRequests.add(requestId);
    // 获取处理模式
    const requestMode = this.config[`${type}Request`] as Request || 'reject';
    try {
      // 发送通知
      const notified = await this.setupNotification(session, type, requestId, requestMode === 'manual');
      // 处理逻辑
      if (requestMode === 'auto') {
        const result = await this.shouldAutoAccept(session, type);
        await this.processRequestAction(
          session, type, result === true,
          typeof result === 'string' ? result : '条件不符'
        );
      } else if (requestMode === 'manual' && notified) {
        // 手动模式且通知成功：等待响应
        return;
      } else {
        // 其他情况：自动处理
        await this.processRequestAction(
          session, type, requestMode === 'accept',
          requestMode === 'manual' && !notified ? '通知失败，已自动处理' : ''
        );
      }
    } catch (error) {
      this.logger.error(`处理请求${requestId}失败: ${error}`);
      await this.processRequestAction(session, type, false, '处理出错').catch(() => {});
    } finally {
      // 清理资源
      const pending = this.pendingRequests.get(requestId);
      if (pending?.disposer) pending.disposer();
      this.pendingRequests.delete(requestId);
      // 清理请求号映射
      for (const [num, id] of this.requestNumberMap.entries()) {
        if (id === requestId) this.requestNumberMap.delete(num);
      }
    }
  }

  /**
   * 检查用户条件是否满足设置的要求
   * @param session 会话对象
   * @param regTimeLimit 注册时间限制（年）
   * @param levelLimit QQ等级限制
   * @param vipLevelLimit 会员等级限制
   * @returns 通过返回true，不通过返回拒绝原因
   */
  private async checkUserConditions(
    session: Session,
    regTimeLimit = -1,
    levelLimit = -1,
    vipLevelLimit = -1
  ): Promise<boolean | string> {
    if (regTimeLimit < 0 && levelLimit < 0 && vipLevelLimit < 0) return false;
    try {
      const userInfo = await session.onebot.getStrangerInfo(Number(session.userId), false) as OneBotUserInfo;
      // 检查注册时间
      if (regTimeLimit >= 0) {
        const regTime = userInfo.reg_time || userInfo.regTime || 0;
        const regYear = regTime > 0 ? new Date(regTime * 1000).getFullYear() : new Date().getFullYear();
        if (new Date().getFullYear() - regYear < regTimeLimit) return `注册时间不满${regTimeLimit}年`;
      }
      // 检查QQ等级
      if (levelLimit >= 0 && (userInfo.level || userInfo.qqLevel || 0) < levelLimit) {
        return `QQ等级低于${levelLimit}`;
      }
      // 检查会员等级
      if (vipLevelLimit >= 0 && (!userInfo.is_vip || (userInfo.vip_level || 0) < vipLevelLimit)) {
        return `会员等级低于${vipLevelLimit}`;
      }
      return true;
    } catch (error) {
      return `获取用户信息失败: ${error}`;
    }
  }

  /**
   * 判断是否自动通过请求
   * @param session 会话对象
   * @param type 请求类型
   * @returns 通过返回true，不通过返回拒绝原因
   */
  private async shouldAutoAccept(session: Session, type: RequestType): Promise<boolean | string> {
    if (type === 'friend') {
      const { FriendRegTime = -1, FriendLevel = -1, FriendVipLevel = -1 } = this.config;
      return this.checkUserConditions(session, FriendRegTime, FriendLevel, FriendVipLevel);
    }
    if (type === 'member') {
      const { MemberRegTime = -1, MemberLevel = -1, MemberVipLevel = -1 } = this.config;
      return this.checkUserConditions(session, MemberRegTime, MemberLevel, MemberVipLevel);
    }
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
          const info = await session.onebot.getGroupInfo(Number(session.guildId), true) as OneBotGroupInfo;
          if (GuildMinMemberCount >= 0 && info.member_count < GuildMinMemberCount)
            return `群成员数量不足${GuildMinMemberCount}人`;
          if (GuildMaxCapacity >= 0 && info.max_member_count < GuildMaxCapacity)
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
   * 处理请求动作（接受/拒绝）
   * @param session 会话对象
   * @param type 请求类型
   * @param approve 是否通过
   * @param reason 拒绝理由
   * @param remark 好友备注
   * @returns 处理是否成功
   */
  private async processRequestAction(
    session: Session,
    type: RequestType,
    approve: boolean,
    reason = '',
    remark = ''
  ): Promise<boolean> {
    // 处理直接入群后拒绝的特殊情况
    if (!approve && type === 'guild' && session.event?.type === 'guild-added') {
      if (reason) {
        await session.bot.sendMessage(session.guildId, `${reason} 机器人将退出该群组。`)
          .catch(e => this.logger.warn(`发送退群原因失败: ${e}`));
      }
      try {
        await session.onebot.setGroupLeave(Number(session.guildId), false);
        return true;
      } catch (error) {
        this.logger.error(`退出群组 ${session.guildId} 失败: ${error}`);
        return false;
      }
    }
    // 常规请求处理
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
   * @returns 通知是否成功
   */
  private async setupNotification(
    session: Session,
    type: RequestType,
    requestId: string,
    isManualMode: boolean
  ): Promise<boolean> {
    const { enableNotify = false, notifyTarget = '' } = this.config;
    if (!enableNotify || !notifyTarget) return false;
    // 解析通知目标
    const [targetType, targetId] = notifyTarget.split(':');
    const normalizedType = targetType?.toLowerCase();
    if (!targetId || (normalizedType !== 'group' && normalizedType !== 'private')) {
      this.logger.warn(`通知目标错误: ${notifyTarget}`);
      return false;
    }
    try {
      // 生成通知消息
      const requestNumber = this.nextRequestNumber++;
      this.requestNumberMap.set(requestNumber, requestId);
      // 获取用户和群组信息
      const user = await session.bot.getUser?.(session.userId)?.catch(() => null) ?? null;
      const userName = user?.name ?? '未知用户';
      let message = `${requestNumber}. 收到来自${userName}[${session.userId}]的`;
      if (type === 'friend') {
        message += `好友申请：\n`;
        if (user?.avatar) message += `<image url="${user.avatar}"/>\n`;
        const comment = session.event?._data?.comment;
        if (comment) message += `验证信息：${comment}\n`;
      } else {
        const guild = await session.bot.getGuild?.(session.guildId)?.catch(() => null) ?? null;
        const guildName = guild?.name ?? '未知群组';
        message += `${type === 'guild' ? '入群' : '加群'}${guildName}[${session.guildId}]${type === 'guild' ? '邀请' : '请求'}\n`;
        if (type === 'member' && session.event?._data?.comment) {
          message += `验证信息：${session.event._data.comment}\n`;
        }
      }
      // 发送通知
      const isPrivate = normalizedType === 'private';
      await (isPrivate
        ? session.bot.sendPrivateMessage(targetId, message)
        : session.bot.sendMessage(targetId, message));
      // 手动模式
      if (isManualMode) {
        if (isPrivate) {
          await session.bot.sendPrivateMessage(
            targetId,
            `请使用 通过[y]${requestNumber}/拒绝[n]${requestNumber} [备注/理由] 处理此请求`
          );
        }
        // 创建响应处理器
        const disposer = this.ctx.middleware(async (s, next) => {
          // 检查消息相关性
          const isRelevant = !isPrivate
            ? s.channelId === targetId && !s.content.startsWith('.')
            : s.userId === targetId && s.channelId.startsWith('private:');
          if (!isRelevant) return next();
          // 匹配命令格式
          const content = s.content.trim();
          const match = content.match(new RegExp(`^(y|n|通过|拒绝)(${requestNumber})\\s*(.*)$`));
          if (!match) return next();
          const isApprove = match[1] === 'y' || match[1] === '通过';
          const extraContent = match[3]?.trim() || '';
          // 处理响应
          disposer();
          this.pendingRequests.delete(requestId);
          this.requestNumberMap.delete(requestNumber);
          try {
            await this.processRequestAction(
              session, type, isApprove,
              !isApprove ? extraContent : '',
              isApprove && type === 'friend' ? extraContent : ''
            );
            if (isPrivate) {
              await s.bot.sendPrivateMessage(targetId, isApprove ? '已通过' : '已拒绝');
            }
          } catch (error) {
            this.logger.error(`响应处理失败: ${error}`);
            if (isPrivate) {
              await s.bot.sendPrivateMessage(targetId, `处理失败: ${error.message || '未知错误'}`);
            }
          }
          return next();
        });
        this.pendingRequests.set(requestId, { session, type, disposer });
      }
      return true;
    } catch (error) {
      this.logger.error(`通知发送失败: ${error}`);
      return false;
    }
  }

  /**
   * 注册OneBot事件监听器
   * 监听好友请求、入群请求、加群请求和入群事件
   */
  public registerEventListeners(): void {
    const handleRequest = (type: RequestType) => async (session: Session) => {
      session.userId = session.event._data.user_id?.toString();
      if (type !== 'friend') {
        session.guildId = session.event._data.group_id?.toString() || '';
      }
      await this.processRequest(session, type);
    };

    this.ctx.on('friend-request', handleRequest('friend'));
    this.ctx.on('guild-request', handleRequest('guild'));
    this.ctx.on('guild-member-request', handleRequest('member'));
    this.ctx.on('guild-added', handleRequest('guild'));
  }
}