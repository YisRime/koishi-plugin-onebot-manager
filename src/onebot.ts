import { utils } from './utils'

/**
 * Onebot 服务类，封装 Onebot 相关命令与工具
 */
export class Onebot {
  static sexMap = {
    'male': '男',
    'female': '女'
  };

  /**
   * 分页处理
   * @param session 会话对象
   * @param data 数据数组
   * @param page 页码或'all'
   * @param pageSize 每页数量
   * @returns 分页结果
   */
  handlePagination<T>(session, data: T[], page: string, pageSize = 10) {
    if (page === 'all') return { displayData: data, pageInfo: '：\n', totalPages: 1 }
    const totalPages = Math.ceil(data.length / pageSize)
    const pageNum = parseInt(page) || 1
    if (isNaN(pageNum) || pageNum < 1 || (pageNum - 1) * pageSize >= data.length) {
      utils.handleError(session, new Error('操作失败: 无效页码'))
      return null
    }
    const start = (pageNum - 1) * pageSize
    return { displayData: data.slice(start, start + pageSize), pageInfo: `（第 ${pageNum}/${totalPages} 页）：\n`, totalPages }
  }

  /**
   * 格式化用户信息
   * @param info 用户信息对象
   * @returns 格式化字符串
   */
  static formatUserInfo(info: any): string {
    let result = `${info.nickname || info.nick}(${info.user_id || info.uin})\n`
    if (info.qid) result += `QID: ${info.qid}\n`
    if (info.uid) result += `UID: ${info.uid}\n`
    if (info.long_nick || info.longNick) result += `个性签名: \n${info.long_nick || info.longNick}\n`
    result += '\n个人信息: \n'
    const personalInfo = [
      info.sex && info.sex !== 'unknown' ? (Onebot.sexMap[info.sex] || info.sex) : '',
      info.age ? `${info.age}岁` : '',
      info.birthday_year && info.birthday_month && info.birthday_day ? `${info.birthday_year}-${info.birthday_month}-${info.birthday_day}` : ''
    ].filter(Boolean)
    if (personalInfo.length) result += `${personalInfo.join(' | ')}\n`
    const shengXiaos = ['', '鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪']
    const constellations = ['', '水瓶座', '双鱼座', '白羊座', '金牛座', '双子座', '巨蟹座', '狮子座', '处女座', '天秤座', '天蝎座', '射手座', '摩羯座']
    const bloodTypes = ['', 'A型', 'B型', 'AB型', 'O型']
    const zodiacInfo = [
      info.shengXiao && shengXiaos[info.shengXiao],
      info.constellation && constellations[info.constellation],
      info.kBloodType && bloodTypes[info.kBloodType]
    ].filter(Boolean)
    if (zodiacInfo.length) result += `${zodiacInfo.join(' | ')}\n`
    const contactInfo = [info.phoneNum, info.eMail].filter(x => x && x !== '-')
    if (contactInfo.length) result += `${contactInfo.join(' | ')}\n`
    let locationLine = [info.country, info.province, info.city].filter(Boolean).join(' ')
    if (info.homeTown && info.homeTown !== '0-0-0') {
      const [province, city] = info.homeTown.split('-').map(Number)
      if (province > 0 || city > 0) locationLine += (locationLine ? ' | ' : '') + `家乡: ${province}-${city}`
    }
    if (locationLine) result += `${locationLine}\n`
    const educationInfo = [info.college, info.pos].filter(Boolean)
    if (educationInfo.length) result += `${educationInfo.join(' | ')}\n`
    result += '\n账号信息: \n'
    const statusMap = { 10: '离线', 20: '在线', 30: '离开', 40: '忙碌', 50: '请勿打扰', 60: '隐身' }
    const termTypes = ['', '电脑', '手机', '网页', '平板']
    const netTypes = ['', 'WiFi', '移动网络', '有线网络']
    const eNetworkTypes = { 1: '2G网络', 2: '3G网络', 3: '4G网络', 4: '5G网络', 5: 'WiFi' }
    const accountInfo = [
      info.is_vip || info.vip_level ? (info.is_years_vip ? `年VIP${info.vip_level || ''}` : `VIP${info.vip_level || ''}`) : '',
      info.qqLevel ? `Lv:${info.qqLevel}` : '',
      info.status !== undefined && statusMap[info.status] ? statusMap[info.status] : '',
      info.batteryStatus >= 0 && info.batteryStatus <= 100 ? `电量${info.batteryStatus}%` : '',
      info.termType && termTypes[info.termType] ? (info.termDesc ? `${termTypes[info.termType]}(${info.termDesc})` : termTypes[info.termType]) : '',
      [info.netType && netTypes[info.netType], info.eNetworkType && eNetworkTypes[info.eNetworkType]].filter(Boolean).join('-')
    ].filter(Boolean)
    if (accountInfo.length) result += `${accountInfo.join(' | ')}\n`
    if (info.regTime || info.reg_time) {
      const regDate = new Date((info.regTime || info.reg_time) * 1000)
      result += `注册于: ${regDate.toLocaleDateString()}${info.login_days ? ` (登录${info.login_days}天)` : ''}\n`
    }
    return result
  }

