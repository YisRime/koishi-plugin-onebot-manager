import { Command, Logger } from 'koishi'

/**
 * 计算头衔长度
 */
function getTitleLen(title: string) {
  return Array.from(title).reduce((len, char) => {
    const code = char.codePointAt(0);
    // Emoji 字符
    if (code && (
      (code >= 0x1F000 && code <= 0x1FFFF) || (code >= 0x2600 && code <= 0x26FF) ||
      (code >= 0x2700 && code <= 0x27BF) || code === 0x303D || code === 0x2049 ||
      code === 0x203C || code === 0x2139 || (code >= 0x2000 && code <= 0x200F) ||
      (code >= 0x2028 && code <= 0x202F) || code === 0x205F || (code >= 0x2065 && code <= 0x206F) ||
      (code >= 0x20D0 && code <= 0x20FF) || (code >= 0x2100 && code <= 0x214F) ||
      (code >= 0x2300 && code <= 0x23FF) || (code >= 0x2B00 && code <= 0x2BFF) ||
      (code >= 0x2900 && code <= 0x297F) || (code >= 0x3200 && code <= 0x32FF) ||
      (code >= 0xD800 && code <= 0xDFFF) || (code >= 0xFE00 && code <= 0xFE0F) ||
      (code >= 0xFFF0 && code <= 0xFFFF)
    )) {
      return len + 6;
    }
    // ASCII字符 (英文、数字、标点)
    if (code && code >= 0x0020 && code <= 0x007E) {
      return len + 1;
    }
    // 其他字符 (包括汉字)
    return len + 3;
  }, 0);
}

/**
 * 获取群号
 */
function getGroupId(options: any, session: any): number {
  const groupId = options.group ? Number(options.group) : Number(session.guildId);
  if (isNaN(groupId) || groupId <= 0) throw new Error('无效群号');
  return groupId;
}

/**
 * 获取目标成员ID
 */
async function getTargetId(target: any, session: any, utils: any, groupId: number, roleCheck = false): Promise<string> {
  // 无目标时返回自身ID
  if (!target) return session.userId;
  const parsed = utils.parseTarget(target);
  if (!parsed) return '无效成员';
  // 不需要权限检查或检查通过时返回目标ID
  if (!roleCheck) return parsed;
  try {
    const info = await session.onebot.getGroupMemberInfo(groupId, Number(session.userId), true);
    return info?.role !== 'member' ? parsed : session.userId;
  } catch {
    return '获取成员信息失败';
  }
}

/**
 * 创建标准命令处理函数
 */
function createCommandAction(utils: any, logger: Logger, botRoles: string[], userRoles: string[],
    actionFn: (session: any, options: any, ...args: any[]) => Promise<any>) {
  return ({ session, options }, ...args) =>
    utils.withRoleCheck(session, logger, botRoles, userRoles,
      () => {
        try {
          return actionFn(session, options, ...args);
        } catch (error) {
          return utils.handleError(session, error);
        }
      }
    )();
}

/**
 * 群管理设置/取消操作
 */
function adminAction(set: boolean, utils: any, logger: Logger) {
  return createCommandAction(utils, logger, ['owner'], ['owner', 'admin'],
    async (session, options, target) => {
      if (!target) return '请指定成员';
      const groupId = getGroupId(options, session);
      const targetId = utils.parseTarget(target);
      if (!targetId) return '无效的成员ID';
      await session.onebot.setGroupAdmin(groupId, Number(targetId), set);
      return set ? `已设置成员 ${targetId} 为管理` : `已取消成员 ${targetId} 的管理`;
    }
  );
}

/**
 * 注册所有群管相关命令
 */
