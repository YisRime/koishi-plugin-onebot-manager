import { Context, Logger, Session } from 'koishi'
import { Config } from './index'

/**
 * OneBot 通知类事件监听器
 * 处理入群、退群、被踢、管理员变动等事件
 */
export class OneBotListener {
  /**
   * 创建 OneBot 通知监听实例
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
   * 发送群成员变动通知 (入群/退群)
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
      if (!message.trim()) return;

      if (this.config.redirectMsg && this.config.notifyTarget) {
        const [targetType, targetId] = this.config.notifyTarget.split(':');
        if (!targetId || (targetType !== 'guild' && targetType !== 'private')) {
          this.logger.warn(`通知目标错误: ${this.config.notifyTarget}`);
          await session.bot.sendMessage(session.guildId, message);
        } else {
          const sendFunc = targetType === 'private'
            ? (m: string) => session.bot.sendPrivateMessage(targetId, m)
            : (m: string) => session.bot.sendMessage(targetId, m);
          await sendFunc(message);
        }
      } else {
        await session.bot.sendMessage(session.guildId, message);
      }
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
        msg = `已被 ${operatorIdentifier} 踢出 ${guildIdentifier}`;
      } else {
        msg = `已退出 ${guildIdentifier}`;
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
   * 处理群内管理员变动事件，并发送到 notifyTarget
   */
  private async handleAdminChange(session: Session): Promise<void> {
    if (
      session.event?.platform !== 'onebot' ||
      session.event?.subtype !== 'role' ||
      session.event?._data?.notice_type !== 'group_admin'
    ) return;

    const { notifyTarget = '' } = this.config;
    if (!notifyTarget) return;

    const [targetType, targetId] = notifyTarget.split(':');
    if (!targetId || (targetType !== 'guild' && targetType !== 'private')) {
      this.logger.warn(`通知目标错误: ${notifyTarget}`);
      return;
    }

    try {
      const eventData = session.event._data;
      const subType = eventData.sub_type;
      const changedUserId = eventData.user_id?.toString();
      const guildId = eventData.group_id?.toString();

      if (!changedUserId || !guildId) return;

      const [targetUser, guild] = await Promise.all([
        session.bot.getUser(changedUserId).catch(() => ({ name: changedUserId })),
        session.bot.getGuild(guildId).catch(() => ({ name: guildId }))
      ]);

      const targetIdentifier = targetUser.name && targetUser.name !== changedUserId ? `${targetUser.name}(${changedUserId})` : changedUserId;
      const guildIdentifier = guild.name && guild.name !== guildId ? `${guild.name}(${guildId})` : guildId;
      const actionText = subType === 'set' ? '设置为' : '取消了';
      const message = `${targetIdentifier} 已被${actionText} ${guildIdentifier} 的管理员`;

      const sendFunc = targetType === 'private'
        ? (m: string) => session.bot.sendPrivateMessage(targetId, m)
        : (m: string) => session.bot.sendMessage(targetId, m);

      await sendFunc(message);
    } catch (error) {
      this.logger.error('发送管理员变动通知失败:', error);
    }
  }

  /**
   * 注册所有通知类事件监听器
   */
  public registerEventListeners(): void {
    if (this.config.enableJoin) {
      this.ctx.on('guild-member-added', (session) => this.sendGuildMemberUpdateMessage(session, this.config.joinMessage));
    }
    if (this.config.enableLeave) {
      this.ctx.on('guild-member-removed', (session) => this.sendGuildMemberUpdateMessage(session, this.config.leaveMessage));
    }
    if (this.config.enableKick) {
      this.ctx.on('guild-removed', this.handleBotRemoved.bind(this));
    }
    if (this.config.enableAdmin) {
      this.ctx.on('guild-member' as any, this.handleAdminChange.bind(this));
    }
  }
}
