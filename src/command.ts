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
  if (isNaN(groupId) || groupId <= 0) throw new Error('无效或未指定群号');
  return groupId;
}

/**
 * 获取目标成员ID
 */
function getTargetId(target: any, session: any, utils: any): string {
  if (!target) return session.userId;
  const parsed = utils.parseTarget(target);
  return parsed;
}

/**
 * 群组命令处理
 */
function createGroupCommand(utils: any, logger: Logger, botRoles: string[], userRoles: string[], commandWhitelist: string[],
    actionFn: (session: any, options: any, groupId: number, ...args: any[]) => Promise<any>) {
  return ({ session, options }, ...args) => {
    try {
      const groupId = getGroupId(options, session);
      const action = () => actionFn(session, options, groupId, ...args);
      return utils.withRoleCheck(session, groupId, logger, botRoles, userRoles, commandWhitelist, action)();
    } catch (error) {
      return utils.handleError(session, error);
    }
  };
}

/**
 * 群管理设置/取消操作
 */
function adminAction(set: boolean, utils: any, logger: Logger, commandWhitelist: string[]) {
  return createGroupCommand(utils, logger, ['owner'], ['owner', 'admin'], commandWhitelist,
    async (session, options, groupId, target) => {
      if (!target) return '请指定成员';
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
export function registerCommands(qgroup: Command, logger: Logger, utils: any, commandWhitelist: string[]) {
  // 设置专属头衔
  qgroup.subcommand('tag [title:string] [target]', '设置专属头衔')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('设置或清除指定成员的群头衔\n使用引号添加不连续的内容，最多18字符\n英文(标点)和数字1字符，中文和其他符号3字符，Emoji6字符')
    .action(async ({ session, options }, title = '', target) => {
      try {
        const groupId = getGroupId(options, session);
        if (title && getTitleLen(title) > 18) return '设置头衔失败: 长度超过18字符';

        const targetId = getTargetId(target, session, utils);
        if (targetId === '无效成员') return targetId;

        const requiredBotRoles = ['owner'];
        const requiredUserRoles = target && targetId !== session.userId ? ['owner', 'admin'] : [];

        const actionFn = async () => {
          await session.onebot.setGroupSpecialTitle(groupId, Number(targetId), title);
          return `已${title ? '将' : '清除'}${targetId === session.userId ? '您' : `用户 ${targetId}`} 的头衔${title ? `设置为：${title}` : ''}`;
        };

        return utils.withRoleCheck(session, groupId, logger, requiredBotRoles, requiredUserRoles, commandWhitelist, actionFn)();
      } catch (error) {
        return utils.handleError(session, error);
      }
    });

  // 设置群名片
  qgroup.subcommand('membercard [card:string] [target]', '设置群名片')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('设置或清除指定成员的群名片')
    .action(async ({ session, options }, card = '', target) => {
      try {
        const groupId = getGroupId(options, session);
        const targetId = getTargetId(target, session, utils);
        if (targetId === '无效成员') return targetId;

        const isTargetingSelf = targetId === session.userId;
        const isTargetingBot = targetId === session.selfId;

        if (isTargetingSelf) {
          await session.onebot.setGroupCard(groupId, Number(targetId), card);
          return `已${card ? '将' : '清除'}您的群名片${card ? `设置为：${card}` : ''}`;
        }

        const requiredUserRoles = ['owner', 'admin'];
        const requiredBotRoles = isTargetingBot ? [] : ['owner', 'admin'];

        const actionFn = async () => {
          await session.onebot.setGroupCard(groupId, Number(targetId), card);
          return `已${card ? '将' : '清除'}用户 ${targetId} 的群名片${card ? `设置为：${card}` : ''}`;
        };

        return utils.withRoleCheck(session, groupId, logger, requiredBotRoles, requiredUserRoles, commandWhitelist, actionFn)();
      } catch (error) {
        return utils.handleError(session, error);
      }
    });

  // 设置群名
  qgroup.subcommand('groupname <group_name:string>', '设置群名称')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('设置当前群的名称')
    .action(createGroupCommand(utils, logger, ['owner', 'admin'], ['owner', 'admin'], commandWhitelist,
      async (session, options, groupId, group_name) => {
        if (!group_name) return '请输入群名';
        await session.onebot.setGroupName(groupId, group_name);
        return `已将群名设置为：${group_name}`;
      }
    ));

  // 设置/移除精华消息
  const essenceAction = (del = false) => createGroupCommand(utils, logger, ['owner', 'admin'], ['owner', 'admin'], commandWhitelist,
    async (session, options, groupId, messageId) => {
      const targetMessageId = session.quote?.id || messageId;
      if (!targetMessageId) return '请提供消息ID或引用消息';
      if (del) {
        await session.onebot.deleteEssenceMsg(targetMessageId);
        return '已移除精华消息';
      }
      await session.onebot.setEssenceMsg(targetMessageId);
      return '已设置精华消息';
    });

  // 设置精华消息
  const essence = qgroup.subcommand('essence [messageId:string]', '设置精华消息')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('在指定群设置精华消息 (权限检查将在目标群进行)')
    .action(essenceAction(false));

  // 移除精华消息
  essence.subcommand('.del [messageId:string]', '移除精华消息')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('在指定群移除精华消息 (权限检查将在目标群进行)')
    .action(essenceAction(true));

  // 设置群管理
  const admin = qgroup.subcommand('admin <target>', '设置群管理')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('设置指定成员为群管理')
    .action(adminAction(true, utils, logger, commandWhitelist));

  // 取消群管理
  admin.subcommand('.del <target>', '取消群管理')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('取消指定成员的群管理')
    .action(adminAction(false, utils, logger, commandWhitelist));

  // 禁言群成员
  const mute = qgroup.subcommand('mute <target> [duration]', '禁言群成员')
    .option('cancel', '-c, --cancel 取消禁言')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('禁言指定成员，默认 30 分钟，最长 30 天')
    .action(createGroupCommand(utils, logger, ['owner', 'admin'], ['owner', 'admin'], commandWhitelist,
      async (session, options, groupId, target, duration) => {
        const targetId = utils.parseTarget(target);
        if (!targetId) return '请指定有效成员';
        const banDuration = options.cancel ? 0 : (duration ? Number(duration) : 1800);
        if (banDuration > 2591999) return `操作失败：禁言时长不能超过 30 天`;
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
    .action(createGroupCommand(utils, logger, ['owner', 'admin'], ['owner', 'admin'], commandWhitelist,
      async (session, options, groupId, enable) => {
        const val = typeof enable === 'boolean' ? enable : true;
        await session.onebot.setGroupWholeBan(groupId, val);
        return val ? '已开启全体禁言' : '已关闭全体禁言';
      }
    ));

  // 逐出群成员
  qgroup.subcommand('kick <target>', '逐出群成员')
    .option('reject', '-r, --reject 拒绝再次加群')
    .option('group', '-g, --group <groupId> 指定群号')
    .usage('逐出指定成员，使用 -r 拒绝此人再次加群')
    .action(createGroupCommand(utils, logger, ['owner', 'admin'], ['owner', 'admin'], commandWhitelist,
      async (session, options, groupId, target) => {
        const targetId = utils.parseTarget(target);
        if (!targetId) return '请指定有效的成员';
        await session.onebot.setGroupKick(groupId, Number(targetId), !!options.reject);
        return `已将成员 ${targetId} 逐出群${options.reject ? '，并拒绝其再次加群' : ''}`;
      }
    ));

  // 撤回消息
  qgroup.subcommand('revoke', '撤回消息')
    .usage('回复指定消息来撤回对应内容。')
    .action(async ({ session }) => {
      const quote = session.quote;
      if (!quote?.id) return '请回复需要撤回的消息';
      try {
        const isWhitelisted = commandWhitelist.includes(session.userId);
        if (isWhitelisted) {
          await session.onebot.deleteMsg(quote.id);
          return;
        }
        const { user: userRole } = await utils.checkPermission(session, session.guildId, logger);
        if (userRole !== 'member' || quote.user?.id === session.userId || quote.user?.id === session.selfId) {
          await session.onebot.deleteMsg(quote.id);
        } else {
          return utils.handleError(session, '仅管理员可撤回他人消息');
        }
      } catch (error) {
        return utils.handleError(session, error);
      }
    });
}
