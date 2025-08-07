import { Context, Schema } from 'koishi'
import {} from "koishi-plugin-adapter-onebot";
import { OnebotRequest, Request } from './request'
import { utils } from './utils'
import { registerCommands } from './command'

export const name = 'onebot-manager'
export const inject = { optional: ['database'] }

export const usage = `
<div style="border-radius: 10px; border: 1px solid #ddd; padding: 16px; margin-bottom: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
  <h2 style="margin-top: 0; color: #4a6ee0;">📌 插件说明</h2>
  <p>📖 <strong>使用文档</strong>：请点击左上角的 <strong>插件主页</strong> 查看插件使用文档</p>
  <p>🔍 <strong>更多插件</strong>：可访问 <a href="https://github.com/YisRime" style="color:#4a6ee0;text-decoration:none;">苡淞的 GitHub</a> 查看本人的所有插件</p>
</div>
<div style="border-radius: 10px; border: 1px solid #ddd; padding: 16px; margin-bottom: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
  <h2 style="margin-top: 0; color: #e0574a;">❤️ 支持与反馈</h2>
  <p>🌟 喜欢这个插件？请在 <a href="https://github.com/YisRime" style="color:#e0574a;text-decoration:none;">GitHub</a> 上给我一个 Star！</p>
  <p>🐛 遇到问题？请通过 <strong>Issues</strong> 提交反馈，或加入 QQ 群 <a href="https://qm.qq.com/q/PdLMx9Jowq" style="color:#e0574a;text-decoration:none;"><strong>855571375</strong></a> 进行交流</p>
</div>
`

export interface Config {
  enable?: boolean
  enableNotify?: boolean
  notifyTarget?: string
  enableJoin?: boolean
  joinMessage?: string
  enableLeave?: boolean
  enableLeaveMsg?: boolean
  leaveMessage?: string
  friendRequest?: Request
  guildRequest?: Request
  memberRequest?: Request
  FriendRegTime?: number
  FriendLevel?: number
  FriendVipLevel?: number
  MemberRegTime?: number
  MemberLevel?: number
  MemberVipLevel?: number
  MemberRequestAutoRules?: { groupId: string; keyword: string }[]
  GuildAllowUsers?: string[]
  GuildMinMemberCount?: number
  GuildMaxCapacity?: number
  manualTimeout?: number
  manualTimeoutAction?: Request
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    enable: Schema.boolean().description('开启请求监听').default(true),
    enableJoin: Schema.boolean().description('开启入群监听').default(false),
    enableLeave: Schema.boolean().description('开启退群监听').default(true),
    enableLeaveMsg: Schema.boolean().description('开启退群提示').default(false),
    joinMessage: Schema.string().default('欢迎{at}加入本群！').description('自定义入群欢迎（占位符: {at}/{user}/{guild}）'),
    leaveMessage: Schema.string().default('{at}已离开本群').description('自定义退群提示（占位符: {at}/{user}/{guild}/{atop}/{op}）'),
  }).description('基础配置'),
  Schema.object({
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
    manualTimeout: Schema.number()
      .description('手动超时时间（分钟）').default(720).min(0),
    manualTimeoutAction: Schema.union([
      Schema.const('accept').description('同意'),
      Schema.const('reject').description('拒绝'),
  ]).description('超时自动操作').default('reject'),
    enableNotify: Schema.boolean()
      .description('开启通知').default(false),
  }).description('请求配置'),
  Schema.union([
    Schema.object({
      enableNotify: Schema.const(true).required(),
      notifyTarget: Schema.string().description('通知目标(guild/private)').default('private:10000'),
    }),
    Schema.object({}),
  ]),
  Schema.union([
    Schema.object({
      friendRequest: Schema.const('auto').required(),
      FriendRegTime: Schema.number().description('最短注册年份').default(-1).min(-1),
      FriendLevel: Schema.number().description('最低QQ等级').default(-1).min(-1).max(256),
      FriendVipLevel: Schema.number().description('最低会员等级').default(-1).min(-1).max(10),
    }).description('好友请求通过配置'),
    Schema.object({}),
  ]),
  Schema.union([
    Schema.object({
      memberRequest: Schema.const('auto').required(),
      MemberRegTime: Schema.number().description('最短注册年份').default(-1).min(-1),
      MemberLevel: Schema.number().description('最低QQ等级').default(-1).min(-1).max(256),
      MemberVipLevel: Schema.number().description('最低会员等级').default(-1).min(-1).max(10),
      MemberAutoRules: Schema.array(Schema.object({
        guildId: Schema.string().description('群号'),
        keyword: Schema.string().description('正则'),
      })).description('关键词规则'),
    }).description('加群请求通过配置'),
    Schema.object({}),
  ]),
  Schema.union([
    Schema.object({
      guildRequest: Schema.const('auto').required(),
      GuildAllowUsers: Schema.array(String).description('白名单邀请人ID').default([]),
      GuildMinMemberCount: Schema.number().description('最低群成员数量').default(-1).min(-1).max(3000),
      GuildMaxCapacity: Schema.union([
        Schema.const(-1).description('不限制'),
        Schema.const(200).description('200'),
        Schema.const(500).description('500'),
        Schema.const(1000).description('1000'),
        Schema.const(2000).description('2000'),
        Schema.const(3000).description('3000'),
      ]).description('最低群容量要求').default(-1),
    }).description('入群邀请通过配置'),
    Schema.object({}),
  ]),
])

export function apply(ctx: Context, config: Config = {}) {
  const logger = ctx.logger('onebot-manager')
  new OnebotRequest(ctx, logger, config).registerEventListeners()
  const qgroup = ctx.command('qgroup', 'QQ 群管').usage('群管相关功能，需要管理权限')
  registerCommands(qgroup, logger, utils)
}