export function registerCommands(qgroup: Command, logger: Logger, utils: any) {
  // 设置专属头衔
  qgroup.subcommand('tag [title:string] [target]', '设置专属头衔')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('设置或清除指定成员的群头衔\n使用引号添加不连续的内容，最多18字符\n英文(标点)和数字1字符，中文和其他符号3字符，Emoji6字符')
    .action(createCommandAction(utils, logger, ['owner'], [],
      async (session, options, title = '', target) => {
        if (title && getTitleLen(title) > 18) return '设置头衔失败: 长度超过18字符';
        const groupId = getGroupId(options, session);
        const targetId = await getTargetId(target, session, utils, groupId, !!target);
        await session.onebot.setGroupSpecialTitle(groupId, Number(targetId), title);
        return `已${title ? '将' : '清除'}${targetId === session.userId ? '您' : `用户 ${targetId}`}的头衔${title ? `设置为：${title}` : ''}`;
      }
    ));

  // 设置群名片
  qgroup.subcommand('membercard [card:string] [target]', '设置群名片')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('设置或清除指定成员的群名片')
    .action(createCommandAction(utils, logger, ['owner', 'admin'], ['owner', 'admin'],
      async (session, options, card = '', target) => {
        const groupId = getGroupId(options, session);
        const targetId = await getTargetId(target, session, utils, groupId, !!target);
        await session.onebot.setGroupCard(groupId, Number(targetId), card);
        return `已${card ? '将' : '清除'}${targetId === session.userId ? '您' : `用户 ${targetId}`}的群名片${card ? `设置为：${card}` : ''}`;
      }
    ));

  // 设置群名
  qgroup.subcommand('groupname <group_name:string>', '设置群名称')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('设置当前群的名称')
    .action(createCommandAction(utils, logger, ['owner', 'admin'], ['owner', 'admin'],
      async (session, options, group_name) => {
        if (!group_name) return '请输入群名';
        const groupId = getGroupId(options, session);
        await session.onebot.setGroupName(groupId, group_name);
        return `已将群名设置为：${group_name}`;
      }
    ));

  // 设置精华消息
  const essence = qgroup.subcommand('essence [messageId:string]', '设置精华消息')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('设置指定消息为精华消息')
    .action(createCommandAction(utils, logger, ['owner', 'admin'], ['owner', 'admin'],
      async (session, options, messageId) => {
        messageId = messageId || session.quote?.id;
        if (!messageId) return '请提供消息ID或引用消息';
        await session.onebot.setEssenceMsg(messageId);
        return '已设置精华消息';
      }
    ));

  // 移除精华消息
  essence.subcommand('.del [messageId:string]', '移除精华消息')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('移除指定消息的精华消息')
    .action(createCommandAction(utils, logger, ['owner', 'admin'], ['owner', 'admin'],
      async (session, options, messageId) => {
        messageId = messageId || session.quote?.id;
        if (!messageId) return '请提供消息ID或引用消息';
        await session.onebot.deleteEssenceMsg(messageId);
        return '已移除精华消息';
      }
    ));

  // 设置群管理
  const admin = qgroup.subcommand('admin <target>', '设置群管理')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('设置指定成员为群管理')
    .action(adminAction(true, utils, logger));

  // 取消群管理
  admin.subcommand('.del <target>', '取消群管理')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('取消指定成员的群管理')
    .action(adminAction(false, utils, logger));

  // 禁言群成员
  const mute = qgroup.subcommand('mute <target> [duration]', '禁言群成员')
    .option('cancel', '-c, --cancel 取消禁言')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('禁言指定成员，默认 30 分钟')
    .action(createCommandAction(utils, logger, ['owner', 'admin'], ['owner', 'admin'],
      async (session, options, target, duration) => {
        const groupId = getGroupId(options, session);
        const targetId = utils.parseTarget(target);
        if (!targetId) return '请指定有效成员';
        const banDuration = options.cancel ? 0 : (duration ? Number(duration) : 1800);
        await session.onebot.setGroupBan(groupId, Number(targetId), banDuration);
        return options.cancel
          ? `已取消禁言成员 ${targetId}`
          : `已禁言成员 ${targetId} ${banDuration} 秒`;
      }
    ));

  // 全体禁言
  mute.subcommand('.all [enable:boolean]', '全体禁言')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('开启或关闭全体禁言')
    .action(createCommandAction(utils, logger, ['owner', 'admin'], ['owner', 'admin'],
      async (session, options, enable) => {
        const val = typeof enable === 'boolean' ? enable : true;
        const groupId = getGroupId(options, session);
        await session.onebot.setGroupWholeBan(groupId, val);
        return val ? '已开启全体禁言' : '已关闭全体禁言';
      }
    ));

  // 逐出群成员
  qgroup.subcommand('kick <target>', '逐出群成员')
    .option('reject', '-r, --reject 拒绝再次加群')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('逐出指定成员，使用 -r 拒绝此人再次加群')
    .action(createCommandAction(utils, logger, ['owner', 'admin'], ['owner', 'admin'],
      async (session, options, target) => {
        const targetId = utils.parseTarget(target);
        if (!targetId) return '请指定有效的成员';
        const groupId = getGroupId(options, session);
        await session.onebot.setGroupKick(groupId, Number(targetId), !!options.reject);
        return `已将成员 ${targetId} 逐出群${options.reject ? '，并拒绝其再次加群' : ''}`;
      }
    ));

  // 撤回消息
  qgroup.subcommand('revoke', '撤回消息')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('撤回指定的回复消息')
    .action(createCommandAction(utils, logger, ['owner', 'admin'], [],
      async (session) => {
        const messageId = session.quote?.id;
        if (!messageId) return '请回复需要撤回的消息';
        await session.onebot.deleteMsg(messageId);
        return '';
      }
    ));
}