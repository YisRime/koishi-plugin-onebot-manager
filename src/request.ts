import { Context, Logger, Session } from 'koishi'
import { Config } from './index'

/**
 * 请求处理模式
 * - accept: 自动接受所有请求
 * - reject: 自动拒绝所有请求
 * - manual: 手动处理请求
 * - auto: 根据预设条件自动处理请求
 */
export type Request = 'accept' | 'reject' | 'manual' | 'auto'

/**
 * 请求类型
 * - friend: 好友请求
 * - guild: 群组请求
 * - member: 群成员请求
 */
export type RequestType = 'friend' | 'guild' | 'member'

/**
 * OneBot 用户信息接口
 */
export interface OneBotUserInfo {
  /** 用户 ID */
  user_id: number
  /** 注册时间（秒级时间戳） */
  regTime?: number
  /** 注册时间（秒级时间戳） */
  reg_time?: number
  /** QQ等级 */
  qqLevel?: number
  /** QQ等级 */
  level?: number
  /** 是否为 VIP 用户 */
  is_vip?: boolean
  /** 是否为年费 VIP 用户 */
  is_years_vip?: boolean
  /** VIP 等级 */
  vip_level?: number
}

/**
 * OneBot 群组信息接口
 */
export interface OneBotGroupInfo {
  /** 群组 ID */
  group_id: number
  /** 群组名称 */
  group_name: string
  /** 群组备注 */
  group_remark?: string
  /** 成员数量 */
  member_count: number
  /** 群组最大成员数 */
  max_member_count: number
}

/**
 * OneBot 请求处理类
 * 处理好友请求、群组请求和群成员请求
 */
export class OnebotRequest {
  private pendingRequests = new Map<string, { session: Session, type: RequestType }>();
  private requestNumberMap = new Map<number, string>();
  private nextRequestNumber = 1;

  /**
   * 创建 OneBot 请求处理实例
   * @param ctx - Koishi 上下文
   * @param logger - 日志记录器
   * @param config - 配置项
   */
  constructor(
    private ctx: Context,
    private logger: Logger,
    private config: Config = {},
  ) {}

  /**
   * 处理收到的请求
   * @param session - Koishi 会话
   * @param type - 请求类型
   * @returns 处理请求的 Promise
   */
  public async processRequest(session: Session, type: RequestType): Promise<void> {
    const requestId = `${type}:${session.userId}:${session.guildId || 'none'}`;
    const requestMode = this.config[`${type}Request`] as Request || 'reject';
    let notified = false;
    try {
      notified = await this.setupNotification(session, type, requestId, requestMode === 'manual');
      if (requestMode === 'auto') {
        const result = await this.shouldAutoAccept(session, type);
        await this.processRequestAction(
          session, type, result === true,
          typeof result === 'string' ? result : '条件不符'
        );
      } else if (requestMode === 'manual' && notified) {
        return;
      } else {
        await this.processRequestAction(
          session, type, requestMode === 'accept',
          requestMode === 'manual' && !notified ? '通知失败，已自动处理' : ''
        );
      }
    } catch (error) {
      this.logger.error(`处理请求${requestId}失败: ${error}`);
      try {
        await this.processRequestAction(session, type, false, '处理出错');
      } catch {}
    } finally {
      this.cleanupRequest(requestId);
    }
  }

  /**
   * 清理请求数据
   * @param requestId - 请求 ID
   */
  private cleanupRequest(requestId: string): void {
    this.pendingRequests.delete(requestId);
    for (const [num, id] of this.requestNumberMap.entries()) {
      if (id === requestId) this.requestNumberMap.delete(num);
    }
  }

