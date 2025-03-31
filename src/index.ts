import { Context, Schema, Session } from 'koishi'
import {} from "koishi-plugin-adapter-onebot";

// 声明OneBot请求事件类型
declare module 'koishi' {
  interface Events {
    'request'(session: Session & RequestEvent): void
  }
}

// 通用请求事件类型
interface RequestEvent {
  post_type: 'request'
  request_type: 'friend' | 'group'
  sub_type?: 'add' | 'invite'
  user_id: number
  comment: string
  flag: string
  time: number
  self_id: number
  group_id?: number
}

// 声明OneBot适配器方法
declare module 'koishi' {
  interface Bot {
    onebot: {
      setFriendAddRequest(flag: string, approve: boolean, remark?: string): Promise<void>
      setGroupAddRequest(flag: string, subType: string, approve: boolean, reason?: string): Promise<void>
    }
  }
}

export const name = 'onebot-manager'

/**
 * 插件配置接口
 */
export interface Config {
  enableNotify?: boolean
  notifyTarget?: string
  requestOption?: RequestOption
  timeout?: number
  timeoutAction?: TimeoutAction
}

type RequestOption = 'accept' | 'reject' | 'manual'
type TimeoutAction = 'accept' | 'reject'
type RequestType = 'friend' | 'guild'

/**
 * 插件配置模式
 */
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    requestOption: Schema.union([
      Schema.const('accept').description('同意'),
      Schema.const('reject').description('拒绝'),
      Schema.const('manual').description('手动'),
    ]).description('处理响应请求').default('accept'),
    enableNotify: Schema.boolean()
      .description('开启通知').default(false),
  }),
  Schema.union([
    Schema.object({
      enableNotify: Schema.const(true).required(),
      notifyTarget: Schema.string()
        .description('通知目标(platform:guild:user)')
        .default('onebot:12345:67890'),
    }),
    Schema.object({}),
  ]),
  Schema.union([
    Schema.object({
      enableNotify: Schema.const(true).required(),
      requestOption: Schema.const('manual').required(),
      timeout: Schema.number()
        .description('等待处理超时时间（分钟）')
        .default(60)
        .min(0),
      timeoutAction: Schema.union([
        Schema.const('accept').description('同意'),
        Schema.const('reject').description('拒绝'),
      ]).description('超时处理').default('reject'),
    }),
    Schema.object({}),
  ]),
])

/**
 * 插件主函数
 * @param ctx Koishi上下文
 * @param config 插件配置
 */
