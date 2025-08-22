import { Context, Schema } from 'koishi'
import {} from "koishi-plugin-adapter-onebot";
import { OnebotRequest } from './request'
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
  notifyTarget?: string
  enableJoin?: boolean
  joinMessage?: string
  enableLeave?: boolean
  leaveMessage?: string
  enableKick?: boolean
  commandWhitelist?: string[]
  FriendLevel?: number
  FriendRequestAutoRegex?: string
  MemberRequestAutoRules?: { guildId: string; keyword: string; minLevel: number }[]
  GuildAllowUsers?: string[]
  GuildMinMemberCount?: number
  GuildMaxCapacity?: number
  manualTimeout?: number
  manualTimeoutAction?: 'accept' | 'reject'
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    enable: Schema.boolean().description('开启请求监听').default(true),
    enableKick: Schema.boolean().description('开启被踢监听').default(true),
    enableJoin: Schema.boolean().description('开启入群监听').default(false),
    enableLeave: Schema.boolean().description('开启退群监听').default(false),
    joinMessage: Schema.string().default('欢迎 {userName} 加入本群！').description('自定义入群欢迎'),
    leaveMessage: Schema.string().default('{userName} 已离开本群').description('自定义退群提示'),
    commandWhitelist: Schema.array(String).description('命令白名单').role('table'),
  }).description('基础配置'),
  Schema.object({
    notifyTarget: Schema.string().description('通知目标(guild/private:number)').required(),
    manualTimeout: Schema.number()
      .description('超时时长').default(720).min(0),
    manualTimeoutAction: Schema.union([
      Schema.const('accept').description('同意'),
      Schema.const('reject').description('拒绝'),
    ]).description('超时操作').default('accept'),
  }).description('请求配置'),
  Schema.object({
    FriendLevel: Schema.number().description('好友申请等级').default(-1).min(-1).max(256),
    GuildMinMemberCount: Schema.number().description('最低群成员数').default(-1).min(-1).max(3000),
    GuildMaxCapacity: Schema.number().description('最低受邀容量').default(-1).min(-1).max(3000),
    FriendRequestAutoRegex: Schema.string().description('好友申请正则'),
    GuildAllowUsers: Schema.array(String).description('额外邀群白名'),
    MemberRequestAutoRules: Schema.array(Schema.object({
      guildId: Schema.string().description('群号'),
      keyword: Schema.string().description('正则'),
      minLevel: Schema.number().description('等级').default(-1),
    })).description('加群自动审批').role('table'),
  }).description('条件配置'),
])

export function apply(ctx: Context, config: Config = {}) {
  const logger = ctx.logger('onebot-manager')
  new OnebotRequest(ctx, logger, config).registerEventListeners()
  const qgroup = ctx.command('qgroup', 'QQ 群管').usage('群管相关功能，需要管理权限')
  registerCommands(qgroup, logger, utils, config.commandWhitelist || [])
}
