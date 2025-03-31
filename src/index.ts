import { Context, Schema } from 'koishi'
import {} from "koishi-plugin-adapter-onebot";
import { OnebotRequest, RequestOption, TimeoutAction } from './request'

export const name = 'onebot-manager'

export interface Config {
  enable?: boolean
  enableNotify?: boolean
  notifyTarget?: string
  requestOption?: RequestOption
  timeout?: number
  timeoutAction?: TimeoutAction
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
        .description('通知目标(group/private:12345)')
        .default(''),
    }),
  ]),
  Schema.union([
    Schema.object({
      enableNotify: Schema.const(true).required(),
      requestOption: Schema.const('manual').required(),
      timeout: Schema.number()
        .description('超时时间（分）').min(0).default(60),
      timeoutAction: Schema.union([
        Schema.const('accept').description('同意'),
        Schema.const('reject').description('拒绝'),
      ]).description('默认超时选项').default('reject'),
    }),
  ]),
])

export function apply(ctx: Context, config: Config = {}) {
  const logger = ctx.logger('onebot-manager')
  const request = new OnebotRequest(ctx, logger, config)

  if (config.enable !== false) {
    request.registerEventListeners()
  }
}
