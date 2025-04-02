import { Context, Schema } from 'koishi'
import {} from "koishi-plugin-adapter-onebot";
import { OnebotRequest, Request } from './request'
import { utils } from './utils'

export const name = 'onebot-manager'
export const inject = { optional: ['database'] }
export interface Config {
  enable?: boolean
  enableNotify?: boolean
  notifyTarget?: string
  friendRequest?: Request
  guildRequest?: Request
  memberRequest?: Request
  FriendRegTime?: number
  FriendLevel?: number
  FriendVipLevel?: number
  MemberRegTime?: number
  MemberLevel?: number
  MemberVipLevel?: number
  GuildAllowUsers?: string[]
  GuildMinMemberCount?: number
  GuildMaxCapacity?: number
}

// 配置模式
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    enable: Schema.boolean()
      .description('开启请求监听').default(true),
    friendRequest: Schema.union([
      Schema.const('accept').description('同意'),
      Schema.const('reject').description('拒绝'),
      Schema.const('manual').description('手动'),
      Schema.const('auto').description('自动'),
    ]).description('处理好友请求').default('reject'),
    memberRequest: Schema.union([
      Schema.const('accept').description('同意'),
      Schema.const('reject').description('拒绝'),
      Schema.const('manual').description('手动'),
      Schema.const('auto').description('自动'),
    ]).description('处理加群请求').default('reject'),
    guildRequest: Schema.union([
      Schema.const('accept').description('同意'),
      Schema.const('reject').description('拒绝'),
      Schema.const('manual').description('手动'),
      Schema.const('auto').description('自动'),
    ]).description('处理入群邀请').default('reject'),
    enableNotify: Schema.boolean()
      .description('开启请求通知').default(false),
  }).description('请求配置'),
  Schema.union([
    Schema.object({
      enableNotify: Schema.const(true).required(),
      notifyTarget: Schema.string()
        .description('通知目标(group/private:12345)').default(''),
    }),
    Schema.object({}),
  ]),

  Schema.union([
    Schema.object({
      friendRequest: Schema.const('auto').required(),
      FriendRegTime: Schema.number()
        .description('最短注册年份').default(-1),
      FriendLevel: Schema.number()
        .description('最低QQ等级').default(-1),
      FriendVipLevel: Schema.number()
        .description('最低会员等级').default(-1),
    }).description('好友请求通过配置'),
    Schema.object({}),
  ]),
  Schema.union([
    Schema.object({
      memberRequest: Schema.const('auto').required(),
      MemberRegTime: Schema.number()
        .description('最短注册年份').default(-1),
      MemberLevel: Schema.number()
        .description('最低QQ等级').default(-1),
      MemberVipLevel: Schema.number()
        .description('最低会员等级').default(-1),
    }).description('加群请求通过配置'),
    Schema.object({}),
  ]),
  Schema.union([
    Schema.object({
      guildRequest: Schema.const('auto').required(),
      GuildAllowUsers: Schema.array(String)
        .description('邀请ID白名单').default([]),
      GuildMinMemberCount: Schema.number()
        .description('最低群成员数量').default(-1),
      GuildMaxCapacity: Schema.number()
        .description('最低群容量要求').default(-1),
    }).description('入群邀请通过配置'),
    Schema.object({}),
  ]),
])

export function apply(ctx: Context, config: Config = {}) {
  const logger = ctx.logger('onebot-manager')

  if (config.enable !== false) {
    const request = new OnebotRequest(ctx, logger, config)
    request.registerEventListeners()
  }

  // 设置群组专属头衔
  ctx.command('tag [title:text] [target]', '设置群组专属头衔')
    .action(async ({ session }, title = '', target) => {
      let userId = session.userId
      if (target) {
        const parsedId = utils.parseTarget(target)
        if (!parsedId) {
          const message = await session.send('未找到该用户')
          await utils.autoRecall(session, Array.isArray(message) ? message[0] : message)
          return
        }
        userId = parsedId
      }
      try {
        await session.onebot.setGroupSpecialTitle(
          Number(session.guildId),
          Number(userId),
          title
        );
        const targetDesc = userId === session.userId ? '您' : `用户 ${userId}`
        if (title) {
          return `已将${targetDesc}的头衔设置为：${title}`;
        } else {
          return `已清除${targetDesc}的头衔`;
        }
      } catch (error) {
        const message = await session.send(`设置头衔失败: ${error.message}`)
        await utils.autoRecall(session, Array.isArray(message) ? message[0] : message)
        return
      }
    });

  // 精华消息
  const ess = ctx.command('essence [messageId:string]', '设置精华消息')
    .action(async ({ session }, messageId) => {
      if (!messageId && session.quote) {
        messageId = session.quote.id
      }
      if (!messageId) {
        const message = await session.send('请提供消息ID或引用要设置为精华的消息')
        await utils.autoRecall(session, Array.isArray(message) ? message[0] : message)
        return
      }
      try {
        await session.onebot.setEssenceMsg(messageId);
        return
      } catch (error) {
        const message = await session.send(`设置精华消息失败: ${error.message}`)
        await utils.autoRecall(session, Array.isArray(message) ? message[0] : message)
        return
      }
    })
  ess.subcommand('.del [messageId:string]', '移除精华消息')
    .action(async ({ session }, messageId) => {
      if (!messageId && session.quote) {
        messageId = session.quote.id
      }
      if (!messageId) {
        const message = await session.send('请提供消息ID或引用要移除精华的消息')
        await utils.autoRecall(session, Array.isArray(message) ? message[0] : message)
        return
      }
      try {
        await session.onebot.deleteEssenceMsg(messageId);
        return
      } catch (error) {
        const message = await session.send(`移除精华消息失败: ${error.message}`)
        await utils.autoRecall(session, Array.isArray(message) ? message[0] : message)
        return
      }
    });
}
