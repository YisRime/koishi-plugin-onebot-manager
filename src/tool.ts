import { Command, Logger } from 'koishi'

/**
 * 计算头衔长度（英文1，中文3，emoji6）
 * @param title 头衔字符串
 * @returns 长度
 */
function getTitleLen(title: string) {
  let len = 0
  for (const char of Array.from(title)) {
    const code = char.codePointAt(0)!
    len += (
      (code >= 0x1F600 && code <= 0x1F64F) ||
      (code >= 0x1F300 && code <= 0x1F5FF) ||
      (code >= 0x1F680 && code <= 0x1F6FF) ||
      (code >= 0x2600 && code <= 0x26FF) ||
      (code >= 0x2700 && code <= 0x27BF) ||
      (code >= 0x1F900 && code <= 0x1F9FF) ||
      (code >= 0x1FA70 && code <= 0x1FAFF)
    ) ? 6 : (code >= 0x20 && code <= 0x7E) ? 1 : 3
  }
  return len
}

/**
 * essenceAction: 设置/移除精华消息
 */
const essenceAction = (action: 'set' | 'del', logger: Logger, utils: any) =>
  ({ session }, messageId) => utils.withRoleCheck(
    session, logger, ['owner', 'admin'], ['owner', 'admin'],
    `${action === 'set' ? '设置' : '移除'}精华消息失败: 无群管权限`,
    async () => {
      messageId = messageId || session.quote?.id
      if (!messageId) return utils.handleError(session, new Error('请提供消息ID或引用消息'))
      try {
        await session.onebot[action === 'set' ? 'setEssenceMsg' : 'deleteEssenceMsg'](messageId)
        return `${action === 'set' ? '已设置' : '已移除'}精华消息`
      } catch (error) {
        return utils.handleError(session, error)
      }
    }
  )()

/**
 * 注册群管工具命令
 * @param qgroup 命令分组
 * @param logger 日志对象
 * @param utils 工具集
 */
export function registerTool(qgroup: Command, logger: Logger, utils: any) {
  qgroup.subcommand('tag [title:string] [target]', '设置专属头衔')
    .usage('设置或清除指定成员的群头衔\n使用引号添加不连续的内容，最多18字符\n英文(标点)和数字1字符，中文和其他符号3字符，Emoji6字符')
    .action(async ({ session }, title = '', target) =>
      utils.withRoleCheck(
        session, logger, !target ? [] : ['owner', 'admin'], ['owner'], '设置头衔失败: 需要群管权限',
        async () => {
          if (title && getTitleLen(title) > 18)
            return utils.handleError(session, new Error('设置头衔失败: 长度超过18字符'));
          let targetId = session.userId;
          if (target) {
            const info = await session.onebot.getGroupMemberInfo(Number(session.guildId), Number(session.userId), true);
            if (info?.role !== 'member') targetId = utils.parseTarget(target);
          }
          try {
            await session.onebot.setGroupSpecialTitle(Number(session.guildId), Number(targetId), title);
            return `已${title ? '将' : '清除'}${targetId === session.userId ? '您' : `用户 ${targetId}`}的头衔${title ? `设置为：${title}` : ''}`;
          } catch (error) {
            return utils.handleError(session, error);
          }
        }
      )()
    )

  qgroup.subcommand('card [card:string] [target]', '设置群名片')
    .usage('设置或清除指定成员的群名片')
    .action(({ session }, card = '', target) => utils.withRoleCheck(
      session, logger, ['owner', 'admin'], ['owner', 'admin'], '设置群名片失败: 需要群管权限',
      async () => {
        let targetId = session.userId
        if (target) {
          const memberInfo = await session.onebot.getGroupMemberInfo(Number(session.guildId), Number(session.userId), true)
          if (memberInfo?.role !== 'member') targetId = utils.parseTarget(target)
        }
        try {
          await session.onebot.setGroupCard(Number(session.guildId), Number(targetId), card)
          return `已${card ? '将' : '清除'}${targetId === session.userId ? '您' : `用户 ${targetId}`}的群名片${card ? `设置为：${card}` : ''}`
        } catch (error) {
          return utils.handleError(session, error)
        }
      }
    )())

  qgroup.subcommand('gname <group_name:string>', '设置群名')
    .usage('设置当前群的群名')
    .action(({ session }, group_name) => utils.withRoleCheck(
      session, logger, ['owner', 'admin'], ['owner', 'admin'], '设置群名失败: 需要群管权限',
      async () => {
        if (!group_name) return utils.handleError(session, new Error('请输入群名'))
        try {
          await session.onebot.setGroupName(Number(session.guildId), group_name)
          return `已将群名设置为：${group_name}`
        } catch (error) {
          return utils.handleError(session, error)
        }
      }
    )())

  const ess = qgroup.subcommand('essence [messageId:string]', '设置精华消息')
    .usage('设置指定消息为精华消息')
    .action(({ session }, messageId) => utils.withRoleCheck(
      session, logger, ['owner', 'admin'], ['owner', 'admin'], '设置精华消息失败: 需要群管权限',
      essenceAction('set', logger, utils).bind(null, { session }, messageId)
    ))
  ess.subcommand('.del [messageId:string]', '移除精华消息')
    .usage('移除指定消息的精华消息')
    .action(({ session }, messageId) => utils.withRoleCheck(
      session, logger, ['owner', 'admin'], ['owner', 'admin'], '移除精华消息失败: 需要群管权限',
      essenceAction('del', logger, utils).bind(null, { session }, messageId)
    ))
}