import { Context, Schema } from 'koishi'

export const name = 'onebot-manager'
export const inject = {required: ['database']}

export interface MessageManagerConfig {
  maxMessagesPerUser: number
  maxMessageRetentionHours: number
  recordBotMessages: boolean
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
  recordBotMessages: Schema.boolean()
    .description('是否允许撤回机器人发送的消息')
    .default(false),
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
  const onebotContext = ctx.platform('onebot')

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

  const extractUserIdFromMention = (mentionText: string): string =>
    mentionText?.match(/<at:(.+)>/)?.[1] || mentionText

  async function removeExpiredMessages(channelId: string, userId: string) {
    const tasks = []

    if (config.maxMessageRetentionHours > 0) {
      const expirationTimestamp = Date.now() - config.maxMessageRetentionHours * 3600000
      tasks.push(ctx.database.remove('onebot_messages', {
        channelId,
        timestamp: { $lt: expirationTimestamp }
      }))
    }

    if (config.maxMessagesPerUser > 0) {
      const userMessageHistory = await ctx.database.select('onebot_messages')
        .where({ channelId, userId })
        .orderBy('timestamp', 'desc')
        .limit(config.maxMessagesPerUser + 1)
        .execute()

      if (userMessageHistory.length > config.maxMessagesPerUser) {
        const messagesToRemove = userMessageHistory.slice(config.maxMessagesPerUser)
        tasks.push(ctx.database.remove('onebot_messages', {
          messageId: { $in: messagesToRemove.map(msg => msg.messageId) }
        }))
      }
    }

    await Promise.all(tasks)
  }

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  const recallTasks = new Map<string, Set<RecallTask>>()

  onebotContext.middleware(async (session, next) => {
    const result = await next()
    if (!session.messageId) return result

    await ctx.database.create('onebot_messages', {
      messageId: session.messageId,
      userId: session.userId,
      channelId: session.channelId,
      timestamp: Date.now(),
    })

    await removeExpiredMessages(session.channelId, session.userId)

    return result
  })

  const recall = onebotContext
    .command('recall [messageCount:number]', '撤回消息')
    .option('user', '-u <user> 撤回指定用户的消息')
    .action(async ({ session, options }, messageCount = 1) => {
      if (session.quote) {
        try {
          await session.bot.deleteMessage(session.channelId, session.quote.id)
          await ctx.database.remove('onebot_messages', {messageId: session.quote.id})
          return
        } catch (error) {
          ctx.logger(error.message)
          return
        }
      }

      const channelTasks = recallTasks.get(session.channelId) || new Set()
      const controller = new AbortController()
      const targetUserId = extractUserIdFromMention(options.user)
      const queryConditions = {
        channelId: session.channelId,
        ...(targetUserId && { userId: targetUserId })
      }

      const messagesToRecall = await ctx.database.select('onebot_messages')
        .where(queryConditions)
        .orderBy('timestamp', 'desc')
        .limit(Number(messageCount))
        .execute()

      if (!messagesToRecall.length) return

      const task: RecallTask = {
        controller,
        total: messagesToRecall.length,
        success: 0,
        failed: 0,
      }

      channelTasks.add(task)
      recallTasks.set(session.channelId, channelTasks)

      for (const [index, message] of messagesToRecall.entries()) {
        if (controller.signal.aborted) {
          channelTasks.delete(task)
          if (channelTasks.size === 0) {
            recallTasks.delete(session.channelId)
          }
          return
        }

        try {
          await session.bot.deleteMessage(message.channelId, message.messageId)
          await ctx.database.remove('onebot_messages', {
            messageId: message.messageId
          })
          task.success++

          if (index < messagesToRecall.length - 1) await sleep(500)
        } catch (error) {
          task.failed++
          ctx.logger('onebot-manager').warn(`Failed to recall message ${message.messageId}: ${error}`)
        }
      }

      channelTasks.delete(task)
      if (channelTasks.size === 0) {
        recallTasks.delete(session.channelId)
      }

      if (task.total > 1) {
        return `撤回成功${task.success}条${task.failed ? `，失败${task.failed}条` : ''}`
      }
      return
    })

  recall.subcommand('.stop', '停止所有撤回操作')
    .action(async ({ session }) => {
      const channelTasks = recallTasks.get(session.channelId)

      for (const task of channelTasks) {
        task.controller.abort()
      }

      recallTasks.delete(session.channelId)
      return `已停止${channelTasks.size}个撤回操作`
    })

  recall.subcommand('.msgid', '获取消息ID')
    .action(async ({ session }) => {
      if (session.quote) {
        return session.send(session.quote.id)
      }
      return session.send(session.messageId)
    })
}
