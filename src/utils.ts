import { Session, h, Logger } from 'koishi';

export const utils = {
  /**
   * 解析目标字符串，返回QQ号或null。
   * @param target 目标字符串
   * @returns QQ号字符串或null
   */
  parseTarget(target: string): string | null {
    if (!target) return null;
    try {
      const at = h.select(h.parse(target), 'at')[0]?.attrs?.id;
      if (at) return at;
    } catch {}
    return target.match(/@?(\d{5,10})/)?.[1] ?? null;
  },

  /**
   * 处理错误并发送提示消息，10秒后自动撤回。
   * @param session 会话对象
   * @param error 错误对象或消息
   * @param prefix 消息前缀
   * @returns Promise<null>
   */
  handleError(session: Session, error: any, prefix = '操作失败:') {
    return session.send(`${prefix} ${error?.message || error}`).then(msg => {
      if (typeof msg === 'string')
        setTimeout(() => session.bot.deleteMessage(session.channelId, msg).catch(() => {}), 10000);
      return null;
    });
  },

  /**
   * 检查机器人和用户在群内的权限角色。
   * @param session 会话对象
   * @param logger 日志对象
   * @returns Promise<{ bot: string | null, user: string | null }>
   */
  async checkPermission(session: Session, logger?: Logger) {
    if (!session.guildId) return { bot: null, user: null };
    try {
      const [bot, user] = await Promise.all([
        session.onebot.getGroupMemberInfo(+session.guildId, +session.selfId, true),
        session.onebot.getGroupMemberInfo(+session.guildId, +session.userId, true),
      ]);
      return { bot: bot?.role ?? null, user: user?.role ?? null };
    } catch (e) {
      logger?.error('获取群成员信息失败:', e);
      return { bot: null, user: null };
    }
  },

  /**
   * 包装函数，执行前检查机器人和用户的群权限。
   * @param session 会话对象
   * @param logger 日志对象
   * @param requiredBotRoles 机器人所需角色
   * @param requiredUserRoles 用户所需角色
   * @param failMsg 权限不足时的提示
   * @param fn 被包装的函数
   * @returns 包装后的异步函数
   */
  withRoleCheck(session, logger, requiredBotRoles, requiredUserRoles, failMsg, fn) {
    return async (...args) => {
      const { bot, user } = await utils.checkPermission(session, logger);
      if (requiredBotRoles.length > 0 && (!bot || !requiredBotRoles.includes(bot)))
        return utils.handleError(session, new Error('无群管权限'));
      if (requiredUserRoles.length > 0 && (!user || !requiredUserRoles.includes(user)))
        return utils.handleError(session, new Error(failMsg));
      return fn(...args);
    }
  }
}