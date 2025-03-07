/**
 * OneBot 消息管理器
 * 提供消息存储、清理和撤回等功能
 * @module onebot-manager
 */

import { Context, h, Schema } from 'koishi'
import { inspect } from 'util'

export const name = 'onebot-manager'
export const inject = { required: ['database'] }

/**
 * 消息管理器配置接口
 */
export interface MessageManagerConfig {
  /** 每个用户最多保存的消息数量 */
  maxMessagesPerUser: number
  /** 消息最长保存时间(小时) */
  maxMessageRetentionHours: number
}

export const Config: Schema<MessageManagerConfig> = Schema.object({
  maxMessagesPerUser: Schema.number()
    .description('每个用户最多保存消息（条）')
    .default(99)
    .min(0),
  maxMessageRetentionHours: Schema.number()
    .description('消息最长保存时间（小时）')
    .default(24)
    .min(0),
})

declare module 'koishi' {
  interface Tables {
    onebot_messages: StoredMessage
  }
}

/**
 * 存储消息的数据结构
 */
interface StoredMessage {
  messageId: string
  userId: string
  channelId: string
  timestamp: number
}

/**
 * 撤回任务的数据结构
 */
interface RecallTask {
  controller: AbortController
  total: number
  success: number
  failed: number
}

/**
 * 插件主函数
 * @param ctx Koishi 上下文
 * @param config 插件配置
 */
export function apply(ctx: Context, config: MessageManagerConfig) {
  const logger = ctx.logger('onebot-manager')

  // 扩展数据库模型
  ctx.model.extend('onebot_messages', {
    messageId: 'string',
    userId: 'string',
    channelId: 'string',
    timestamp: 'integer',
  }, {
    primary: 'messageId',
    indexes: [
      ['channelId', 'userId'],
      ['timestamp'],
    ],
  })

  /**
   * 清理过期消息
   * @param channelId 频道ID
   * @param userId 用户ID
   */
  async function removeExpiredMessages(channelId: string, userId: string) {
    const tasks = []
    const now = Date.now()

    // 清理超过保存时间的消息
    config.maxMessageRetentionHours > 0 && tasks.push(
      ctx.database.remove('onebot_messages', {
        channelId,
        timestamp: { $lt: now - config.maxMessageRetentionHours * 3600000 }
      })
    )

    // 清理超过数量限制的消息
    if (config.maxMessagesPerUser > 0) {
      const messages = await ctx.database
        .select('onebot_messages')
        .where({ channelId, userId })
        .orderBy('timestamp', 'desc')
        .limit(config.maxMessagesPerUser + 1)
        .execute()

      messages.length > config.maxMessagesPerUser && tasks.push(
        ctx.database.remove('onebot_messages', {
          messageId: { $in: messages.slice(config.maxMessagesPerUser).map(msg => msg.messageId) }
        })
      )
    }

    await Promise.all(tasks).catch(error =>
      logger.error(`Failed to remove expired messages: ${error.message}`))
  }

  // 存储进行中的撤回任务
  const recallTasks = new Map<string, Set<RecallTask>>()

  /**
   * 处理消息事件
   * @param session 会话对象
   */
  const handleMessage = async (session) => {
    if (!session?.messageId) return
    // 存储消息并清理过期消息
    await ctx.database.create('onebot_messages', {
      messageId: session.messageId,
      userId: session.userId,
      channelId: session.channelId,
      timestamp: Date.now(),
    }).then(() => removeExpiredMessages(session.channelId, session.userId))
  }

  ctx.on('message', handleMessage)
  ctx.on('send', handleMessage)

  /**
   * 撤回指定消息
   * @param session 会话对象
   * @param messageIds 要撤回的消息ID数组
   */
  async function recallMessages(session, messageIds: string[]) {
    const results = await Promise.allSettled(messageIds.map(async id => {
      await session.bot.deleteMessage(session.channelId, id)
      await ctx.database.remove('onebot_messages', { messageId: id })
    }))

    const success = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    return { success, failed }
  }

  /**
   * 获取需要撤回的消息
   * @param channelId 频道ID
   * @param options 查询选项
   */
  async function fetchMessagesToRecall(channelId: string, options: { user?: string, count?: number }) {
    const userId = options.user?.replace(/^<at:(.+)>$/, '$1')
    return ctx.database
      .select('onebot_messages')
      .where({
        channelId,
        ...(userId && { userId })
      })
      .orderBy('timestamp', 'desc')
      .limit(Math.max(1, Number(options.count) || 1))
      .execute()
  }

  // 注册撤回命令
  const recall = ctx.command('recall', '撤回消息')
    .option('user', '-u <user> 撤回指定用户的消息')
    .option('number', '-n <number> 撤回消息数量', { fallback: 1 })
    .action(async ({ session, options }) => {
      try {
        // 处理引用消息的撤回
        const quotes = Array.isArray(session.quote) ? session.quote : [session.quote].filter(Boolean)
        if (quotes?.length) {
          const { success, failed } = await recallMessages(session, quotes.map(q => q.id || q.messageId))
          return failed ? `撤回完成：成功 ${success} 条，失败 ${failed} 条` : ''
        }

        // 创建新的撤回任务
        const channelTasks = recallTasks.get(session.channelId) || new Set()
        const task: RecallTask = {
          controller: new AbortController(),
          total: 0,
          success: 0,
          failed: 0
        }

        channelTasks.add(task)
        recallTasks.set(session.channelId, channelTasks)

        const messages = await fetchMessagesToRecall(session.channelId, {
          user: options.user,
          count: options.number
        })

        task.total = messages.length

        for (const msg of messages) {
          if (task.controller.signal.aborted) break
          const { success, failed } = await recallMessages(session, [msg.messageId])
          task.success += success
          task.failed += failed
          await new Promise(resolve => setTimeout(resolve, 500))
        }

        channelTasks.delete(task)
        !channelTasks.size && recallTasks.delete(session.channelId)

        return task.failed ? `撤回完成：成功 ${task.success} 条，失败 ${task.failed} 条` : ''
      } catch (error) {
        return '撤回失败'
      }
    })

  // 注册停止撤回命令
  recall.subcommand('.stop', '停止撤回操作')
    .action(async ({ session }) => {
      const channelTasks = recallTasks.get(session.channelId)

      for (const task of channelTasks) {
        task.controller.abort()
      }

      recallTasks.delete(session.channelId)
      return `已停止${channelTasks.size}个撤回操作`
    })

  // 注册检查命令
  const ins = ctx.command('inspect')

  /**
   * 检查消息元素命令
   * 用于调试和查看消息结构
   */
  ins.subcommand('elements', '检查消息元素')
    .action(({ session }) => {
      let { elements, quote } = session
      if (quote) elements = quote.elements
      const jsons = []
      elements = elements.map((element) => {
        if (element.type === 'json') {
          jsons.push(JSON.parse(element.attrs.data))
          element.attrs.data = `[JSON ${jsons.length}]`
        }
        return element
      })
      let result = inspect(elements, { depth: Infinity })
      if (jsons.length) {
        result += '\n\n' + jsons.map((data, index) => `[JSON ${index + 1}]: ${inspect(data, { depth: Infinity })}`).join('\n\n')
      }
      return h.text(result)
    })

  /**
   * 获取消息ID命令
   * 用于获取当前消息或引用消息的ID
   */
  ins.subcommand('msgid', '获取消息ID')
    .action(async ({ session }) => {
      if (session.quote) {
        return session.quote.id
      }
      return session.messageId
    })
}
