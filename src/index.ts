import { Context, Schema } from 'koishi'

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
    try {
      const tasks = []
      const now = Date.now()

      if (config.maxMessageRetentionHours > 0) {
        const expirationTimestamp = now - config.maxMessageRetentionHours * 3600000
        tasks.push(ctx.database.remove('onebot_messages', {
          channelId,
          timestamp: { $lt: expirationTimestamp }
        }))
      }

      if (config.maxMessagesPerUser > 0) {
        const userMessageHistory = await ctx.database
          .select('onebot_messages')
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
    } catch (error) {
      logger.error(`Failed to remove expired messages: ${error.message}`)
    }
  }

  const recallTasks = new Map<string, Set<RecallTask>>()

  const handleMessage = async (session) => {
    try {
      if (!session?.messageId) return

      await ctx.database.create('onebot_messages', {
        messageId: session.messageId,
        userId: session.userId,
        channelId: session.channelId,
        timestamp: Date.now(),
      })

      await removeExpiredMessages(session.channelId, session.userId)
    } catch (error) {
      logger.error(`Failed to handle message: ${error.message}`)
    }
  }

  onebotContext.on('message', async (session) => {
    await handleMessage(session)
  })

  onebotContext.on('send', async (session) => {
    await handleMessage(session)
  })

  const recall = onebotContext
    .command('recall [messageCount:number]', '撤回消息')
    .option('user', '-u <user> 撤回指定用户的消息')
    .action(async ({ session, options }, messageCount = 1) => {
      try {
        if (session.quote) {
          await session.bot.deleteMessage(session.channelId, session.quote.id)
          await ctx.database.remove('onebot_messages', { messageId: session.quote.id })
          return
        }

        const channelTasks = recallTasks.get(session.channelId) || new Set()
        const controller = new AbortController()
        const targetUserId = extractUserIdFromMention(options.user)

        const task: RecallTask = {
          controller,
          total: 0,
          success: 0,
          failed: 0,
        }

        const messagesToRecall = await ctx.database
          .select('onebot_messages')
          .where({
            channelId: session.channelId,
            ...(targetUserId && { userId: targetUserId })
          })
          .orderBy('timestamp', 'desc')
          .limit(Number(messageCount))
          .execute()

        if (!messagesToRecall.length) return '没有可撤回的消息'

        task.total = messagesToRecall.length
        channelTasks.add(task)
        recallTasks.set(session.channelId, channelTasks)

        for (const [index, message] of messagesToRecall.entries()) {
          if (controller.signal.aborted) break

          try {
            await session.bot.deleteMessage(message.channelId, message.messageId)
            await ctx.database.remove('onebot_messages', { messageId: message.messageId })
            task.success++

            if (index < messagesToRecall.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 500))
            }
          } catch (error) {
            task.failed++
            logger.warn(`Failed to recall message ${message.messageId}: ${error.message}`)
          }
        }

        channelTasks.delete(task)
        if (channelTasks.size === 0) {
          recallTasks.delete(session.channelId)
        }

        if (task.total > 1) {
          return `撤回完成: 成功${task.success}条${task.failed ? `，失败${task.failed}条` : ''}`
        }
        return
      } catch (error) {
        logger.error(`Recall operation failed: ${error.message}`)
        return '撤回操作失败'
      }
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
        return session.quote.id
      }
      return session.messageId
    })
}
