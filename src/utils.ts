import { Session, h, Logger } from 'koishi';
import fs from 'fs';
import path from 'path';

/**
 * 工具函数集合
 */
export const utils = {
  /**
   * 解析目标用户ID (支持@元素、@数字格式或纯数字)
   * @param target 目标字符串
   * @returns 解析出的用户ID或null
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
   * 统一错误处理并自动撤回
   * @param session 会话对象
   * @param error 错误对象
   * @param prefix 消息前缀
   * @returns null
   */
  handleError(session: Session, error: any, prefix = '操作失败:') {
    return session.send(`${prefix} ${error?.message || error}`).then(msg => {
      if (typeof msg === 'string')
        setTimeout(() => session.bot.deleteMessage(session.channelId, msg).catch(() => {}), 10000);
      return null;
    });
  },

  /**
   * 检查机器人和用户在群内的权限
   * @param session 会话对象
   * @param logger 日志对象
   * @returns 权限信息对象
   */
  async checkPermission(session: Session, logger?: Logger) {
    if (!session.guildId) return { bot: null, user: null };
    try {
      const [bot, user] = await Promise.all([
        session.onebot.getGroupMemberInfo(Number(session.guildId), Number(session.selfId), true),
        session.onebot.getGroupMemberInfo(Number(session.guildId), Number(session.userId), true),
      ]);
      return { bot: bot?.role ?? null, user: user?.role ?? null };
    } catch (e) {
      logger?.error('获取群成员信息失败:', e);
      return { bot: null, user: null };
    }
  },

  /**
   * 权限检查
   * @param session 会话对象
   * @param logger 日志对象
   * @param requiredBotRoles 需要的机器人权限
   * @param requiredUserRoles 需要的用户权限
   * @param failMsg 权限不足时的提示
   * @param fn 实际执行函数
   * @returns 包装后的异步函数
   */
  withRoleCheck(session, logger, requiredBotRoles, requiredUserRoles, failMsg, fn) {
    return async (...args) => {
      const { bot, user } = await utils.checkPermission(session, logger);
      if (!bot || !requiredBotRoles.includes(bot))
        return utils.handleError(session, new Error('机器人无群管权限'));
      if (!user || !requiredUserRoles.includes(user))
        return utils.handleError(session, new Error(failMsg));
      return fn(...args);
    }
  },

  /**
   * 文件操作工具
   */
  file: {
    /**
     * 获取数据文件路径，确保目录存在
     * @param filename 文件名
     * @returns 文件完整路径
     */
    getFilePath(filename: string): string {
      const dir = path.resolve(process.cwd(), 'data', 'onebot-manager');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      return path.join(dir, filename);
    },

    /**
     * 读取JSON文件
     * @param filename 文件名
     * @param defaultValue 默认值
     * @returns 读取到的数据或默认值
     */
    readJSON<T>(filename: string, defaultValue: T): T {
      try {
        const filePath = utils.file.getFilePath(filename);
        if (!fs.existsSync(filePath)) return defaultValue;
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
      } catch { return defaultValue; }
    },

    /**
     * 写入JSON文件
     * @param filename 文件名
     * @param data 写入的数据
     */
    writeJSON<T>(filename: string, data: T): void {
      try {
        fs.writeFileSync(utils.file.getFilePath(filename), JSON.stringify(data, null, 2), 'utf-8');
      } catch {}
    }
  }
}