  /**
   * 检查用户条件是否满足自动接受要求
   * @param session - Koishi 会话
   * @param regTimeLimit - 注册时间要求（年数，-1表示不检查）
   * @param levelLimit - QQ等级要求（-1表示不检查）
   * @param vipLevelLimit - VIP等级要求（-1表示不检查）
   * @returns 是否满足条件，如不满足返回原因
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
      if (regTimeLimit >= 0) {
        const regTime = userInfo.reg_time || userInfo.regTime || 0;
        const regYear = regTime > 0 ? new Date(regTime * 1000).getFullYear() : new Date().getFullYear();
        if (new Date().getFullYear() - regYear < regTimeLimit) return `注册时间不满${regTimeLimit}年`;
      }
      if (levelLimit >= 0 && (userInfo.level || userInfo.qqLevel || 0) < levelLimit)
        return `QQ等级低于${levelLimit}级`;
      if (vipLevelLimit >= 0 && (!userInfo.is_vip || (userInfo.vip_level || 0) < vipLevelLimit))
        return `会员等级低于${vipLevelLimit}级`;
      return true;
    } catch (error) {
      return `获取用户信息失败: ${error}`;
    }
  }

  /**
   * 判断是否应自动接受请求
   * @param session - Koishi 会话
   * @param type - 请求类型
   * @returns 是否接受，如不接受返回原因
   */
  private async shouldAutoAccept(session: Session, type: RequestType): Promise<boolean | string> {
    if (type === 'friend' || type === 'member') {
      const configPrefix = type === 'friend' ? 'Friend' : 'Member';
      return this.checkUserConditions(
        session,
        this.config[`${configPrefix}RegTime`] ?? -1,
        this.config[`${configPrefix}Level`] ?? -1,
        this.config[`${configPrefix}VipLevel`] ?? -1
      );
    }
    if (type === 'guild') {
      const { GuildAllowUsers = [], GuildMinMemberCount = -1, GuildMaxCapacity = -1 } = this.config;
      if (GuildAllowUsers.includes(session.userId)) return true;
      let user;
      try {
        user = await this.ctx.database.getUser(session.platform, session.userId);
      } catch {}
      if (user?.authority > 1) return true;
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
   * 处理请求操作（接受或拒绝）
   * @param session - Koishi 会话
   * @param type - 请求类型
   * @param approve - 是否接受请求
   * @param reason - 拒绝原因
   * @param remark - 好友备注（仅适用于好友请求）
   * @returns 处理是否成功
   */
  private async processRequestAction(
    session: Session,
    type: RequestType,
    approve: boolean,
    reason = '',
    remark = ''
  ): Promise<boolean> {
    try {
      const eventData = session.event?._data || {};
      if (!approve && type === 'guild' &&
          (session.event?.type === 'guild-added' || eventData.notice_type === 'group_increase')) {
        if (reason) {
          await session.bot.sendMessage(session.guildId, `机器人将退出该群${reason}`)
        }
        try {
          await session.onebot.setGroupLeave(Number(session.guildId), false);
          return true;
        } catch (error) {
          this.logger.error(`退出群组 ${session.guildId} 失败: ${error}`);
          return false;
        }
      }
      const flag = eventData.flag;
      if (!flag) {
        return false;
      }
      if (type === 'friend') {
        await session.onebot.setFriendAddRequest(flag, approve, remark);
      } else {
        const subType = eventData.sub_type ?? 'add';
        await session.onebot.setGroupAddRequest(flag, subType, approve, approve ? '' : reason);
      }
      return true;
    } catch (error) {
      this.logger.error(`请求处理失败: ${error}`);
      return false;
    }
  }

  /**
   * 设置通知
   * @param session - Koishi 会话
   * @param type - 请求类型
   * @param requestId - 请求 ID
   * @param isManualMode - 是否为手动处理模式
   * @returns 通知是否成功发送
   */
  private async setupNotification(
    session: Session,
    type: RequestType,
    requestId: string,
    isManualMode: boolean
  ): Promise<boolean> {
    const { enableNotify = false, notifyTarget = '' } = this.config;
    if (!enableNotify || !notifyTarget) return false;
    const [targetType, targetId] = notifyTarget.split(':');
    const normalizedType = targetType?.toLowerCase();
    if (!targetId || (normalizedType !== 'guild' && normalizedType !== 'private')) {
      this.logger.warn(`通知目标错误: ${notifyTarget}`);
      return false;
    }
    try {
      const requestNumber = this.nextRequestNumber++;
      this.requestNumberMap.set(requestNumber, requestId);
      const isPrivate = normalizedType === 'private';
      const eventData = session.event?._data || {};
      let user: any = null, guild: any = null, operator: any = null;
      try {
        user = await session.bot.getUser?.(session.userId)?.catch(() => null) ?? null;
        if (type !== 'friend') {
          guild = await session.bot.getGuild?.(session.guildId)?.catch(() => null) ?? null;
        }
        if (type === 'guild') {
          const operatorId = eventData.operator_id;
          if (operatorId && operatorId !== session.userId) {
            operator = await session.bot.getUser?.(operatorId.toString())?.catch(() => null) ?? null;
          }
        }
      } catch {}
      let message = `时间：${new Date().toLocaleString()}\n`;
      if (session.userId) message += `用户：${user?.name ? `${user.name}(${session.userId})` : session.userId}\n`;
      if (type === 'friend') {
        message += `类型：好友申请\n`;
        if (user?.avatar) message += `<image url="${user.avatar}"/>\n`;
        if (eventData.comment) message += `验证信息：${eventData.comment}\n`;
      } else {
        if (session.guildId) message += `群组：${guild?.name ? `${guild.name}(${session.guildId})` : session.guildId}\n`;
        if (type === 'guild') {
          if (eventData.sub_type)
            message += `类型：${eventData.sub_type === 'invite' ? '群邀请' : '直接入群'}\n`;
          const operatorId = eventData.operator_id;
          if (operatorId && operatorId !== session.userId)
            message += `操作者：${operator?.name ? `${operator.name}(${operatorId})` : operatorId}\n`;
        } else if (type === 'member') {
          message += `类型：加群请求\n`;
          if (eventData.comment) message += `💬 验证信息：${eventData.comment}\n`;
        }
      }
      const requestMode = this.config[`${type}Request`] as Request || 'reject';
      message += `处理模式：${isManualMode ? '人工审核' :
                  requestMode === 'auto' ? '自动审核' :
                  requestMode === 'accept' ? '自动通过' : '自动拒绝'}\n`;
      const sendFunc = isPrivate ?
        (msg) => session.bot.sendPrivateMessage(targetId, msg) :
        (msg) => session.bot.sendMessage(targetId, msg);
      await sendFunc(message);
      if (isManualMode) {
        this.pendingRequests.set(requestId, { session, type });
        this.setupPromptResponse(session, type, requestId, requestNumber, targetId, isPrivate);
      }
      return true;
    } catch (error) {
      this.logger.error(`通知发送失败: ${error}`);
      return false;
    }
  }

  /**
   * 使用临时中间件处理人工审核响应
   */
  private async setupPromptResponse(
    session: Session,
    type: RequestType,
    requestId: string,
    requestNumber: number,
    targetId: string,
    isPrivate: boolean
  ) {
    const helpMsg = `请回复以下命令处理请求 #${requestNumber}：\n通过[y]${requestNumber} [备注] | 拒绝[n]${requestNumber} [理由]`;
    const sendFunc = isPrivate
      ? (msg) => session.bot.sendPrivateMessage(targetId, msg)
      : (msg) => session.bot.sendMessage(targetId, msg);
    await sendFunc(helpMsg);
    let disposed = false;
    const disposer = this.ctx.middleware(async (s, next) => {
      if (disposed) return next();
      if (s.userId !== targetId && s.guildId !== targetId) return next();
      const match = s.content.trim().match(new RegExp(`^(y|n|通过|拒绝)(${requestNumber})\\s*(.*)$`));
      if (!match) return next();
      disposed = true;
      disposer();
      const isApprove = match[1] === 'y' || match[1] === '通过';
      const extraContent = match[3]?.trim() || '';
      this.cleanupRequest(requestId);
      try {
        await this.processRequestAction(
          session,
          type,
          isApprove,
          !isApprove ? extraContent : '',
          isApprove && type === 'friend' ? extraContent : ''
        );
        await sendFunc(`请求 #${requestNumber} 已${isApprove ? '通过' : '拒绝'}${
          extraContent ? `，${isApprove ? '备注' : '原因'}：${extraContent}` : ''}`);
      } catch (error) {
        this.logger.error(`响应处理失败: ${error}`);
        await sendFunc(`处理请求 #${requestNumber} 失败: ${error.message || '未知错误'}`);
      }
    });
    const timeoutMin = typeof this.config.manualTimeout === 'number' ? this.config.manualTimeout : 60;
    const timeoutAction = (this.config.manualTimeoutAction === 'accept' || this.config.manualTimeoutAction === 'reject')
      ? this.config.manualTimeoutAction : 'reject';
    if (timeoutMin > 0) {
      setTimeout(async () => {
        if (disposed) return;
        disposed = true;
        disposer();
        this.cleanupRequest(requestId);
        try {
          await this.processRequestAction(
            session,
            type,
            timeoutAction === 'accept',
            timeoutAction === 'reject' ? '请求处理超时，已自动拒绝' : '',
          );
        } catch (e) {
          this.logger.error(`超时处理失败: ${e}`);
        }
        await sendFunc(`请求 #${requestNumber} 超时，已自动${timeoutAction === 'accept' ? '通过' : '拒绝'}`);
      }, timeoutMin * 60 * 1000);
    }
  }

  /**
   * 注册事件监听器
   * 监听好友请求、群组请求和群成员请求事件
   */
  public registerEventListeners(): void {
    const handleRequest = (type: RequestType) => async (session: Session) => {
      const data = session.event?._data || {};
      session.userId = (data.user_id || data.userId || session.userId)?.toString();
      if (type !== 'friend') {
        session.guildId = (data.group_id || data.groupId || session.guildId)?.toString() || '';
      }
      await this.processRequest(session, type);
    };

    this.ctx.on('friend-request', handleRequest('friend'));
    this.ctx.on('guild-request', handleRequest('guild'));
    this.ctx.on('guild-member-request', handleRequest('member'));
    this.ctx.on('guild-added', handleRequest('guild'));
  }
}