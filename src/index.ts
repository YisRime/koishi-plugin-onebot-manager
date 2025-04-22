import { Context, Schema } from 'koishi'
import {} from "koishi-plugin-adapter-onebot";
import { OnebotRequest, Request } from './request'
import { utils } from './utils'

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

/**
 * 插件配置接口
 */
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
  manualTimeout?: number
  manualTimeoutAction?: Request
}

// 配置模式
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    enable: Schema.boolean()
      .description('开启请求监听').default(true),
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
      .description('手动超时时间（分钟）').default(60).min(0),
    manualTimeoutAction: Schema.union([
      Schema.const('accept').description('同意'),
      Schema.const('reject').description('拒绝'),
  ]).description('超时自动操作').default('reject'),
    enableNotify: Schema.boolean()
      .description('开启请求通知').default(false),
  }).description('请求配置'),
  Schema.union([
    Schema.object({
      enableNotify: Schema.const(true).required(),
      notifyTarget: Schema.string()
        .description('通知目标(guild/private)').default('private:10000'),
    }),
    Schema.object({}),
  ]),
  Schema.union([
    Schema.object({
      friendRequest: Schema.const('auto').required(),
      FriendRegTime: Schema.number()
        .description('最短注册年份').default(-1).min(-1),
      FriendLevel: Schema.number()
        .description('最低QQ等级').default(-1).min(-1).max(256),
      FriendVipLevel: Schema.number()
        .description('最低会员等级').default(-1).min(-1).max(10),
    }).description('好友请求通过配置'),
    Schema.object({}),
  ]),
  Schema.union([
    Schema.object({
      memberRequest: Schema.const('auto').required(),
      MemberRegTime: Schema.number()
        .description('最短注册年份').default(-1).min(-1),
      MemberLevel: Schema.number()
        .description('最低QQ等级').default(-1).min(-1).max(256),
      MemberVipLevel: Schema.number()
        .description('最低会员等级').default(-1).min(-1).max(10),
    }).description('加群请求通过配置'),
    Schema.object({}),
  ]),
  Schema.union([
    Schema.object({
      guildRequest: Schema.const('auto').required(),
      GuildAllowUsers: Schema.array(String)
        .description('白名单邀请人ID').default([]),
      GuildMinMemberCount: Schema.number()
        .description('最低群成员数量').default(-1).min(-1).max(3000),
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

/**
 * 插件主入口
 * @param ctx Koishi 上下文
 * @param config 插件配置
 */
export function apply(ctx: Context, config: Config = {}) {
  const logger = ctx.logger('onebot-manager')

  if (config.enable !== false) {
    const request = new OnebotRequest(ctx, logger, config)
    request.registerEventListeners()
  }

  const qmanage = ctx.command('qmanage', '群组管理')

  /**
   * 设置专属头衔
   */
  qmanage.subcommand('tag [title:string] [target]', '设置专属头衔')
    .usage('可使用引号添加以空格分隔的内容，如"原神 启动"，总计不能超过 18 字符')
    .action(async ({ session }, title = '', target) => {
      const botRole = await utils.checkBotPermission(session, logger);
      if (botRole !== 'owner') {
        const msg = await session.send('设置头衔失败: 只有群主可设置头衔');
        utils.autoRecall(session, Array.isArray(msg) ? msg[0] : msg);
        return;
      }
      try {
        if (title) {
          const titleLength = title.length + (title.match(/[\u4e00-\u9fa5]/g)?.length || 0) * 2;
          if (titleLength > 18) {
            const msg = await session.send('设置头衔失败: 头衔长度超过18字符');
            utils.autoRecall(session, Array.isArray(msg) ? msg[0] : msg);
            return;
          }
        }
        // 目标用户ID判定
        let targetId = session.userId;
        if (target) {
          const memberInfo = await session.onebot.getGroupMemberInfo(
            Number(session.guildId),
            Number(session.userId),
            true
          );
          if (memberInfo?.role !== 'member') {
            const parsedId = utils.parseTarget(target);
            if (parsedId) targetId = parsedId;
            else {
              const msg = await session.send('无效的目标用户');
              utils.autoRecall(session, Array.isArray(msg) ? msg[0] : msg);
              return;
            }
          }
        }
        await session.onebot.setGroupSpecialTitle(
          Number(session.guildId),
          Number(targetId),
          title
        );
        return `已${title ? '将' : '清除'}${targetId === session.userId ? '您' : `用户 ${targetId}`}的头衔${title ? `设置为：${title}` : ''}`;
      } catch (error) {
        const msg = await session.send(`设置头衔失败: ${error.message}`);
        utils.autoRecall(session, Array.isArray(msg) ? msg[0] : msg);
      }
    });

  /**
   * 设置精华消息
   */
  const ess = qmanage.subcommand('essence [messageId:string]', '设置精华消息')
    .action(async ({ session }, messageId) => {
      const role = await utils.checkBotPermission(session, logger);
      if (!role || (role !== 'owner' && role !== 'admin')) {
        const msg = await session.send('设置精华消息失败: 无群管理权限');
        await utils.autoRecall(session, Array.isArray(msg) ? msg[0] : msg);
        return;
      }
      messageId = messageId || (session.quote?.id || null);
      if (!messageId) {
        const msg = await session.send('请提供消息ID或引用消息');
        await utils.autoRecall(session, Array.isArray(msg) ? msg[0] : msg);
        return;
      }
      try {
        await session.onebot.setEssenceMsg(messageId);
      } catch (error) {
        const msg = await session.send(`设置精华消息失败: ${error.message}`);
        await utils.autoRecall(session, Array.isArray(msg) ? msg[0] : msg);
      }
    });
  ess.subcommand('.del [messageId:string]', '移除精华消息')
    .action(async ({ session }, messageId) => {
      const role = await utils.checkBotPermission(session, logger);
      if (!role || (role !== 'owner' && role !== 'admin')) {
        const msg = await session.send('移除精华消息失败: 无群管理权限');
        await utils.autoRecall(session, Array.isArray(msg) ? msg[0] : msg);
        return;
      }
      messageId = messageId || (session.quote?.id || null);
      if (!messageId) {
        const msg = await session.send('请提供消息ID或引用消息');
        await utils.autoRecall(session, Array.isArray(msg) ? msg[0] : msg);
        return;
      }
      try {
        await session.onebot.deleteEssenceMsg(messageId);
      } catch (error) {
        const msg = await session.send(`移除精华消息失败: ${error.message}`);
        await utils.autoRecall(session, Array.isArray(msg) ? msg[0] : msg);
      }
    });
}