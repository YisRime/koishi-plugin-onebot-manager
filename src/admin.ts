import { Command, Logger } from 'koishi'

/**
 * adminAction: 设置或取消管理员操作
 */
const adminAction = (enable: boolean, logger: Logger, utils: any) =>
  ({ session }, target) => utils.withRoleCheck(
    session, logger, ['owner'], ['owner', 'admin'], `${enable ? '设置' : '取消'}管理失败: 需要群管权限`,
    async () => {
      let targetId = target ? utils.parseTarget(target) : session.userId
      if (String(targetId) === String(session.userId) && !target)
        return utils.handleError(session, new Error('请指定成员'))
      try {
        await session.onebot.setGroupAdmin(Number(session.guildId), Number(targetId), enable)
        return `${enable ? '已设置' : '已取消'}成员 ${targetId} ${enable ? '为' : '的'}管理`
      } catch (error) {
        return utils.handleError(session, error)
      }
    }
  )()

/**
 * 注册群管相关命令（admin/kick）。
 * @param qgroup 命令分组对象
 * @param logger 日志对象
 * @param utils 工具集
 */
export function registerAdmin(qgroup: Command, logger: Logger, utils: any) {
  const admin = qgroup.subcommand('admin <target>', '设置群管理')
    .usage('设置指定成员为群管理')
    .action(adminAction(true, logger, utils))
  admin.subcommand('.del <target>', '取消群管理')
    .usage('取消指定成员的群管理')
    .action(adminAction(false, logger, utils))

  const mute = qgroup.subcommand('mute <target> [duration]', '禁言群成员')
    .option('cancel', '-c, --cancel 取消禁言')
    .usage('禁言指定成员，默认 30 分钟')
    .action(({ session, options }, target, duration) => utils.withRoleCheck(
      session, logger, ['owner', 'admin'], ['owner', 'admin'], '禁言失败: 需要群管权限',
      async () => {
        let targetId = utils.parseTarget(target)
        if (!targetId) return utils.handleError(session, new Error('请指定成员'))
        let banDuration = options.cancel ? 0 : (duration ? Number(duration) : 1800)
        try {
          await session.onebot.setGroupBan(Number(session.guildId), Number(targetId), banDuration)
          return options.cancel
            ? `已取消禁言成员 ${targetId}`
            : `已禁言成员 ${targetId} ${banDuration} 秒`
        } catch (error) {
          return utils.handleError(session, error)
        }
      }
    )())
  mute.subcommand('.all [enable:boolean]', '全体禁言')
    .usage('开启或关闭全体禁言')
    .action(({ session }, enable) => utils.withRoleCheck(
      session, logger, ['owner', 'admin'], ['owner', 'admin'], '全体禁言失败: 需要群管权限',
      async () => {
        let val = typeof enable === 'boolean' ? enable : true
        try {
          await session.onebot.setGroupWholeBan(Number(session.guildId), val)
          return val ? '已开启全体禁言' : '已关闭全体禁言'
        } catch (error) {
          return utils.handleError(session, error)
        }
      }
    )())

  qgroup.subcommand('kick <target>', '逐出群成员')
    .option('reject', '-r, --reject 拒绝再次加群')
    .usage('逐出指定成员，使用 -r 拒绝此人再次加群')
    .action(({ session, options }, target) => utils.withRoleCheck(
      session, logger, ['owner', 'admin'], ['owner', 'admin'],
      '逐出成员失败: 需要群管权限',
      async () => {
        let targetId = utils.parseTarget(target)
        if (!targetId) return utils.handleError(session, new Error('请指定成员'))
        try {
          await session.onebot.setGroupKick(Number(session.guildId), Number(targetId), !!options.reject)
          return `已将成员 ${targetId} 逐出群${options.reject ? '，并拒绝其再次加群' : ''}`
        } catch (error) {
          return utils.handleError(session, error)
        }
      }
    )())
}