  /**
   * 格式化好友信息
   * @param friend 好友信息对象
   * @returns 格式化字符串
   */
  static formatFriendInfo(friend: any): string {
    let result = `${friend.nickname}(${friend.user_id})${friend.level ? ` | LV:${friend.level}` : ''}\n`
    const personalInfo = [friend.remark, friend.sex && friend.sex !== 'unknown' ? (Onebot.sexMap[friend.sex] || friend.sex) : '', friend.age > 0 ? `${friend.age}岁` : ''].filter(Boolean)
    if (friend.birthday_year || friend.birthday_month || friend.birthday_day) {
      personalInfo.push(`${friend.birthday_year || '?'}-${friend.birthday_month || '?'}-${friend.birthday_day || '?'}`)
    }
    if (personalInfo.length) result += `- ${personalInfo.join(' | ')}\n`
    const contactInfo = [friend.phone_num, friend.email].filter(x => x && x.trim() && x !== '-')
    if (contactInfo.length) result += `- ${contactInfo.join(' | ')}\n`
    return result
  }

  /**
   * 格式化群信息
   * @param info 群信息对象
   * @returns 格式化字符串
   */
  static formatGroupInfo(info: any): string {
    return `${info.group_name}(${info.group_id}) [${info.member_count}/${info.max_member_count}]${info.group_remark?.trim() ? `\n备注: ${info.group_remark}` : ''}`
  }

  /**
   * 格式化群成员信息
   * @param member 群成员信息对象
   * @returns 格式化字符串
   */
  static formatGroupMemberInfo(member: any): string {
    const roleMap = { owner: '群主', admin: '管理员', member: '成员' }
    let result = `成员 ${member.card?.trim() ? `[${member.card}]` : ''}${member.nickname}(${member.user_id}) 信息:\n`
    const identityInfo = [
      member.level && member.level !== '0' ? `LV${member.level}` : '',
      member.title?.trim() || '',
      member.card?.trim() || '',
      member.role !== 'member' ? (roleMap[member.role] || member.role) : '',
      member.is_robot ? 'Bot' : ''
    ].filter(Boolean)
    if (identityInfo.length) result += `- ${identityInfo.join(' | ')}\n`
    const personalInfo = [
      member.qq_level > 0 ? `LV${member.qq_level}` : '',
      member.sex && member.sex !== 'unknown' ? (Onebot.sexMap[member.sex] || member.sex) : '',
      member.age > 0 ? `${member.age}岁` : '',
      member.area?.trim() || ''
    ].filter(Boolean)
    if (personalInfo.length) result += `- ${personalInfo.join(' | ')}\n`
    if (member.shut_up_timestamp > Math.floor(Date.now() / 1000)) {
      const shutUpEnd = new Date(member.shut_up_timestamp * 1000)
      result += `- 禁言至: ${shutUpEnd.toLocaleDateString()} ${shutUpEnd.toLocaleTimeString()}\n`
    }
    if (member.join_time) result += `- 入群时间: ${new Date(member.join_time * 1000).toLocaleString()}\n`
    if (member.last_sent_time) result += `- 最后发言: ${new Date(member.last_sent_time * 1000).toLocaleString()}`
    return result
  }

