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
  private typeNames: Record<RequestType, string> = {
    friend: '好友申请',
    guild: '入群邀请',
    member: '加群请求'
  }

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
    const { requestOption = 'accept', timeout = 0, timeoutAction = 'reject', enableNotify = false, notifyTarget = '' } = this.config
    let notified = false;
    // 发送通知
    if (enableNotify && notifyTarget) {
      try {
        const [targetType, targetId] = notifyTarget.split(':');
        if (!targetType || !targetId) {
          this.logger.warn(`通知目标错误: ${notifyTarget}`);
        } else {
          const normalizedType = targetType.toLowerCase();
          if (normalizedType === 'group' || normalizedType === 'private') {
            let info;
            if (type === 'friend') {
              const user = await session.bot.getUser?.(session.userId).catch(() => null);
              info = {
                nickname: user?.name || user?.nickname || user?.username || '未知用户',
                avatar: user?.avatar || '',
                id: session.userId,
                comment: session.event?._data?.comment || ''
              };
            } else {
              const [guild, user] = await Promise.all([
                session.bot.getGuild?.(session.guildId).catch(() => null),
                session.bot.getUser?.(session.userId).catch(() => null)
              ]);
              info = {
                nickname: guild?.name || '未知群组',
                avatar: guild?.avatar || '',
                id: session.guildId,
                inviter: user?.name || user?.nickname || user?.username || '未知用户',
                inviterId: session.userId
              };
            }
            if (info) {
              let message = `收到来自${info.nickname}[${info.id}]的${this.typeNames[type]}：\n`;
              if (info.avatar) message += `<image url="${info.avatar}"/>\n`;
              if (type === 'friend') {
                if (info.comment) message += `验证信息：${info.comment}\n`;
              } else if ('inviter' in info) {
                message += `${info.inviter}[${info.inviterId}]\n`;
              }
              if (normalizedType === 'group') {
                await session.bot.sendMessage(targetId, message);
              } else {
                await session.bot.sendPrivateMessage(targetId, message);
              }
              notified = true;
            }
          } else {
            this.logger.warn(`通知类型错误: ${targetType}`);
          }
        }
      } catch (error) {
        this.logger.error(`通知处理失败: ${error}`);
      }
    }
    // 处理请求动作
    const processRequestAction = async (approve: boolean, reason = '', remark = ''): Promise<boolean> => {
      try {
        const flag = session.event._data.flag;
        if (type === 'friend') {
          await session.onebot.setFriendAddRequest(flag, approve, remark);
        } else {
          const subType = session.event._data.sub_type || 'add';
          await session.onebot.setGroupAddRequest(flag, subType, approve, approve ? '' : reason);
        }
        return true;
      } catch (error) {
        this.logger.error(`处理失败: ${error}`);
        return false;
      }
    };
    // 自动处理请求
    if (requestOption !== 'manual') {
      await processRequestAction(requestOption === 'accept');
      return;
    }
    // 手动处理
    if (notified) {
      try {
        // 发送提示文本
        const helpText = `请回复 y/n [备注/理由] 来处理此项申请`;
        await session.send(helpText);
        // 等待用户响应
        const response = await session.prompt(timeout ? timeout * 60 * 1000 : undefined);
        if (!response) {
          const approve = timeoutAction === 'accept';
          await processRequestAction(approve);
          await session.send(`超时${approve ? '已通过' : '已拒绝'}`);
          return;
        }
        // 处理响应
        const content = response.trim();
        const lowerContent = content.toLowerCase();
        let result: boolean, replyMessage: string;
        if (lowerContent === 'y' || lowerContent === 'yes') {
          result = await processRequestAction(true);
          replyMessage = `已通过`;
        } else if (type === 'friend' && lowerContent.startsWith('y ')) {
          const remark = content.slice(2).trim();
          result = await processRequestAction(true, '', remark);
          replyMessage = `已通过，备注：${remark}`;
        } else if (lowerContent === 'n' || lowerContent.startsWith('n ')) {
          const reason = content.length > 1 ? content.slice(2).trim() : '';
          result = await processRequestAction(false, reason);
          replyMessage = `已拒绝${reason ? `，理由：${reason}` : ''}`;
        } else {
          await session.send('格式错误');
          return await this.processRequest(session, type);
        }
        if (result) {
          await session.send(replyMessage);
        }
      } catch (e) {
        this.logger.warn(`处理失败: ${e}`);
        await processRequestAction(timeoutAction === 'accept');
      }
    } else if (enableNotify) {
      this.logger.warn(`无法发送通知，执行默认操作`);
      await processRequestAction(timeoutAction === 'accept');
    }
  }

  /**
   * 注册事件监听器
   */
  public registerEventListeners() {
    const handleEvent = (type: RequestType) => async (session: Session) => {
      const userId = session.event._data.user_id?.toString();
      session.userId = userId;
      if (type !== 'friend') {
        const groupId = session.event._data.group_id;
        if (groupId) {
          session.guildId = groupId.toString();
        }
      }
      await this.processRequest(session, type);
    };
    this.ctx.on('friend-request', handleEvent('friend'));
    this.ctx.on('guild-request', handleEvent('guild'));
    this.ctx.on('guild-member-request', handleEvent('member'));
  }
}