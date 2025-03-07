import { Context, h, Schema } from 'koishi'
import { inspect } from 'util'

export const name = 'onebot-manager'
export const inject = { required: ['database'] }

export interface MessageManagerConfig {
  maxMessagesPerUser: number
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

interface StoredMessage {
  messageId: string
  userId: string
  channelId: string
  timestamp: number
}

interface RecallTask {
  controller: AbortController
  total: number
  success: number
  failed: number
}

export function apply(ctx: Context, config: MessageManagerConfig) {
  const logger = ctx.logger('onebot-manager')

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

  async function removeExpiredMessages(channelId: string, userId: string) {
    const tasks = []
    const now = Date.now()

    config.maxMessageRetentionHours > 0 && tasks.push(
      ctx.database.remove('onebot_messages', {
        channelId,
        timestamp: { $lt: now - config.maxMessageRetentionHours * 3600000 }
      })
    )

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

  const recallTasks = new Map<string, Set<RecallTask>>()

  const handleMessage = async (session) => {
    if (!session?.messageId) return
    await ctx.database.create('onebot_messages', {
      messageId: session.messageId,
      userId: session.userId,
      channelId: session.channelId,
      timestamp: Date.now(),
    }).then(() => removeExpiredMessages(session.channelId, session.userId))
  }

  ctx.on('message', handleMessage)
  ctx.on('send', handleMessage)

  async function recallMessages(session, messageIds: string[]) {
    return Promise.allSettled(messageIds.map(async id => {
      await session.bot.deleteMessage(session.channelId, id)
      await ctx.database.remove('onebot_messages', { messageId: id })
    }))
  }

  async function fetchMessagesToRecall(channelId: string, options: { user?: string, count?: number }) {
    return ctx.database
      .select('onebot_messages')
      .where({
        channelId,
        ...(options.user && { userId: options.user.match(/<at:(.+)>/)?.[1] || options.user })
      })
      .orderBy('timestamp', 'desc')
      .limit(Math.max(1, parseInt(options.count?.toString()) || 1))
      .execute()
  }

  const recall = ctx.command('recall', '撤回消息')
    .option('user', '-u <user> 撤回指定用户的消息')
    .option('number', '-n <number> 撤回消息数量', { fallback: 1 })
    .action(async ({ session, options }) => {
      try {
        const quotes = Array.isArray(session.quote) ? session.quote : [session.quote].filter(Boolean)
        if (quotes?.length) {
          const results = await recallMessages(session, quotes.map(q => q.id || q.messageId))
          const failed = results.filter(r => r.status === 'rejected').length
          return failed ? `撤回失败: ${failed}条` : ''
        }

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
          await recallMessages(session, [msg.messageId])
            .then(([result]) => result.status === 'fulfilled' ? task.success++ : task.failed++)
          await new Promise(resolve => setTimeout(resolve, 500))
        }

        channelTasks.delete(task)
        !channelTasks.size && recallTasks.delete(session.channelId)

        return task.failed ? `撤回失败: ${task.failed}条` : ''
      } catch (error) {
        return '撤回失败'
      }
    })

  recall.subcommand('.stop', '停止撤回操作')
    .action(async ({ session }) => {
      const channelTasks = recallTasks.get(session.channelId)

      for (const task of channelTasks) {
        task.controller.abort()
      }

      recallTasks.delete(session.channelId)
      return `已停止${channelTasks.size}个撤回操作`
    })

  const ins = ctx.command('inspect')

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

  ins.subcommand('msgid', '获取消息ID')
    .action(async ({ session }) => {
      if (session.quote) {
        return session.quote.id
      }
      return session.messageId
    })
}
