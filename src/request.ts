import { Context, Logger, Session } from 'koishi'
import { Config } from './index'

/**
 * 请求处理模式
 * - accept: 自动接受
 * - reject: 自动拒绝
 * - manual: 人工审核
 * - auto: 条件自动审核
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

interface ActiveRequest {
  session: Session;
  type: RequestType;
  requestNumber: number;
  disposer?: () => void;
  timeoutTimer?: NodeJS.Timeout;
}

/**
 * OneBot 请求处理类
 * 处理好友请求、群组请求和群成员请求
 */
export class OnebotRequest {
  private requestNumberMap = new Map<number, string>();
  private nextRequestNumber = 1;
  private activeRequests = new Map<string, ActiveRequest>();

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
   * 处理入群事件
   */
  private async handleMemberAdded(session: Session): Promise<void> {
    try {
      const messageTemplate = this.config.joinMessage;
      const user = await session.bot.getUser(session.userId).catch(() => null);
      const guild = await session.bot.getGuild(session.guildId).catch(() => null);
      const replacements = {
        '{userName}': user?.name || session.userId,
        '{userId}': session.userId,
        '{guildName}': guild?.name || session.guildId,
        '{guildId}': session.guildId,
      };
      const regex = new RegExp(Object.keys(replacements).join('|'), 'g');
      const message = messageTemplate.replace(regex, (match) => replacements[match]);
      if (message.trim()) await session.bot.sendMessage(session.guildId, message);
    } catch (error) {
      this.logger.error('发送入群欢迎失败:', error);
    }
  }

  /**
   * 处理退群事件
   */
  private async handleMemberRemoved(session: Session): Promise<void> {
    try {
      const user = await session.bot.getUser(session.userId).catch(() => null);
      const guild = await session.bot.getGuild(session.guildId).catch(() => null);
      const customMessageTemplate = this.config.leaveMessage;
      if (customMessageTemplate && customMessageTemplate.trim()) {
        const replacements = {
          '{userName}': user?.name || session.userId,
          '{userId}': session.userId,
          '{guildName}': guild?.name || session.guildId,
          '{guildId}': session.guildId,
        };
        const regex = new RegExp(Object.keys(replacements).join('|'), 'g');
        const message = customMessageTemplate.replace(regex, (match) => replacements[match]);
        if (message.trim()) await session.bot.sendMessage(session.guildId, message);
      }
    } catch (error) {
      this.logger.error('发送退群提示失败:', error);
    }
  }

  /**
   * 处理机器人被踢或主动退群事件
   */
  private async handleBotRemoved(session: Session): Promise<void> {
    const { enableNotify = false, notifyTarget = '' } = this.config;
    if (!enableNotify || !notifyTarget) return;
    const [targetType, targetId] = notifyTarget.split(':');
    if (!targetId || (targetType !== 'guild' && targetType !== 'private')) {
      this.logger.warn(`通知目标错误: ${notifyTarget}`);
      return;
    }
    try {
      const subType = session.event?._data?.sub_type;
      const operatorId = session.event.operator?.id || session.event?._data?.operator_id;
      const guildId = session.guildId;
      const guild = await session.bot.getGuild(guildId).catch(() => null);
      const guildIdentifier = guild?.name ? `${guild.name}(${guildId})` : guildId;
      let msg = '';
      if (subType === 'kick_me' && operatorId) {
        const operator = await session.bot.getUser(operatorId.toString()).catch(() => null);
        const operatorIdentifier = operator?.name ? `${operator.name}(${operatorId})` : operatorId;
        msg = `已被 ${operatorIdentifier} 踢出群组 ${guildIdentifier}`;
      } else {
        msg = `已退出群组 ${guildIdentifier}`;
      }
      const sendFunc = targetType === 'private'
        ? (m) => session.bot.sendPrivateMessage(targetId, m)
        : (m) => session.bot.sendMessage(targetId, m);
      await sendFunc(msg);
    } catch (error) {
      this.logger.error(`发送被踢/退群通知失败:`, error);
    }
  }


  /**
   * 生成请求的唯一键
   * @param session - Koishi 会话
   * @param type - 请求类型
   * @returns 请求唯一键
   */
  private getRequestKey(session: Session, type: RequestType): string {
    return type === 'friend' ? `friend:${session.userId}` : type === 'guild' ? `guild:${session.guildId}` : `member:${session.userId}:${session.guildId}`;
  }

