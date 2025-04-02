import { Session, h } from 'koishi';

/**
 * 工具函数集合
 */
export const utils = {
  /**
   * 解析目标用户ID (支持@元素、@数字格式或纯数字)
   * @param target - 要解析的目标字符串
   * @returns 解析出的用户ID，解析失败返回null
   */
  parseTarget(target: string): string | null {
    if (!target) return null
    // 尝试解析at元素
    try {
      const atElement = h.select(h.parse(target), 'at')[0]
      if (atElement?.attrs?.id) return atElement.attrs.id;
    } catch {}
    // 匹配@数字或纯数字
    const userId = target.match(/@(\d+)/)?.at(1) ||
                  (/^\d+$/.test(target.trim()) ? target.trim() : null);
    // 验证ID格式：5-10位数字
    return userId && /^\d{5,10}$/.test(userId) ? userId : null;
  },

  /**
   * 自动撤回消息
   * @param session - 会话对象
   * @param message - 要撤回的消息ID
   * @param delay - 撤回延迟时间(毫秒)，默认10s
   */
  autoRecall(session: Session, message: string | number, delay = 10000): void {
    if (!message) return
    setTimeout(() => {
      session.bot?.deleteMessage(session.channelId, message.toString())
        .catch(() => {/* 忽略撤回失败 */})
    }, delay)
  }
}