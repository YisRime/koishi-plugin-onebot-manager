import { Command, Logger } from 'koishi'

/**
 * 计算头衔长度
 * @param {string} title - 头衔字符串
 * @returns {number} 头衔长度
 */
function getTitleLen(title: string) {
  let len = 0
  for (const char of Array.from(title)) {
    const code = char.codePointAt(0)!
    len += (
      (code >= 0x1F600 && code <= 0x1F64F) || (code >= 0x1F300 && code <= 0x1F5FF) ||
      (code >= 0x1F680 && code <= 0x1F6FF) || (code >= 0x2600 && code <= 0x26FF) ||
      (code >= 0x2700 && code <= 0x27BF) || (code >= 0x1F900 && code <= 0x1F9FF) ||
      (code >= 0x1FA70 && code <= 0x1FAFF)
    ) ? 6 : (code >= 0x20 && code <= 0x7E) ? 1 : 3
  }
  return len
}

/**
 * 获取群号
 * @param {any} options - 命令选项
 * @param {any} session - 会话对象
 * @returns {number} 群号
 */
function getGroupId(options: any, session: any) {
  return options.group ? Number(options.group) : Number(session.guildId)
}

/**
 * 获取目标成员ID
 * @param {any} target - 目标
 * @param {any} session - 会话对象
 * @param {any} utils - 工具对象
 * @param {number} groupId - 群号
 * @param {boolean} [roleCheck=false] - 是否检查权限
 * @returns {Promise<string|number>} 目标成员ID
 */
function getTargetId(target: any, session: any, utils: any, groupId: number, roleCheck = false) {
  if (!target) return session.userId
  if (!roleCheck) return utils.parseTarget(target)
  return session.onebot.getGroupMemberInfo(groupId, Number(session.userId), true)
    .then((info: any) => info?.role !== 'member' ? utils.parseTarget(target) : session.userId)
}

/**
 * 群管理设置/取消操作
 * @param {boolean} set - 是否设置为管理
 * @param {any} utils - 工具对象
 * @param {Logger} logger - 日志对象
 * @returns {Function} 命令处理函数
 */
function adminAction(set: boolean, utils: any, logger: Logger) {
  return async ({ session, options }, target) => {
    if (!target) return utils.handleError(session, new Error('请指定成员'))
    return utils.withRoleCheck(session, logger, ['owner'], ['owner', 'admin'],
      async () => {
        const groupId = getGroupId(options, session)
        const targetId = target ? utils.parseTarget(target) : session.userId
        try {
          await session.onebot.setGroupAdmin(groupId, Number(targetId), set)
          return set
            ? `已设置成员 ${targetId} 为管理`
            : `已取消成员 ${targetId} 的管理`
        } catch (error) {
          return utils.handleError(session, error)
        }
      }
    )
  }
}

/**
 * 注册所有群管相关命令
 * @param {Command} qgroup - 群命令对象
 * @param {Logger} logger - 日志对象
 * @param {any} utils - 工具对象
 */
