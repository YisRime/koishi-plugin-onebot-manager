import { Context, Logger, Session } from 'koishi'
import { Config } from './index'

export type RequestOption = 'accept' | 'reject' | 'manual'
export type TimeoutAction = 'accept' | 'reject'
export type RequestType = 'friend' | 'guild' | 'member'

export interface NotifyTarget {
  type: 'group' | 'private',
  id: string
}

/**
 * OneBot请求处理类
 * 用于处理好友申请、群邀请和入群请求
 */
export class OnebotRequest {
  constructor(
    private ctx: Context,
    private logger: Logger,
    private config: Config = {},
  ) {}

  /**
   * 统一处理请求流程
   * @param {Session} session - 会话对象
   * @param {RequestType} type - 请求类型
   * @returns {Promise<void>}
   * @public
   */
  public async processRequest(session: Session, type: RequestType): Promise<void> {
    const { requestOption = 'accept', enableNotify = false, notifyTarget = '' } = this.config
    let notified = false;
    if (enableNotify && notifyTarget) {
      const [targetType, targetId] = notifyTarget.split(':');
      if (!targetType || !targetId) {
        this.logger.warn(`通知目标错误: ${notifyTarget}`);
      } else {
        const normalizedType = targetType.toLowerCase();
        if (normalizedType !== 'group' && normalizedType !== 'private') {
          this.logger.warn(`通知类型错误: ${targetType}`);
        } else {
          try {
            const message = await this.createNotificationMessage(session, type);
            if (message) {
              normalizedType === 'group'
                ? await session.bot.sendMessage(targetId, message)
                : await session.bot.sendPrivateMessage(targetId, message).then(() =>
                    session.bot.sendPrivateMessage(targetId, `请回复 y/n [备注/理由] 来处理申请`));
              // 创建响应监听器
              const disposer = this.ctx.middleware(async (session2, next) => {
                const isRelevant = normalizedType === 'group'
                  ? session2.channelId === targetId && !session2.content.startsWith('.')
                  : session2.userId === targetId && session2.channelId.startsWith('private:');
                if (!isRelevant) return next();
                const content = session2.content.trim();
                const lowerContent = content.toLowerCase();
                // 检查是否为有效响应
                const isApprove = lowerContent === 'y' || lowerContent.startsWith('y ');
                const isReject = lowerContent === 'n' || lowerContent.startsWith('n ');
                if (!isApprove && !isReject) return next();
                // 处理响应
                disposer();
                if (isApprove) {
                  if (type === 'friend' && lowerContent.startsWith('y ')) {
                    const remark = content.slice(2).trim();
                    await this.processRequestAction(session, type, true, '', remark);
                  } else {
                    await this.processRequestAction(session, type, true);
                  }
                }
                else {
                  const reason = content.startsWith('n ') ? content.slice(2).trim() : '';
                  await this.processRequestAction(session, type, false, reason);
                }
                if (normalizedType === 'private') {
                  await session.bot.sendPrivateMessage(targetId, isApprove ? '已通过' : '已拒绝');
                }
                return next();
              });
              notified = true;
            }
          } catch (error) {
            this.logger.error(`通知发送失败: ${error}`);
          }
        }
      }
    }
    if (!notified) {
      if (requestOption !== 'manual') {
        await this.processRequestAction(session, type, requestOption === 'accept');
      } else if (enableNotify) {
        await this.processRequestAction(session, type, false, '内部错误，自动拒绝，请重试');
      }
    }
  }

  /**
   * 创建通知消息
   * @param session 会话对象
   * @param type 请求类型
   * @returns 通知消息
   */
  private async createNotificationMessage(session: Session, type: RequestType): Promise<string> {
    let message = '';
    const user = await session.bot.getUser?.(session.userId)?.catch(() => null) ?? null;
    const userName = user?.name ?? '未知用户';
    switch (type) {
      case 'friend': {
        const avatar = user?.avatar ?? '';
        const comment = session.event?._data?.comment ?? '';
        message = `收到来自${userName}[${session.userId}]的好友申请：\n`;
        if (avatar) message += `<image url="${avatar}"/>\n`;
        if (comment) message += `验证信息：${comment}\n`;
        break;
      }
      case 'guild':
      case 'member': {
        const guild = await session.bot.getGuild?.(session.guildId)?.catch(() => null) ?? null;
        const guildName = guild?.name ?? '未知群组';
        message = type === 'guild'
          ? `收到入群邀请：\n群组：${guildName}[${session.guildId}]\n邀请人：${userName}[${session.userId}]\n邀请类型：${
              session.event?._data?.sub_type === 'invite' ? '邀请机器人入群' : '被邀请入群'}\n`
          : `收到加群请求：\n群组：${guildName}[${session.guildId}]\n申请人：${userName}[${session.userId}]\n${
              session.event?._data?.comment ? `验证信息：${session.event?._data?.comment}\n` : ''}`;
        break;
      }
    }
    return message;
  }

  /**
   * 处理请求动作
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
    this.ctx.on('friend-request', handleEvent('friend'));
    this.ctx.on('guild-request', handleEvent('guild'));
    this.ctx.on('guild-member-request', handleEvent('member'));
  }
}