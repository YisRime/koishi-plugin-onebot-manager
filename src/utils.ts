import { Session, h, Logger } from 'koishi';

// 角色映射常量
const ROLE_MAP = { owner: '群主', admin: '管理员', member: '成员' };
const getRoleName = (role: string) => role ? (ROLE_MAP[role] || role) : '未知';

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
    const match = target.match(/@?(\d{5,10})/)?.[1];
    if (match && !isNaN(Number(match))) return match;
    return null;
  },

  /**
   * 处理错误并发送提示消息，10秒后自动撤回。
   * @param session 会话对象
   * @param error 错误对象或消息
   * @returns Promise<null>
   */
  handleError(session: Session, error: any) {
    const errorMsg = error?.message || String(error);
    return session.send(errorMsg).then(msg => {
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
   * @param fn 被包装的函数
   * @returns 包装后的异步函数
   */
  withRoleCheck<T extends any[], R>(session: Session, logger: Logger, requiredBotRoles: string[] = [],
    requiredUserRoles: string[] = [], fn: (...args: T) => Promise<R>) {
    return async (...args: T): Promise<R | null> => {
      const { bot, user } = await utils.checkPermission(session, logger);
      // 检查权限并构建错误消息
      const checkRole = (role: string | null, required: string[], subject: string) => {
        if (required.length && (!role || !required.includes(role))) {
          const requiredNames = required.map(getRoleName).join('或');
          const currentName = getRoleName(role);
          return `${subject}需要${requiredNames}（当前为${currentName}）`;
        }
        return null;
      };
      // 依次检查权限
      const botError = checkRole(bot, requiredBotRoles, '');
      const userError = checkRole(user, requiredUserRoles, '用户');
      // 合并显示错误
      if (botError || userError) {
        const errors = [botError, userError].filter(Boolean).join('；');
        return utils.handleError(session, `权限不足：${errors}`);
      }
      return fn(...args);
    };
  }
}