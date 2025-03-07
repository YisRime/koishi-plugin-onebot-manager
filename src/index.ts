import { Context, Schema } from 'koishi'

export const name = 'onebot-manager'

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

  const recallTasks = new Map<string, AbortController>()

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

  const cmd = onebotContext
    .command('recall [messageCount:number]', '撤回历史消息记录')
    .userFields(['authority'])
    .option('user', '-u <user> 撤回指定用户的消息，支持@或用户ID')

  cmd.action(async ({ session, options }, messageCount = 1) => {
    if (recallTasks.has(session.channelId)) {
      return '已有正在进行的撤回操作，请等待完成或使用 recall.stop 停止'
    }

    const controller = new AbortController()
    recallTasks.set(session.channelId, controller)

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

    if (!messagesToRecall.length) {
      recallTasks.delete(session.channelId)
      return targetUserId
        ? '未找到该用户的历史消息'
        : '当前频道没有可撤回的历史消息'
    }

    await session.send(`开始撤回消息，共${messagesToRecall.length}条`)

    const failedMessageIds: string[] = []
    for (const [index, message] of messagesToRecall.entries()) {
      if (controller.signal.aborted) {
        recallTasks.delete(session.channelId)
        return '已停止撤回'
      }

      try {
        await session.bot.deleteMessage(message.channelId, message.messageId)
        if (index < messagesToRecall.length - 1) await sleep(500)
      } catch (error) {
        failedMessageIds.push(message.messageId)
        ctx.logger('onebot-manager').warn(`Failed to recall message ${message.messageId}: ${error}`)
      }
    }

    recallTasks.delete(session.channelId)

    const successMessageIds = messagesToRecall
      .filter(msg => !failedMessageIds.includes(msg.messageId))
      .map(msg => msg.messageId)

    if (successMessageIds.length) {
      await ctx.database.remove('onebot_messages', {
        messageId: { $in: successMessageIds }
      })
    }

    const successCount = successMessageIds.length
    return `已成功撤回${targetUserId ? '指定用户的' : ''}${successCount}条消息${
      failedMessageIds.length ? `，${failedMessageIds.length}条消息撤回失败` : ''
    }`
  })

  cmd.subcommand('.stop', '停止正在进行的撤回操作')
    .action(async ({ session }) => {
      const controller = recallTasks.get(session.channelId)
      if (!controller) {
        return '当前没有正在进行的撤回操作'
      }

      controller.abort()
      recallTasks.delete(session.channelId)
      return '已停止撤回'
    })
}