export function registerCommands(qgroup: Command, logger: Logger, utils: any) {
  qgroup.subcommand('tag [title:string] [target]', '设置专属头衔')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('设置或清除指定成员的群头衔\n使用引号添加不连续的内容，最多18字符\n英文(标点)和数字1字符，中文和其他符号3字符，Emoji6字符')
    .action(async ({ session, options }, title = '', target) =>
      utils.withRoleCheck(session, logger, ['owner'], [],
        async () => {
          if (title && getTitleLen(title) > 18)
            return utils.handleError(session, new Error('设置头衔失败: 长度超过18字符'));
          const groupId = getGroupId(options, session)
          const targetId = await getTargetId(target, session, utils, groupId, !!target)
          try {
            await session.onebot.setGroupSpecialTitle(groupId, Number(targetId), title)
            return `已${title ? '将' : '清除'}${targetId === session.userId ? '您' : `用户 ${targetId}`}的头衔${title ? `设置为：${title}` : ''}`
          } catch (error) {
            return utils.handleError(session, error)
          }
        }
      )()
    )

  qgroup.subcommand('membercard [card:string] [target]', '设置群名片')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('设置或清除指定成员的群名片')
    .action(async ({ session, options }, card = '', target) => utils.withRoleCheck(session, logger, ['owner', 'admin'], ['owner', 'admin'],
      async () => {
        const groupId = getGroupId(options, session)
        const targetId = await getTargetId(target, session, utils, groupId, !!target)
        try {
          await session.onebot.setGroupCard(groupId, Number(targetId), card)
          return `已${card ? '将' : '清除'}${targetId === session.userId ? '您' : `用户 ${targetId}`}的群名片${card ? `设置为：${card}` : ''}`
        } catch (error) {
          return utils.handleError(session, error)
        }
      }
    )())

  qgroup.subcommand('groupname <group_name:string>', '设置群名')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('设置当前群的群名')
    .action(({ session, options }, group_name) => utils.withRoleCheck(session, logger, ['owner', 'admin'], ['owner', 'admin'],
      async () => {
        if (!group_name) return utils.handleError(session, new Error('请输入群名'))
        try {
          await session.onebot.setGroupName(getGroupId(options, session), group_name)
          return `已将群名设置为：${group_name}`
        } catch (error) {
          return utils.handleError(session, error)
        }
      }
    )())

  const essenceCmd = qgroup.subcommand('essence [messageId:string]', '设置精华消息')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('设置指定消息为精华消息')
    .action(({ session }, messageId) => utils.withRoleCheck(session, logger, ['owner', 'admin'], ['owner', 'admin'],
      async () => {
        messageId = messageId || session.quote?.id
        if (!messageId) return utils.handleError(session, new Error('请提供消息ID或引用消息'))
        try {
          await session.onebot.setEssenceMsg(messageId)
          return '已设置精华消息'
        } catch (error) {
          return utils.handleError(session, error)
        }
      }
    ))
  essenceCmd.subcommand('.del [messageId:string]', '移除精华消息')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('移除指定消息的精华消息')
    .action(({ session }, messageId) => utils.withRoleCheck(session, logger, ['owner', 'admin'], ['owner', 'admin'],
      async () => {
        messageId = messageId || session.quote?.id
        if (!messageId) return utils.handleError(session, new Error('请提供消息ID或引用消息'))
        try {
          await session.onebot.deleteEssenceMsg(messageId)
          return '已移除精华消息'
        } catch (error) {
          return utils.handleError(session, error)
        }
      }
    ))

  const admin = qgroup.subcommand('admin <target>', '设置群管理')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('设置指定成员为群管理')
    .action(adminAction(true, utils, logger))
  admin.subcommand('.del <target>', '取消群管理')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('取消指定成员的群管理')
    .action(adminAction(false, utils, logger))

  const mute = qgroup.subcommand('mute <target> [duration]', '禁言群成员')
    .option('cancel', '-c, --cancel 取消禁言')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('禁言指定成员，默认 30 分钟')
    .action(({ session, options }, target, duration) => utils.withRoleCheck(session, logger, ['owner', 'admin'], ['owner', 'admin'],
      async () => {
        const targetId = utils.parseTarget(target)
        if (!targetId) return utils.handleError(session, new Error('请指定成员'))
        const banDuration = options.cancel ? 0 : (duration ? Number(duration) : 1800)
        try {
          await session.onebot.setGroupBan(getGroupId(options, session), Number(targetId), banDuration)
          return options.cancel
            ? `已取消禁言成员 ${targetId}`
            : `已禁言成员 ${targetId} ${banDuration} 秒`
        } catch (error) {
          return utils.handleError(session, error)
        }
      }
    ))
  mute.subcommand('.all [enable:boolean]', '全体禁言')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('开启或关闭全体禁言')
    .action(({ session, options }, enable) => utils.withRoleCheck(session, logger, ['owner', 'admin'], ['owner', 'admin'],
      async () => {
        const val = typeof enable === 'boolean' ? enable : true
        try {
          await session.onebot.setGroupWholeBan(getGroupId(options, session), val)
          return val ? '已开启全体禁言' : '已关闭全体禁言'
        } catch (error) {
          return utils.handleError(session, error)
        }
      }
    ))

  qgroup.subcommand('kick <target>', '逐出群成员')
    .option('reject', '-r, --reject 拒绝再次加群')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('逐出指定成员，使用 -r 拒绝此人再次加群')
    .action(({ session, options }, target) => utils.withRoleCheck(session, logger, ['owner', 'admin'], ['owner', 'admin'],
      async () => {
        const targetId = utils.parseTarget(target)
        if (!targetId) return utils.handleError(session, new Error('请指定成员'))
        try {
          await session.onebot.setGroupKick(getGroupId(options, session), Number(targetId), !!options.reject)
          return `已将成员 ${targetId} 逐出群${options.reject ? '，并拒绝其再次加群' : ''}`
        } catch (error) {
          return utils.handleError(session, error)
        }
      }
    ))

  qgroup.subcommand('revoke', '撤回消息')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('撤回指定的回复消息')
    .action(({ session }) => utils.withRoleCheck(session, logger, ['owner', 'admin'], ['owner', 'admin'],
      async () => {
        const messageId = session.quote?.id
        if (!messageId) return utils.handleError(session, new Error('请回复需要撤回的消息'))
        try {
          await session.onebot.deleteMsg(Number(messageId))
          return ``
        } catch (error) {
          return utils.handleError(session, error)
        }
      }
    )())
}