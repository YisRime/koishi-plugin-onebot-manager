import { Context, Logger, Session } from 'koishi'
import { Config } from './index'

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
  /** QQ等级 */
  level?: number
}

/**
 * OneBot 群组信息接口
 */
export interface OneBotGroupInfo {
  /** 群组 ID */
  group_id: number
  /** 群组名称 */
  group_name: string
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
   * 发送群成员变动通知
   */
  private async sendGuildMemberUpdateMessage(session: Session, messageTemplate: string): Promise<void> {
    if (!messageTemplate || !messageTemplate.trim()) return;
    try {
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
      this.logger.error('发送群成员变动通知失败:', error);
    }
  }

  /**
   * 处理机器人被踢或主动退群事件
   */
  private async handleBotRemoved(session: Session): Promise<void> {
    const { notifyTarget = '' } = this.config;
    if (!notifyTarget) return;
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
   * 清理并取消一个活动中的请求
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
   */
  public async processRequest(session: Session, type: RequestType): Promise<void> {
    const requestKey = type === 'friend' ? `friend:${session.userId}` : type === 'guild' ? `guild:${session.guildId}` : `member:${session.userId}:${session.guildId}`;
    this.cleanupActiveRequest(requestKey);
    try {
      if ((await this.shouldAutoAccept(session, type)) === true) {
        await this.processRequestAction(session, type, true);
      } else {
        await this.setupNotification(session, type, requestKey);
      }
    } catch (error) {
      this.logger.error(`处理请求 ${requestKey} 失败: ${error}`);
    }
  }

  /**
   * 判断是否应自动接受请求
   */
  private async shouldAutoAccept(session: Session, type: RequestType): Promise<boolean | string> {
    const validationMessage = session.event?._data?.comment || '';
    if (type === 'member') {
      const { MemberRequestAutoRules = [] } = this.config;
      const rule = MemberRequestAutoRules.find(r => r.guildId === session.guildId);
      if (!rule) return false;
      if (rule.keyword) {
        try {
          if (new RegExp(rule.keyword).test(validationMessage)) return true;
        } catch (e) {
          this.logger.warn(`群 ${rule.guildId} 正则无效: ${rule.keyword}`);
        }
      }
      if (rule.minLevel >= 0) {
        try {
          const userInfo = await session.onebot.getStrangerInfo(Number(session.userId), false) as OneBotUserInfo;
          if ((userInfo.level || 0) < rule.minLevel) return `QQ 等级低于${rule.minLevel}级`;
          return true;
        } catch (error) {
          return `获取用户信息失败: ${error}`;
        }
      }
    }
    if (type === 'friend') {
      const { FriendRequestAutoRegex, FriendLevel = -1 } = this.config;
      if (FriendRequestAutoRegex) {
        try {
          if (new RegExp(FriendRequestAutoRegex).test(validationMessage)) return true;
        } catch (e) {
          this.logger.warn(`好友申请正则无效: ${FriendRequestAutoRegex}`);
        }
      }
      if (FriendLevel < 0) return false;
      try {
        const userInfo = await session.onebot.getStrangerInfo(Number(session.userId), false) as OneBotUserInfo;
        if ((userInfo.level || 0) < FriendLevel) return `QQ 等级低于${FriendLevel}级`;
        return true;
      } catch (error) {
        return `获取用户信息失败: ${error}`;
      }
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
   * 设置通知、响应监听和超时回退
   */
  private async setupNotification(session: Session, type: RequestType, requestId: string): Promise<void> {
    const requestNumber = this.nextRequestNumber++;
    this.requestNumberMap.set(requestNumber, requestId);
    const activeRequest: ActiveRequest = { session, type, requestNumber };
    this.activeRequests.set(requestId, activeRequest);
    const timeoutMin = typeof this.config.manualTimeout === 'number' ? this.config.manualTimeout : 60;
    if (timeoutMin > 0) {
      const timeoutAction = this.config.manualTimeoutAction || 'reject';
      activeRequest.timeoutTimer = setTimeout(async () => {
        const currentRequest = this.activeRequests.get(requestId);
        if (!currentRequest) return;
        this.cleanupActiveRequest(requestId);
        try {
          await this.processRequestAction(currentRequest.session, currentRequest.type, timeoutAction === 'accept', timeoutAction === 'reject' ? '请求处理超时，已自动拒绝' : '');
          const { notifyTarget = '' } = this.config;
          if (notifyTarget) {
            const [targetType, targetId] = notifyTarget.split(':');
            const sendFunc = targetType === 'private'
              ? (m) => session.bot.sendPrivateMessage(targetId, m)
              : (m) => session.bot.sendMessage(targetId, m);
            await sendFunc(`请求 #${requestNumber} 超时，已自动${timeoutAction === 'accept' ? '通过' : '拒绝'}`);
          }
        } catch (e) {
          this.logger.error(`请求 #${requestNumber} 超时处理失败: ${e}`);
        }
      }, timeoutMin * 60 * 1000);
    }

    try {
      const { notifyTarget = '' } = this.config;
      const [targetType, targetId] = notifyTarget.split(':');
      if (!targetId || (targetType !== 'guild' && targetType !== 'private')) {
        this.logger.warn(`通知目标错误: ${notifyTarget}`);
        return;
      }
      const eventData = session.event?._data || {};
      const user = await session.bot.getUser?.(session.userId)?.catch(() => null) ?? null;
      const guild = type !== 'friend' ? await session.bot.getGuild?.(session.guildId)?.catch(() => null) ?? null : null;
      const operator = type === 'guild' && eventData.operator_id && eventData.operator_id !== session.userId
        ? await session.bot.getUser?.(eventData.operator_id.toString())?.catch(() => null) ?? null : null;
      const msgLines = [];
      if (user?.avatar) msgLines.push(`<image url="${user.avatar}"/>`);
      msgLines.push(`类型：${type === 'friend' ? '好友申请' : type === 'member' ? '加群请求' : eventData.sub_type === 'invite' ? '群邀请' : '直接入群'}`);
      if (session.userId && !(type === 'guild' && eventData.sub_type !== 'invite' && session.userId === session.selfId)) {
        msgLines.push(`用户：${user?.name ? `${user.name}(${session.userId})` : session.userId}`);
      }
      if (operator) msgLines.push(`操作者：${operator.name ? `${operator.name}(${eventData.operator_id})` : eventData.operator_id}`);
      if (guild) msgLines.push(`群组：${guild.name ? `${guild.name}(${session.guildId})` : session.guildId}`);
      if (eventData.comment) msgLines.push(`验证信息：${eventData.comment}`);
      const sendFunc = targetType === 'private'
        ? (m) => session.bot.sendPrivateMessage(targetId, m)
        : (m) => session.bot.sendMessage(targetId, m);
      await sendFunc(msgLines.join('\n'));
      await sendFunc(`请回复以下命令处理请求 #${requestNumber}：\n通过[y/ya]${requestNumber} [备注] | 拒绝[n/na]${requestNumber} [理由]`);
      activeRequest.disposer = this.ctx.middleware(async (s, next) => {
        if (activeRequest.disposer && (targetType === 'private' ? s.userId !== targetId : s.guildId !== targetId)) return next();
        const bulkMatch = s.content.trim().match(/^(ya|na|全部同意|全部拒绝)\s*(.*)$/);
        if (bulkMatch && this.activeRequests.size > 0) {
            const requestsToProcess = [...this.activeRequests.values()];
            this.activeRequests.clear();
            this.requestNumberMap.clear();
            const isApprove = bulkMatch[1] === 'ya' || bulkMatch[1] === '全部同意';
            const extraContent = bulkMatch[2]?.trim() || '';
            let successCount = 0;
            for (const req of requestsToProcess) {
                req.disposer?.();
                if (req.timeoutTimer) clearTimeout(req.timeoutTimer);
                try {
                    const reason = !isApprove ? extraContent : '';
                    const remark = isApprove && req.type === 'friend' ? extraContent : '';
                    await this.processRequestAction(req.session, req.type, isApprove, reason, remark);
                    successCount++;
                } catch (error) {
                    this.logger.error(`批量处理请求 #${req.requestNumber} 失败: ${error}`);
                }
            }
            if (successCount > 0) await sendFunc(`已批量${isApprove ? '通过' : '拒绝'} ${successCount} 个请求${extraContent ? `，理由/备注：${extraContent}` : ''}`);
            return;
        }
        const match = s.content.trim().match(new RegExp(`^(y|n|通过|拒绝)(${requestNumber})\\s*(.*)$`));
        if (!match) return next();
        this.cleanupActiveRequest(requestId);
        const isApprove = match[1] === 'y' || match[1] === '通过';
        const extraContent = match[3]?.trim() || '';
        try {
          await this.processRequestAction(session, type, isApprove, !isApprove ? extraContent : '', isApprove && type === 'friend' ? extraContent : '');
          await sendFunc(`请求 #${requestNumber} 已${isApprove ? '通过' : '拒绝'}${extraContent ? `，${isApprove ? '备注' : '原因'}：${extraContent}` : ''}`);
        } catch (error) {
          this.logger.error(`响应处理失败: ${error}`);
          await sendFunc(`处理请求 #${requestNumber} 失败: ${error.message}`);
        }
      });
    } catch (error) {
      this.logger.error(`发送请求 #${requestNumber} 审核通知失败: ${error}`);
    }
  }

  /**
   * 注册事件监听器
   */
  public registerEventListeners(): void {
    if (this.config.enable) {
      const handleRequest = (type: RequestType) => async (session: Session) => {
        const data = session.event?._data || {};
        session.userId = data.user_id?.toString();
        if (type !== 'friend') session.guildId = data.group_id?.toString() || '';
        await this.processRequest(session, type);
      };
      this.ctx.on('friend-request', handleRequest('friend'));
      this.ctx.on('guild-request', handleRequest('guild'));
      this.ctx.on('guild-member-request', handleRequest('member'));
      this.ctx.on('guild-added', handleRequest('guild'));
    }
    if (this.config.enableJoin) {
      this.ctx.on('guild-member-added', (session) => this.sendGuildMemberUpdateMessage(session, this.config.joinMessage));
    }
    if (this.config.enableLeave) {
      this.ctx.on('guild-member-removed', (session) => this.sendGuildMemberUpdateMessage(session, this.config.leaveMessage));
    }
    if (this.config.enableKick) this.ctx.on('guild-removed', this.handleBotRemoved.bind(this));
  }
}
