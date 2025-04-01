import { Context, Schema } from 'koishi'
import {} from "koishi-plugin-adapter-onebot";
import { OnebotRequest, RequestOption } from './request'
import { utils } from './utils'

export const name = 'onebot-manager'

export interface Config {
  enable?: boolean
  enableNotify?: boolean
  notifyTarget?: string
  requestOption?: RequestOption
}

// 配置模式
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    enable: Schema.boolean()
      .description('是否启用监听').default(true),
    requestOption: Schema.union([
      Schema.const('accept').description('同意'),
      Schema.const('reject').description('拒绝'),
      Schema.const('manual').description('手动'),
    ]).description('如何处理请求').default('reject'),
    enableNotify: Schema.boolean()
      .description('开启通知').default(false),
  }).description('请求配置'),
  Schema.union([
    Schema.object({
      enableNotify: Schema.const(true).required(),
      notifyTarget: Schema.string()
        .description('通知目标(group/private:12345)').default(''),
    }),
  ]),
])

export function apply(ctx: Context, config: Config = {}) {
  const logger = ctx.logger('onebot-manager')
  const request = new OnebotRequest(ctx, logger, config)

  if (config.enable !== false) {
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
}