  /**
   * 提取语音文件名
   * @param content 消息内容
   * @returns 文件名或null
   */
  static extractAudioFile(content: string): string {
    if (!content) return null
    return /<audio.*?file="(.*?)".*?\/>/i.exec(content)?.[1]
      || /\[CQ:record,file=(.*?)(?:,|])/i.exec(content)?.[1]
      || /"file"\s*:\s*"([^"]+)"/i.exec(content)?.[1]
      || null
  }

  /**
   * 提取文件ID
   * @param content 消息内容
   * @returns 文件ID或null
   */
  static extractFileId(content: string): string {
    if (!content) return null
    return /<file.*?id="(.*?)".*?\/>/i.exec(content)?.[1]
      || /\[CQ:file,file=(?:.*?),id=(.*?)(?:,|])/i.exec(content)?.[1]
      || /"file_id"\s*:\s*"([^"]+)"/i.exec(content)?.[1]
      || null
  }

  /**
   * 提取图片文件名
   * @param content 消息内容
   * @returns 文件名或null
   */
  static extractImageFile(content: string): string {
    if (!content) return null
    return /<image.*?file="([^"]+)".*?\/>/i.exec(content)?.[1]
      || /<img.*?file="([^"]+)".*?\/>/i.exec(content)?.[1]
      || /\[CQ:image,(?:.*?,)?file=([^,\]]+)(?:,|])/i.exec(content)?.[1]
      || /"file"(?:\s*):(?:\s*)"([^"]+)"/i.exec(content)?.[1]
      || /https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|gif|bmp|webp)/i.exec(content)?.[0]
      || null
  }

  /**
   * 注册onebot相关命令
   * @param qgroup qgroup命令对象
   */
  registerCommands(qgroup) {
    qgroup.subcommand('.restart', '重启 OneBot', { authority: 5 })
      .usage('重启 OneBot 实现和 API 服务')
      .action(async ({ session }) => {
        try {
          await session.onebot.setRestart(2000)
          return '正在重启 OneBot，请稍候...'
        } catch (e) { return utils.handleError(session, e) }
      })
    qgroup.subcommand('.clean', '清理缓存', { authority: 4 })
      .usage('清理积攒的缓存文件')
      .action(async ({ session }) => {
        try {
          await session.onebot.cleanCache()
          return '清理缓存成功'
        } catch (e) { return utils.handleError(session, e) }
      })

    const get = qgroup.subcommand('get', '获取消息内容及状态')
      .usage('获取指定ID消息的完整内容')
      .option('id', '-i <id:string> 消息ID')
      .action(async ({ session, options }) => {
        let messageId = options.id || session.quote?.id || session.messageId
        try {
          const msg = await session.onebot.getMsg(messageId)
          return JSON.stringify(msg, null, 2)
        } catch (e) { return utils.handleError(session, e) }
      })
    get.subcommand('.forward', '获取合并转发内容')
      .usage('获取指定合并转发ID消息的完整内容')
      .option('id', '-i <id:string> 合并转发ID')
      .action(async ({ session, options }) => {
        let messageId = options.id || session.quote?.id || session.messageId
        try {
          const msg = await session.onebot.getForwardMsg(messageId)
          return JSON.stringify(msg, null, 2)
        } catch (e) { return utils.handleError(session, e) }
      })
    get.subcommand('.record', '获取语音文件', { authority: 2 })
      .usage('获取指定语音文件并转换格式')
      .option('file', '-f <file:string> 文件名', { type: 'string' })
      .option('format', '-t <format:string> 转换格式 (mp3/amr/wma/m4a/spx/ogg/wav/flac)', { fallback: 'mp3' })
      .action(async ({ session, options }) => {
        let fileName = options.file || (session.quote && Onebot.extractAudioFile(session.quote.content))
        if (!fileName) return utils.handleError(session, new Error('未发现语音文件'))
        try {
          const result = await session.onebot.getRecord(fileName, options.format as 'mp3' | 'amr' | 'wma' | 'm4a' | 'spx' | 'ogg' | 'wav' | 'flac')
          return `语音文件路径: ${result.file}`
        } catch (e) { return utils.handleError(session, e) }
      })
    get.subcommand('.image', '获取图片文件', { authority: 2 })
      .usage('获取指定图片文件的本地路径')
      .option('file', '-f <file:string> 文件名', { type: 'string' })
      .action(async ({ session, options }) => {
        let fileName = options.file || (session.quote && Onebot.extractImageFile(session.quote.content))
        if (!fileName) return utils.handleError(session, new Error('未发现图片文件'))
        try {
          const result = await session.onebot.getImage(fileName)
          return `图片文件路径: ${result.file}`
        } catch (e) { return utils.handleError(session, e) }
      })
    get.subcommand('.file', '获取文件信息', { authority: 2 })
      .usage('获取指定文件ID对应的文件信息')
      .option('id', '-i <id:string> 文件ID')
      .action(async ({ session, options }) => {
        let fileId = options.id || (session.quote && Onebot.extractFileId(session.quote.content))
        if (!fileId) return utils.handleError(session, new Error('未发现文件'))
        try {
          const fileInfo: any = await session.onebot._request('get_file', { file_id: fileId })
          let result = '文件信息:\n'
          if (fileInfo.file_name) result += `文件名: ${fileInfo.file_name}\n`
          if (fileInfo.file_size) result += `文件大小: ${fileInfo.file_size}\n`
          if (fileInfo.file) result += `文件路径: ${fileInfo.file}\n`
          if (fileInfo.url) result += `文件链接: ${fileInfo.url}\n`
          if (fileInfo.base64) result += `文件Base64长度: ${fileInfo.base64.length}字符\n`
          return result
        } catch (e) { return utils.handleError(session, e) }
      })
    get.subcommand('.stat', '获取运行状态')
      .usage('获取运行状态信息')
      .action(async ({ session }) => {
        try {
          const status = await session.onebot.getStatus()
          let result = `运行状态: ${status.online ? '在线' : '离线'} | ${status.good ? '正常' : '异常'}\n`
          Object.entries(status).forEach(([k, v]) => {
            if (k !== 'online' && k !== 'good') result += `${k}: ${JSON.stringify(v)}\n`
          })
          return result
        } catch (e) { return utils.handleError(session, e) }
      })
    get.subcommand('.ver', '获取版本信息')
      .usage('获取版本信息')
      .action(async ({ session }) => {
        try {
          const version = await session.onebot.getVersionInfo()
          let result = `应用标识: ${version.app_name}\n应用版本: ${version.app_version}\n协议版本: ${version.protocol_version}\n`
          Object.entries(version).forEach(([k, v]) => {
            if (!['app_name', 'app_version', 'protocol_version'].includes(k)) result += `${k}: ${JSON.stringify(v)}\n`
          })
          return result
        } catch (e) { return utils.handleError(session, e) }
      })
    get.subcommand('.csrf [domain:string]', '获取相关接口凭证', { authority: 4 })
      .usage('获取指定域名的Cookies和CSRF Token')
      .action(async ({ session }, domain) => {
        try {
          const credentials = await session.onebot.getCredentials(domain || '')
          return `接口凭证信息:\nCSRF Token: ${credentials.csrf_token}\nCookies: ${credentials.cookies}`
        } catch (e) { return utils.handleError(session, e) }
      })

    const info = qgroup.subcommand('info', '查询账号信息', { authority: 5 })
      .usage('查询当前账号的基本信息')
      .option('no-cache', '-n 不使用缓存', { fallback: false })
      .action(async ({ session, options }) => {
        try {
          const loginInfo = await session.onebot.getLoginInfo()
          try {
            const detailInfo = await session.onebot.getStrangerInfo(loginInfo.user_id, options['no-cache'])
            return Onebot.formatUserInfo(detailInfo)
          } catch { return `账号信息:\n${loginInfo.nickname}(${loginInfo.user_id})` }
        } catch (e) { return utils.handleError(session, e) }
      })
    info.subcommand('.user <user_id:string>', '查询其它账号信息')
      .usage('查询指定账号的基本信息')
      .option('no-cache', '-n 不使用缓存', { fallback: false })
      .action(async ({ session, options }, user_id) => {
        const parsedId = utils.parseTarget(user_id)
        if (!parsedId) return utils.handleError(session, new Error('请提供QQ号'))
        try {
          const botInfo = await session.onebot.getLoginInfo()
          if (parsedId === botInfo.user_id.toString()) return utils.handleError(session, new Error('不允许查询自身信息'))
          const info = await session.onebot.getStrangerInfo(+parsedId, options['no-cache'])
          return Onebot.formatUserInfo(info)
        } catch (e) { return utils.handleError(session, e) }
      })
    info.subcommand('.myfriend [page:string]', '获取本账号好友列表', { authority: 4 })
      .usage('获取本账号的完整好友列表及备注')
      .action(async ({ session }, page) => {
        try {
          const friends = await session.onebot.getFriendList()
          let result = `好友数量: ${friends.length}`
          const pagination = this.handlePagination(session, friends, page)
          if (!pagination) return
          result += pagination.pageInfo
          pagination.displayData.forEach(friend => result += Onebot.formatFriendInfo(friend))
          return result
        } catch (e) { return utils.handleError(session, e) }
      })
    info.subcommand('.mygroup [page:string]', '获取本账号群组列表', { authority: 4 })
      .usage('获取本账号加入的群组列表')
      .action(async ({ session }, page) => {
        try {
          const groups = await session.onebot.getGroupList()
          let result = `群数量: ${groups.length}`
          const pagination = this.handlePagination(session, groups, page)
          if (!pagination) return
          result += pagination.pageInfo
          pagination.displayData.forEach(group => result += Onebot.formatGroupInfo(group) + '\n')
          return result
        } catch (e) { return utils.handleError(session, e) }
      })
    info.subcommand('.group [group_id:number]', '查询群信息')
      .usage('查询指定群的基本信息')
      .option('no-cache', '-n 不使用缓存', { fallback: false })
      .action(async ({ session, options }, group_id) => {
        group_id = group_id || +session.guildId
        if (!group_id) return utils.handleError(session, new Error('请提供群号'))
        try {
          const info = await session.onebot.getGroupInfo(group_id, options['no-cache'])
          return Onebot.formatGroupInfo(info)
        } catch (e) { return utils.handleError(session, e) }
      })
    info.subcommand('.groupuser <user_id:string> [group_id:number]', '查询群成员信息')
      .usage('查询群内指定成员的基本信息')
      .option('no-cache', '-n 不使用缓存', { fallback: false })
      .action(async ({ session, options }, user_id, group_id) => {
        const parsedId = utils.parseTarget(user_id)
        if (!parsedId) return utils.handleError(session, new Error('请提供QQ号'))
        group_id = group_id || +session.guildId
        if (!group_id) return utils.handleError(session, new Error('请提供群号'))
        try {
          const info = await session.onebot.getGroupMemberInfo(group_id, +parsedId, options['no-cache'])
          return Onebot.formatGroupMemberInfo(info)
        } catch (e) { return utils.handleError(session, e) }
      })
    info.subcommand('.memberlist [group_id:number] [page:string]', '获取群成员列表')
      .usage('获取指定群的成员列表')
      .action(async ({ session }, group_id, page) => {
        group_id = group_id || +session.guildId
        if (!group_id) return utils.handleError(session, new Error('请提供群号'))
        try {
          const members = await session.onebot.getGroupMemberList(group_id)
          let result = `群 ${group_id} 成员列表`
          members.sort((a, b) => ({ owner: 0, admin: 1, member: 2 }[a.role] - { owner: 0, admin: 1, member: 2 }[b.role]))
          const pagination = this.handlePagination(session, members, page, 5)
          if (!pagination) return
          result += pagination.pageInfo
          pagination.displayData.forEach(member => result += Onebot.formatGroupMemberInfo(member) + '\n')
          return result
        } catch (e) { return utils.handleError(session, e) }
      })
    info.subcommand('.grouphonor [group_id:number]', '查询群荣誉信息')
      .usage('可用参数:\n- talkative: 历史龙王\n- performer: 群聊之火\n- legend: 群聊炽焰\n- strong_newbie: 冒尖小春笋\n- emotion: 快乐之源')
      .option('type', '-t <type> 荣誉类型', { fallback: 'all' })
      .action(async ({ session, options }, group_id) => {
        group_id = group_id || +session.guildId
        if (!group_id) return utils.handleError(session, new Error('请提供群号'))
        try {
          const honorInfo = await session.onebot.getGroupHonorInfo(group_id, options.type)
          let result = `群 ${group_id} 荣誉信息:\n`
          const honorTypeNames = {
            talkative: '历史龙王', performer: '群聊之火', legend: '群聊炽焰', strong_newbie: '冒尖小春笋', emotion: '快乐之源'
          }
          if (honorInfo.current_talkative) result += `- 龙王: ${honorInfo.current_talkative.nickname}(${honorInfo.current_talkative.user_id})\n`
          for (const type of Object.keys(honorTypeNames)) {
            const list = honorInfo[`${type}_list`]
            if (list?.length) {
              result += `${honorTypeNames[type]} (${list.length}名):\n`
              list.slice(0, 5).forEach(item => result += `- ${item.nickname}(${item.user_id}) | ${item.description}\n`)
            }
          }
          return result
        } catch (e) { return utils.handleError(session, e) }
      })
  }
}