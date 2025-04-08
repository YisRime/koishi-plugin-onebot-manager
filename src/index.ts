import { Context, Schema } from 'koishi'
import {} from "koishi-plugin-adapter-onebot";
import { OnebotRequest, Request } from './request'
import { utils } from './utils'

export const name = 'onebot-manager'
export const inject = { optional: ['database'] }

/**
 * 插件配置接口
 * @interface Config
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
  botId?: string
}

// 配置模式
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    botId: Schema.string()
      .description('机器人 QQ').required(),
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
 * 插件主函数
 * @param {Context} ctx - Koishi上下文
 * @param {Config} config - 插件配置
 */
export function apply(ctx: Context, config: Config = {}) {
  const logger = ctx.logger('onebot-manager')

  if (config.enable !== false) {
    const request = new OnebotRequest(ctx, logger, config)
    request.registerEventListeners()
  }

  const admin = ctx.command('admin', '群组管理')

  admin.subcommand('tag [title:text] [target]', '设置专属头衔')
    .usage('可使用引号添加以空格分隔的内容，如"原神 启动"')
    .action(async ({ session }, title = '', target) => {
      const role = await utils.checkBotPermission(session, config.botId, logger);
      if (role !== 'owner') {
        const message = await session.send('设置头衔失败: 只有群主可设置专属头衔');
        await utils.autoRecall(session, Array.isArray(message) ? message[0] : message);
        return;
      }
      if (title && !/^[\p{L}\p{N}\p{Z}\p{P}]+$/u.test(title)) {
        const message = await session.send('设置头衔失败: 非文字内容');
        await utils.autoRecall(session, Array.isArray(message) ? message[0] : message);
        return;
      }
      const userId = target ? utils.parseTarget(target) : session.userId;
      try {
        await session.onebot.setGroupSpecialTitle(
          Number(session.guildId),
          Number(userId),
          title
        );
        const targetDesc = userId === session.userId ? '您' : `用户 ${userId}`;
        return title
          ? `已将${targetDesc}的头衔设置为：${title}`
          : `已清除${targetDesc}的头衔`;
      } catch (error) {
        const message = await session.send(`设置头衔失败: ${error.message}`);
        await utils.autoRecall(session, Array.isArray(message) ? message[0] : message);
        return;
      }
    });

  const ess = admin.subcommand('essence [messageId:string]', '设置精华消息')
    .action(async ({ session }, messageId) => {
      const role = await utils.checkBotPermission(session, config.botId, logger);
      if (!role || (role !== 'owner' && role !== 'admin')) {
        const message = await session.send('设置精华消息失败: 无群管理权限');
        await utils.autoRecall(session, Array.isArray(message) ? message[0] : message);
        return;
      }
      messageId = messageId || (session.quote?.id || null);
      if (!messageId) {
        const message = await session.send('请提供消息ID或引用消息');
        await utils.autoRecall(session, Array.isArray(message) ? message[0] : message);
        return;
      }
      try {
        await session.onebot.setEssenceMsg(messageId);
        return;
      } catch (error) {
        const message = await session.send(`设置精华消息失败: ${error.message}`);
        await utils.autoRecall(session, Array.isArray(message) ? message[0] : message);
        return;
      }
    });
  ess.subcommand('.del [messageId:string]', '移除精华消息')
    .action(async ({ session }, messageId) => {
      const role = await utils.checkBotPermission(session, config.botId, logger);
      if (!role || (role !== 'owner' && role !== 'admin')) {
        const message = await session.send('移除精华消息失败: 无群管理权限');
        await utils.autoRecall(session, Array.isArray(message) ? message[0] : message);
        return;
      }
      messageId = messageId || (session.quote?.id || null);
      if (!messageId) {
        const message = await session.send('请提供消息ID或引用消息');
        await utils.autoRecall(session, Array.isArray(message) ? message[0] : message);
        return;
      }
      try {
        await session.onebot.deleteEssenceMsg(messageId);
        return;
      } catch (error) {
        const message = await session.send(`移除精华消息失败: ${error.message}`);
        await utils.autoRecall(session, Array.isArray(message) ? message[0] : message);
        return;
      }
    });
}