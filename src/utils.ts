import { Session, h, Logger } from 'koishi';

// 角色映射常量
const ROLE_MAP = { owner: '群主', admin: '管理员', member: '成员' };
const getRoleName = (role: string) => ROLE_MAP[role] || role || '未知';

export const utils = {
  /**
   * 解析目标字符串，返回QQ号或null
   */
  parseTarget(target: string): string | null {
    if (!target) return null;
    try {
      // 尝试解析@标记
      const at = h.select(h.parse(target), 'at')[0]?.attrs?.id;
      if (at && !isNaN(Number(at))) return at;
      // 尝试匹配QQ号
      const match = target.match(/@?(\d{5,10})/)?.[1];
      return match && !isNaN(Number(match)) ? match : null;
    } catch {
      return null;
    }
  },

  /**
   * 处理错误并发送提示消息
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
   * 检查机器人和用户在群内的权限角色
   */
  async checkPermission(session: Session, logger?: Logger) {
    if (!session.guildId) return { bot: null, user: null };
    try {
      const [bot, user] = await Promise.all([
        session.onebot.getGroupMemberInfo(+session.guildId, +session.selfId, true),
        session.onebot.getGroupMemberInfo(+session.guildId, +session.userId, true)
      ]);
      return { bot: bot?.role ?? null, user: user?.role ?? null };
    } catch (e) {
      logger?.error('获取群成员信息失败:', e);
      return { bot: null, user: null };
    }
  },

  /**
   * 包装函数，执行前检查机器人和用户的群权限
   */
  withRoleCheck<T extends any[], R>(session: Session, logger: Logger, requiredBotRoles: string[] = [],
    requiredUserRoles: string[] = [], fn: (...args: T) => Promise<R>) {
    return (...args: T): Promise<R | null> =>
      utils.checkPermission(session, logger).then(({ bot, user }) => {
        // 检查权限并构建错误列表
        const errors = [];
        // 检查机器人权限
        if (requiredBotRoles.length && (!bot || !requiredBotRoles.includes(bot))) {
          errors.push(`需要${requiredBotRoles.map(getRoleName).join('或')}（当前为${getRoleName(bot)}）`);
        }
        // 检查用户权限
        if (requiredUserRoles.length && (!user || !requiredUserRoles.includes(user))) {
          errors.push(`用户需要${requiredUserRoles.map(getRoleName).join('或')}（当前为${getRoleName(user)}）`);
        }
        // 如有错误则返回
        if (errors.length) return utils.handleError(session, `权限不足：${errors.join('；')}`);
        return fn(...args);
      });
  }
}