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

/**
 * OneBot请求处理类
 */
export class OnebotRequest {
  private processedGuildRequests = new Set<string>();

  constructor(
    private ctx: Context,
    private logger: Logger,
    private config: Config = {},
  ) {}

  /**
   * 获取特定类型请求的处理选项
   */
  private getRequest(type: RequestType): Request {
    const defaultMap: Record<RequestType, Request> = {
      friend: 'reject',
      guild: 'reject',
      member: 'reject'
    };
    return this.config[`${type}Request`] as Request || defaultMap[type];
  }

  /**
   * 检查用户信息是否满足条件
   */
  private async checkUserConditions(
    session: Session,
    regTimeLimit: number,
    levelLimit: number,
    vipLevelLimit: number
  ): Promise<boolean | string> {
    try {
      const userInfo = await session.onebot.getStrangerInfo(Number(session.userId), false) as OneBotUserInfo;
      // 检查注册时间
      if (regTimeLimit >= 0) {
        const regTime = userInfo.reg_time || userInfo.regTime || 0;
        const currentYear = new Date().getFullYear();
        const regYear = regTime > 0 ? new Date(regTime * 1000).getFullYear() : currentYear;
        const accountAgeYears = currentYear - regYear;
        if (accountAgeYears < regTimeLimit)
          return `账号注册时间不满${regTimeLimit}年`;
      }
      // 检查QQ等级
      if (levelLimit >= 0) {
        const level = userInfo.level || userInfo.qqLevel || 0;
        if (level < levelLimit)
          return `QQ等级低于${levelLimit}`;
      }
      // 检查会员等级
      if (vipLevelLimit >= 0) {
        const isVip = userInfo.is_vip === true;
        const vipLevel = userInfo.vip_level || 0;
        if (!isVip || vipLevel < vipLevelLimit)
          return `会员等级低于${vipLevelLimit}`;
      }
      return (regTimeLimit >= 0 || levelLimit >= 0 || vipLevelLimit >= 0) ? true : false;
    } catch (error) {
      return `获取用户信息失败: ${error}`;
    }
  }
  /**
   * 检查是否应该自动接受请求
   */
  private async shouldAutoAccept(session: Session, type: RequestType): Promise<boolean | string> {
    if (type === 'friend') {
      const { FriendRegTime = -1, FriendLevel = -1, FriendVipLevel = -1 } = this.config;
      return await this.checkUserConditions(session, FriendRegTime, FriendLevel, FriendVipLevel);
    }
    else if (type === 'member') {
      const { MemberRegTime = -1, MemberLevel = -1, MemberVipLevel = -1 } = this.config;
      return await this.checkUserConditions(session, MemberRegTime, MemberLevel, MemberVipLevel);
    }
    else if (type === 'guild') {
      const { GuildAllowUsers = [], GuildMinMemberCount = -1, GuildMaxCapacity = -1 } = this.config;
      // 检查白名单
      if (GuildAllowUsers.length > 0 && GuildAllowUsers.includes(session.userId))
        return true;
      // 检查权限
      try {
        const user = await this.ctx.database.getUser(session.platform, session.userId);
        if (user && user.authority > 1)
          return true;
      } catch {}
      // 检查群成员数量和容量限制
      if (GuildMinMemberCount >= 0 || GuildMaxCapacity >= 0) {
        try {
          const groupId = Number(session.guildId);
          const groupInfo = await session.onebot.getGroupInfo(groupId, true) as OneBotGroupInfo;
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
   */
  private async createNotificationMessage(session: Session, type: RequestType): Promise<string> {
    const user = await session.bot.getUser?.(session.userId)?.catch(() => null) ?? null;
    const userName = user?.name ?? '未知用户';
    let message = '';
    switch (type) {
      case 'friend': {
        const comment = session.event?._data?.comment ?? '';
        message = `收到来自${userName}[${session.userId}]的好友申请：\n`;
        if (user?.avatar) message += `<image url="${user.avatar}"/>\n`;
        if (comment) message += `验证信息：${comment}\n`;
        break;
      }
      case 'guild':
      case 'member': {
        const guild = await session.bot.getGuild?.(session.guildId)?.catch(() => null) ?? null;
        const guildName = guild?.name ?? '未知群组';
        const actionName = type === 'guild' ? '入群邀请' : '加群请求';
        message = `收到来自${userName}[${session.userId}]的${actionName}：\n群组：${guildName}[${session.guildId}]\n`;
        if (type === 'member' && session.event?._data?.comment) {
          message += `验证信息：${session.event._data.comment}\n`;
        }
        break;
      }
    }
    return message;
  }

  /**
   * 处理请求动作
   */
  private async processRequestAction(
    session: Session,
    type: RequestType,
    approve: boolean,
    reason = '',
    remark = ''
  ): Promise<boolean> {
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
   */
  private async setupNotification(session: Session, type: RequestType): Promise<boolean> {
    const { enableNotify = false, notifyTarget = '' } = this.config;
    if (!enableNotify || !notifyTarget) return false;
    const [targetType, targetId] = notifyTarget.split(':');
    if (!targetType || !targetId) {
      this.logger.warn(`通知目标错误: ${notifyTarget}`);
      return false;
    }
    const normalizedType = targetType.toLowerCase();
    if (normalizedType !== 'group' && normalizedType !== 'private') {
      this.logger.warn(`通知类型错误: ${targetType}`);
      return false;
    }
    try {
      const message = await this.createNotificationMessage(session, type);
      if (!message) return false;
      // 发送通知
      normalizedType === 'group'
        ? await session.bot.sendMessage(targetId, message)
        : await session.bot.sendPrivateMessage(targetId, message)
            .then(() => session.bot.sendPrivateMessage(targetId, `请回复 y/n [备注/理由] 来处理申请`));
      // 创建响应监听器
      const disposer = this.ctx.middleware(async (session2, next) => {
        const isRelevant = normalizedType === 'group'
          ? session2.channelId === targetId && !session2.content.startsWith('.')
          : session2.userId === targetId && session2.channelId.startsWith('private:');
        if (!isRelevant) return next();
        const content = session2.content.trim();
        const lowerContent = content.toLowerCase();
        const isApprove = lowerContent === 'y' || lowerContent.startsWith('y ');
        const isReject = lowerContent === 'n' || lowerContent.startsWith('n ');
        if (!isApprove && !isReject) return next();
        // 处理响应
        disposer();
        if (isApprove) {
          const remark = lowerContent.startsWith('y ') && type === 'friend' ? content.slice(2).trim() : '';
          await this.processRequestAction(session, type, true, '', remark);
        } else {
          const reason = content.startsWith('n ') ? content.slice(2).trim() : '';
          await this.processRequestAction(session, type, false, reason);
        }
        if (normalizedType === 'private') {
          await session.bot.sendPrivateMessage(targetId, isApprove ? '已通过' : '已拒绝');
        }
        return next();
      });
      return true;
    } catch (error) {
      this.logger.error(`通知发送失败: ${error}`);
      return false;
    }
  }

  /**
   * 统一处理请求流程
   */
  public async processRequest(session: Session, type: RequestType): Promise<void> {
    const request = this.getRequest(type);
    // 如果是群组请求类型，记录此请求
    if (type === 'guild') {
      const requestKey = `${session.platform}:${session.userId}:${session.guildId || ''}`;
      this.processedGuildRequests.add(requestKey);
    }
    // 处理自动选项
    if (request === 'auto') {
      const result = await this.shouldAutoAccept(session, type);
      if (result === true) {
        await this.processRequestAction(session, type, true);
      } else {
        const reason = typeof result === 'string' ? result : '条件不符，已拒绝';
        await this.processRequestAction(session, type, false, reason);
      }
      return;
    }
    // 设置通知与监听
    const notified = await this.setupNotification(session, type);
    if (!notified && request !== 'manual') {
      await this.processRequestAction(session, type, request === 'accept');
    } else if (!notified && this.config.enableNotify) {
      // 手动处理但通知失败
      await this.processRequestAction(session, type, false, '内部错误，已拒绝');
    }
  }

  /**
   * 注册事件监听器
   */
  public registerEventListeners() {
    const handleEvent = (type: RequestType) => async (session: Session) => {
      session.userId = session.event._data.user_id?.toString();
      if (type !== 'friend') {
        session.guildId = session.event._data.group_id?.toString() || '';
      }
      await this.processRequest(session, type);
    };
    // 检查是否为已处理过的guild-request后的guild-added事件
    const handleGuildAdded = async (session: Session) => {
      session.userId = session.event._data.user_id?.toString();
      session.guildId = session.event._data.group_id?.toString() || '';
      // 检查是否已经处理过对应的guild-request
      const requestKey = `${session.platform}:${session.userId}:${session.guildId}`;
      if (this.processedGuildRequests.has(requestKey)) {
        return;
      }
      await this.processRequest(session, 'guild');
    };

    this.ctx.on('friend-request', handleEvent('friend'));
    this.ctx.on('guild-request', handleEvent('guild'));
    this.ctx.on('guild-member-request', handleEvent('member'));
    this.ctx.on('guild-added', handleGuildAdded);
  }
}