  /**
   * 清理并取消一个活动中的请求
   * @param requestKey - 请求唯一键
   */
  private cleanupActiveRequest(requestKey: string): void {
    const activeRequest = this.activeRequests.get(requestKey);
    if (!activeRequest) return;
    activeRequest.disposer?.();
    if (activeRequest.timeoutTimer) clearTimeout(activeRequest.timeoutTimer);
    this.requestNumberMap.delete(activeRequest.requestNumber);
    this.activeRequests.delete(requestKey);
  }

  /**
   * 处理收到的请求
   * @param session - Koishi 会话
   * @param type - 请求类型
   */
  public async processRequest(session: Session, type: RequestType): Promise<void> {
    const requestKey = this.getRequestKey(session, type);
    this.cleanupActiveRequest(requestKey);
    const requestMode = this.config[`${type}Request`] as Request || 'reject';
    const needsNotification = requestMode === 'manual' || requestMode === 'auto';
    let notificationSent = false;
    try {
      if (needsNotification) notificationSent = await this.setupNotification(session, type, requestKey, requestMode === 'manual');
      if (requestMode === 'manual' && notificationSent) return;
      let approve = false;
      let reason = '';
      if (requestMode === 'accept') {
        approve = true;
      } else if (requestMode === 'auto') {
        const result = await this.shouldAutoAccept(session, type);
        approve = result === true;
        reason = typeof result === 'string' ? result : '条件不符';
      } else if (requestMode === 'manual' && !notificationSent) {
        reason = '通知失败，已自动拒绝';
      }
      await this.processRequestAction(session, type, approve, reason);
    } catch (error) {
      this.logger.error(`处理请求${requestKey}失败: ${error}`);
      try {
        await this.processRequestAction(session, type, false, '处理出错');
      } catch {}
    } finally {
      if (requestMode !== 'manual' || !notificationSent) this.cleanupActiveRequest(requestKey);
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
  private async checkUserConditions(session: Session, regTimeLimit = -1, levelLimit = -1, vipLevelLimit = -1): Promise<boolean | string> {
    if (regTimeLimit < 0 && levelLimit < 0 && vipLevelLimit < 0) return false;
    try {
      const userInfo = await session.onebot.getStrangerInfo(Number(session.userId), false) as OneBotUserInfo;
      const regTime = userInfo.reg_time || userInfo.regTime || 0;
      const regYear = regTime > 0 ? new Date(regTime * 1000).getFullYear() : new Date().getFullYear();
      if (regTimeLimit >= 0 && new Date().getFullYear() - regYear < regTimeLimit) return `注册时间不满${regTimeLimit}年`;
      if (levelLimit >= 0 && (userInfo.level || userInfo.qqLevel || 0) < levelLimit) return `QQ等级低于${levelLimit}级`;
      if (vipLevelLimit >= 0 && (!userInfo.is_vip || (userInfo.vip_level || 0) < vipLevelLimit)) return `会员等级低于${vipLevelLimit}级`;
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
    if (type === 'member') {
      const { MemberRequestAutoRules = [], MemberRegTime = -1, MemberLevel = -1, MemberVipLevel = -1 } = this.config;
      const groupRules = MemberRequestAutoRules.filter(r => r.groupId === session.guildId && r.keyword);
      if (groupRules.length > 0) {
        const validationMessage = session.event?._data?.comment || '';
        if (validationMessage) {
          for (const rule of groupRules) {
            try {
              const regex = new RegExp(rule.keyword);
              if (regex.test(validationMessage)) return true;
            } catch (e) {
              this.logger.warn(`群 ${rule.groupId} 正则无效: ${rule.keyword}`);
            }
          }
        }
        return '验证信息不符';
      }
      return this.checkUserConditions(session, MemberRegTime, MemberLevel, MemberVipLevel);
    }
    if (type === 'friend') {
      return this.checkUserConditions(
        session, this.config.FriendRegTime ?? -1,
        this.config.FriendLevel ?? -1, this.config.FriendVipLevel ?? -1
      );
    }
    if (type === 'guild') {
      const { GuildAllowUsers = [], GuildMinMemberCount = -1, GuildMaxCapacity = -1 } = this.config;
      if (GuildAllowUsers.includes(session.userId)) return true;
      let user;
      try { user = await this.ctx.database.getUser(session.platform, session.userId); } catch {}
      if (user?.authority > 1) return true;
      if (GuildMinMemberCount >= 0 || GuildMaxCapacity >= 0) {
        try {
          const info = await session.onebot.getGroupInfo(Number(session.guildId), true) as OneBotGroupInfo;
          if (GuildMinMemberCount >= 0 && info.member_count < GuildMinMemberCount) return `群成员数量不足${GuildMinMemberCount}人`;
          if (GuildMaxCapacity >= 0 && info.max_member_count < GuildMaxCapacity) return `群最大容量不足${GuildMaxCapacity}人`;
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
  private async processRequestAction(session: Session, type: RequestType, approve: boolean, reason = '', remark = ''): Promise<boolean> {
    try {
      const eventData = session.event?._data || {};
      if (!approve && type === 'guild' && (session.event?.type === 'guild-added' || eventData.notice_type === 'group_increase')) {
        if (reason) {
          try {
            await session.bot.sendMessage(session.guildId, `将退出该群 ${reason}`);
          } catch (error) {
            this.logger.warn(`发送退群通知失败: ${error}`);
          }
        }
        try { await session.onebot.setGroupLeave(Number(session.guildId), false); return true; }
        catch (error) { this.logger.error(`退出群组 ${session.guildId} 失败: ${error}`); return false; }
      }
      const flag = eventData.flag;
      if (!flag) return false;
      if (type === 'friend') await session.onebot.setFriendAddRequest(flag, approve, remark);
      else await session.onebot.setGroupAddRequest(flag, eventData.sub_type ?? 'add', approve, approve ? '' : reason);
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
   */
  private async setupNotification(session: Session, type: RequestType, requestId: string, isManualMode: boolean): Promise<boolean> {
    const { enableNotify = false, notifyTarget = '' } = this.config;
    if (!enableNotify || !notifyTarget) return false;
    const [targetType, targetId] = notifyTarget.split(':');
    if (!targetId || (targetType !== 'guild' && targetType !== 'private')) {
      this.logger.warn(`通知目标错误: ${notifyTarget}`);
      return false;
    }
    const requestNumber = this.nextRequestNumber++;
    this.requestNumberMap.set(requestNumber, requestId);
    this.activeRequests.set(requestId, { session, type, requestNumber });
    try {
      const eventData = session.event?._data || {};
      let user = null, guild = null, operator = null;
      user = await session.bot.getUser?.(session.userId)?.catch(() => null) ?? null;
      if (type !== 'friend') guild = await session.bot.getGuild?.(session.guildId)?.catch(() => null) ?? null;
      if (type === 'guild' && eventData.operator_id && eventData.operator_id !== session.userId) {
        operator = await session.bot.getUser?.(eventData.operator_id.toString())?.catch(() => null) ?? null;
      }
      const isDirectBotJoin = type === 'guild' && eventData.sub_type !== 'invite' && session.userId === session.selfId;
      let msg = user?.avatar ? `<image url="${user.avatar}"/>\n` : '';
      msg += `类型：${type === 'friend' ? '好友申请' : type === 'member' ? '加群请求' :
              eventData.sub_type === 'invite' ? '群邀请' : '直接入群'}\n`;
      if (session.userId && !isDirectBotJoin) msg += `用户：${user?.name ? `${user.name}(${session.userId})` : session.userId}\n`;
      if (type === 'guild' && eventData.operator_id && eventData.operator_id !== session.userId) msg += `操作者：${operator?.name ? `${operator.name}(${eventData.operator_id})` : eventData.operator_id}\n`;
      if (type !== 'friend' && session.guildId) msg += `群组：${guild?.name ? `${guild.name}(${session.guildId})` : session.guildId}\n`;
      if (eventData.comment) msg += `验证信息：${eventData.comment}\n`;
      const requestMode = this.config[`${type}Request`] as Request || 'reject';
      msg += `处理模式：${isManualMode ? '人工审核' : requestMode === 'auto' ? '自动审核' :
              requestMode === 'accept' ? '自动通过' : '自动拒绝'}\n`;
      const sendFunc = targetType === 'private'
        ? (m) => session.bot.sendPrivateMessage(targetId, m)
        : (m) => session.bot.sendMessage(targetId, m);
      await sendFunc(msg);
      if (isManualMode) this.setupPromptResponse(requestId, requestNumber, targetId, targetType === 'private');
      return true;
    } catch (error) {
      this.logger.error(`发送请求通知失败:`, error);
      return false;
    }
  }

  /**
   * 设置人工审核响应监听
   */
  private async setupPromptResponse(requestId: string, requestNumber: number, targetId: string, isPrivate: boolean) {
    const activeRequest = this.activeRequests.get(requestId);
    if (!activeRequest) return;

    const { session, type } = activeRequest;
    const sendFunc = isPrivate
      ? (msg) => session.bot.sendPrivateMessage(targetId, msg)
      : (msg) => session.bot.sendMessage(targetId, msg);
    await sendFunc(`请回复以下命令处理请求 #${requestNumber}：\n通过[y]${requestNumber} [备注] | 拒绝[n]${requestNumber} [理由]`);
    let disposed = false;
    const disposer = this.ctx.middleware(async (s, next) => {
      if (disposed || (isPrivate ? s.userId !== targetId : s.guildId !== targetId)) return next();
      const match = s.content.trim().match(new RegExp(`^(y|n|通过|拒绝)(${requestNumber})\\s*(.*)$`));
      if (!match) return next();
      disposed = true;
      this.cleanupActiveRequest(requestId);
      const isApprove = match[1] === 'y' || match[1] === '通过';
      const extraContent = match[3]?.trim() || '';
      try {
        await this.processRequestAction(session, type, isApprove,
          !isApprove ? extraContent : '', isApprove && type === 'friend' ? extraContent : '');
        await sendFunc(`请求 #${requestNumber} 已${isApprove ? '通过' : '拒绝'}${extraContent ?
          `，${isApprove ? '备注' : '原因'}：${extraContent}` : ''}`);
      } catch (error) {
        this.logger.error(`响应处理失败: ${error}`);
        await sendFunc(`处理请求 #${requestNumber} 失败: ${error.message || '未知错误'}`);
      }
    });
    activeRequest.disposer = disposer;
    const timeoutMin = typeof this.config.manualTimeout === 'number' ? this.config.manualTimeout : 60;
    if (timeoutMin > 0) {
      const timeoutAction = (this.config.manualTimeoutAction === 'accept' || this.config.manualTimeoutAction === 'reject')
        ? this.config.manualTimeoutAction : 'reject';
      activeRequest.timeoutTimer = setTimeout(async () => {
        if (disposed) return;
        disposed = true;

        this.cleanupActiveRequest(requestId);
        try {
          await this.processRequestAction(session, type, timeoutAction === 'accept',
            timeoutAction === 'reject' ? '请求处理超时，已自动拒绝' : '');
          await sendFunc(`请求 #${requestNumber} 超时，已自动${timeoutAction === 'accept' ? '通过' : '拒绝'}`);
        } catch (e) {
          this.logger.error(`超时处理失败: ${e}`);
        }
      }, timeoutMin * 60 * 1000);
    }
  }

  /**
   * 注册事件监听器，自动处理 OneBot 请求和成员变动事件
   */
  public registerEventListeners(): void {
    if (this.config.enable) {
      const handleRequest = (type: RequestType) => async (session: Session) => {
        const data = session.event?._data || {};
        session.userId = (data.user_id || data.userId || session.userId)?.toString();
        if (type !== 'friend') session.guildId = (data.group_id || data.groupId || session.guildId)?.toString() || '';
        await this.processRequest(session, type);
      };
      this.ctx.on('friend-request', handleRequest('friend'));
      this.ctx.on('guild-request', handleRequest('guild'));
      this.ctx.on('guild-member-request', handleRequest('member'));
      this.ctx.on('guild-added', handleRequest('guild'));
    }
    if (this.config.enableJoin) this.ctx.on('guild-member-added', this.handleMemberAdded.bind(this));
    if (this.config.enableLeave) this.ctx.on('guild-member-removed', this.handleMemberRemoved.bind(this));
    if (this.config.enableKick) this.ctx.on('guild-removed', this.handleBotRemoved.bind(this));
  }
}
