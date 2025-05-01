# koishi-plugin-onebot-manager

[![npm](https://img.shields.io/npm/v/koishi-plugin-onebot-manager?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-onebot-manager)

适用于 Onebot 的 QQ 群管系统，提供自动处理请求和群组管理功能

## 功能特性

- **请求处理**：自动处理好友申请、群邀请和入群请求
- **通知功能**：将请求消息转发至指定群或私聊，并可通过回复进行处理
- **智能筛选**：根据账号注册时间、QQ等级、会员等级等条件自动决定是否通过请求
- **群管理**：设置群专属头衔、管理精华消息等实用功能

### OneBot管理工具

- 提供丰富的信息查询功能，包括消息、图片、语音、合并转发等内容
- 支持查询账号信息、群组信息、成员信息等
- 提供OneBot实现重启、缓存清理等管理功能
- 支持获取运行状态和版本信息

## 配置说明

```yaml
enable: true              # 是否启用插件，默认为 true
enableNotify: false       # 是否启用通知功能
notifyTarget: ''          # 通知目标，格式为 "group:群号" 或 "private:QQ号"

# 请求处理方式
friendRequest: 'reject'   # 好友请求处理：accept(同意)、reject(拒绝)、manual(手动)、auto(智能)
memberRequest: 'reject'   # 加群请求处理：accept(同意)、reject(拒绝)、manual(手动)、auto(智能)
guildRequest: 'reject'    # 入群邀请处理：accept(同意)、reject(拒绝)、manual(手动)、auto(智能)

# 当好友请求为 auto 时的筛选条件
FriendRegTime: -1         # 最短注册年份（-1表示不启用此条件）
FriendLevel: -1           # 最低QQ等级（-1表示不启用此条件）
FriendVipLevel: -1        # 最低会员等级（-1表示不启用此条件）

# 当加群请求为 auto 时的筛选条件
MemberRegTime: -1         # 最短注册年份（-1表示不启用此条件）
MemberLevel: -1           # 最低QQ等级（-1表示不启用此条件）
MemberVipLevel: -1        # 最低会员等级（-1表示不启用此条件）

# 当入群邀请为 auto 时的筛选条件
GuildAllowUsers: []       # 邀请ID白名单
GuildMinMemberCount: -1   # 最低群成员数量（-1表示不启用此条件）
GuildMaxCapacity: -1      # 最低群容量要求（-1表示不启用此条件）
```

## OneBot命令

| 命令 | 说明 | 示例 |
|-----|------|------|
| `onebot.restart` | 重启 OneBot | `onebot.restart` |
| `onebot.clean` | 清理缓存 | `onebot.clean` |
| `get` | 获取消息内容及状态 | `get -i 1234567890` |
| `get.forward` | 获取合并转发内容 | `get.forward -i 1234567890` |
| `get.record` | 获取语音文件 | `get.record -f 1234.silk -t mp3` |
| `get.image` | 获取图片文件 | `get.image -f abc.image` |
| `get.stat` | 获取运行状态 | `get.stat` |
| `get.ver` | 获取版本信息 | `get.ver` |
| `get.csrf` | 获取相关接口凭证 | `get.csrf qun.qq.com` |
| `info` | 查询账号信息 | `info` |
| `info.user` | 查询其它账号信息 | `info.user 123456 -n` |
| `info.friend` | 获取本账号好友列表 | `info.friend` |
| `info.group` | 获取本账号群组列表 | `info.group` |
| `group` | 查询群信息 | `group 123456 -n` |
| `group.user` | 查询群成员信息 | `group.user 123456 654321 -n` |
| `group.list` | 获取群成员列表 | `group.list 123456` |
| `group.honor` | 查询群荣誉信息 | `group.honor 123456 -t talkative` |

### 自动处理规则说明

- **好友请求**：当设置为 `auto` 时，插件会检查申请人的注册时间、QQ等级和会员等级，如果满足设置的条件则通过，否则拒绝
- **加群请求**：当设置为 `auto` 时，插件会检查申请人的注册时间、QQ等级和会员等级，如果满足设置的条件则通过，否则拒绝
- **入群邀请**：当设置为 `auto` 时，插件会检查邀请人是否在白名单中、群成员数量和群容量是否满足条件，满足则通过，否则拒绝

### 通知功能

当 `enableNotify` 设置为 `true` 时，插件会将请求消息转发到 `notifyTarget` 指定的目标。

- 通知目标格式：`group:群号` 或 `private:QQ号`
- 私聊通知模式下，可通过回复 `y` 或 `n` 来处理请求
- 添加好友请求回复格式：`y [备注]` 或 `n [理由]`
- 群请求回复格式：`y` 同意，`n [拒绝理由]` 拒绝

## 命令说明

| 命令 | 描述 | 示例 |
|------|------|------|
| `tag [头衔] [目标]` | 设置群专属头衔 | `tag 管理员` 设置自己头衔 `tag 群主 @用户` 设置他人头衔 `tag` 清除自己头衔 |
| `essence [消息ID]` | 设置精华消息 | `essence` 将引用的消息设为精华 `essence 123456` 将指定消息设为精华 |
| `essence.del [消息ID]` | 移除精华消息 | `essence.del` 移除引用的精华消息 `essence.del 123456` 移除指定精华消息 |

## 注意事项

- 插件需要 Onebot 适配器支持
- 设置头衔功能需要机器人具有群管理员或群主权限
- 设置精华消息功能需要机器人具有群管理员或群主权限
- 通知功能需要正确配置通知目标才能生效
- 自动处理功能需要正确配置并启用对应条件