export function apply(ctx: Context, config: Config = {}) {
  const {
    enableNotify = true,
    notifyTarget = '',
    requestOption = 'accept',
    timeout = 0,
    timeoutAction = 'reject'
  } = config
  const typeNames = { friend: '好友申请', guild: '入群邀请' }
  const logger = ctx.logger('onebot-manager')

  /**
   * 获取实体信息（用户或群组）
   * @param session 会话对象
   * @param type 请求类型
   * @returns 实体信息对象
   */
  async function getEntityInfo(session: Session, type: RequestType) {
    if (type === 'friend') {
      const user = await session.bot.getUser?.(session.userId).catch(() => null)
      return {
        nickname: user?.name || user?.nickname || user?.username || '未知用户',
        avatar: user?.avatar || '',
        id: session.userId
      }
    } else {
      const guild = await session.bot.getGuild?.(session.guildId).catch(() => null)
      const user = await session.bot.getUser?.(session.userId).catch(() => null)
      return {
        nickname: guild?.name || '未知群组',
        avatar: guild?.avatar || '',
        id: session.guildId,
        inviter: user?.name || user?.nickname || user?.username || '未知用户',
        inviterId: session.userId
      }
    }
  }

  /**
   * 发送通知消息
   * @param session 会话对象
   * @param type 请求类型
   * @returns 是否成功发送通知
   */
  async function sendNotification(session: Session, type: RequestType) {
    if (!enableNotify) return false

    const info = await getEntityInfo(session, type)
    let message = `收到${typeNames[type]}：\n昵称：${info.nickname}\n`
    if (info.avatar) message += `头像：${info.avatar}\n`

    if (type === 'friend') {
      message += `用户ID：${info.id}\n`
      if ('comment' in session) message += `申请消息：${session.comment}\n`
    } else {
      message += `群组ID：${info.id}\n邀请人：${info.inviter} (${info.inviterId})\n`
    }

    if (requestOption === 'manual') {
      message += `请回复以下内容处理请求：\ny 或 yes - 同意请求\nn [理由] - 拒绝请求，可选填写拒绝理由`;
    }

    try {
      if (notifyTarget) {
        const [guildId, userId] = notifyTarget.split(':')
        if (guildId) {
          await session.bot.sendMessage(guildId, message, userId || undefined)
        } else if (userId) {
          await session.bot.sendPrivateMessage(userId, message)
        }
      } else {
        await session.send(message)
      }
      return true
    } catch (error) {
      logger.error(`发送通知失败: ${error}`)
      return false
    }
  }

  /**
   * 统一处理请求
   * @param session 会话对象
   * @param type 请求类型
   * @param approve 是否同意
   * @param reason 拒绝理由(拒绝时)/好友备注(同意好友请求时)
   */
  async function handleRequest(session: Session & Partial<RequestEvent>, type: RequestType, approve: boolean, reason: string = ''): Promise<boolean> {
    try {
      const flag = session.flag
      if (!flag) {
        logger.error(`处理${typeNames[type]}失败: 缺少请求flag`)
        return false
      }

      if (type === 'friend') {
        // 好友请求：reason作为同意时的备注(remark)
        await session.onebot.setFriendAddRequest(flag, approve, approve ? reason : '')
      } else {
        // 群请求：reason作为拒绝时的理由
        const subType = session.sub_type || 'add'
        await session.onebot.setGroupAddRequest(flag, subType, approve, approve ? '' : reason)
      }

      logger.info(`已${approve ? '同意' : '拒绝'}来自 ${session.userId} 的${typeNames[type]}`)
      return true
    } catch (error) {
      logger.error(`处理${typeNames[type]}失败: ${error}`)
      return false
    }
  }

  // 注册OneBot请求事件监听
  ctx.on('request', async session => {
    // 设置必要的会话字段
    session.userId = session.user_id.toString()

    // 确定请求类型，将group类型映射为guild
    const type: RequestType = session.request_type === 'friend' ? 'friend' : 'guild'
    if (type === 'guild') {
      session.guildId = session.group_id.toString()
    }

    // 记录请求信息
    const subType = type === 'guild' && 'sub_type' in session ? session.sub_type : undefined
    let requestTypeName = typeNames[type]
    if (type === 'guild' && subType) {
      requestTypeName = subType === 'add' ? '加群请求' : '群邀请'
    }

    logger.info(`收到${requestTypeName}: 用户ID ${session.userId}${type === 'guild' ? `, 群ID ${session.guildId}` : ''}`)
    if (session.comment) {
      logger.info(`验证信息: ${session.comment}`)
    }

    // 自动处理
    if (requestOption !== 'manual') {
      await sendNotification(session, type)
      try {
        const approve = requestOption === 'accept'
        await handleRequest(session, type, approve)
      } catch (error) {
        logger.warn(`处理${requestTypeName}请求时发生错误:`, error)
      }
      return
    }

    // 手动处理
    if (enableNotify) {
      const notified = await sendNotification(session, type)
      if (!notified) {
        // 通知失败则按照超时处理策略执行
        try {
          await handleRequest(session, type, timeoutAction === 'accept')
        } catch (error) {
          logger.warn(`处理${requestTypeName}请求时发生错误:`, error)
        }
        return
      }

      try {
        // 等待用户响应
        const response = await session.prompt(timeout ? timeout * 60 * 1000 : undefined)

        // 超时处理
        if (!response) {
          const approve = timeoutAction === 'accept'
          await handleRequest(session, type, approve)
          await session.send(`请求处理超时，已默认${approve ? '通过' : '拒绝'}`)
          return
        }

        // 根据用户响应处理请求
        const content = response.trim().toLowerCase()
        if (content === 'y' || content === 'yes') {
          // 同意请求
          const reason = type === 'friend' ? '好友备注' : ''  // 好友请求时可以添加备注
          await handleRequest(session, type, true, reason)
          await session.send(`已通过${requestTypeName}`)
        } else if (content === 'n' || content.startsWith('n ')) {
          // 拒绝请求，可带理由
          const reason = content.length > 1 ? content.slice(2).trim() : ''
          await handleRequest(session, type, false, reason)
          await session.send(`已拒绝${requestTypeName}${reason ? `，理由：${reason}` : ''}`)
        } else {
          await session.send('格式错误，请回复：\ny 或 yes - 同意请求\nn [理由] - 拒绝请求')
        }
      } catch (e) {
        logger.warn(`处理${requestTypeName}请求时发生错误:`, e)
        try {
          await handleRequest(session, type, timeoutAction === 'accept')
        } catch (error) {
          logger.warn(`处理超时动作时发生错误:`, error)
        }
      }
    }
  })
}
