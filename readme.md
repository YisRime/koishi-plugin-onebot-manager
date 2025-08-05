# koishi-plugin-onebot-manager

[![npm](https://img.shields.io/npm/v/koishi-plugin-onebot-manager?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-onebot-manager)

适用于 Onebot 的 QQ 群管，可自动处理好友申请、群邀请和入群请求，提供群组管理功能

## 功能特性

- **请求处理**：自动处理好友申请、群邀请和入群请求
- **通知功能**：将请求消息转发至指定群或私聊，并可通过回复进行处理
- **智能筛选**：根据账号注册时间、QQ等级、会员等级等条件自动决定是否通过请求
- **群管理**：设置群专属头衔、管理精华消息、设置群名片、禁言管理等实用功能

### OneBot管理工具

- 提供丰富的信息查询功能，包括消息、图片、语音、合并转发等内容
- 支持查询账号信息、群组信息、成员信息等
- 提供OneBot实现重启、缓存清理等管理功能
- 支持获取运行状态和版本信息

## 配置说明

```yaml
enable: true       # 是否启用插件，默认为 true
enableNotify: false    # 是否启用通知功能
notifyTarget: ''     # 通知目标，格式为 "guild:群号" 或 "private:QQ号"

# 请求处理方式
friendRequest: 'reject'  # 好友请求处理：accept(同意)、reject(拒绝)、manual(手动)、auto(智能)
memberRequest: 'reject'  # 加群请求处理：accept(同意)、reject(拒绝)、manual(手动)、auto(智能)
guildRequest: 'reject'  # 入群邀请处理：accept(同意)、reject(拒绝)、manual(手动)、auto(智能)

# 人工审核模式下的超时设置
manualTimeout: 720    # 手动审核超时时间(分钟)，0表示永不超时
manualTimeoutAction: 'reject' # 超时后的行为：accept(同意) 或 reject(拒绝)

# 当好友请求为 auto 时的筛选条件
FriendRegTime: -1     # 最短注册年份（-1表示不启用此条件）
FriendLevel: -1      # 最低QQ等级（-1表示不启用此条件）
FriendVipLevel: -1    # 最低会员等级（-1表示不启用此条件）

# 当加群请求为 auto 时的筛选条件
MemberRegTime: -1     # 最短注册年份（-1表示不启用此条件）
MemberLevel: -1      # 最低QQ等级（-1表示不启用此条件）
MemberVipLevel: -1    # 最低会员等级（-1表示不启用此条件）

# 当入群邀请为 auto 时的筛选条件
GuildAllowUsers: []    # 邀请ID白名单
GuildMinMemberCount: -1  # 最低群成员数量（-1表示不启用此条件）
GuildMaxCapacity: -1   # 最低群容量要求（-1表示不启用此条件）
```

## 群管理命令

| 命令 | 描述 | 示例 |
|------|------|------|
| `qgroup tag [头衔] [目标]` | 设置群专属头衔 | `qgroup tag 管理员` 设置自己头衔 `qgroup tag 群主 @用户` 设置他人头衔 `qgroup tag` 清除自己头衔 |
| `qgroup membercard [名片] [目标]` | 设置群名片 | `qgroup membercard 新名片` 设置自己名片 `qgroup membercard 新名片 @用户` 设置他人名片 |
| `qgroup groupname <群名>` | 设置群名称 | `qgroup groupname 新群名` |
| `qgroup essence [消息ID]` | 设置精华消息 | `qgroup essence` 将引用的消息设为精华 `qgroup essence 123456` 将指定消息设为精华 |
| `qgroup essence.del [消息ID]` | 移除精华消息 | `qgroup essence.del` 移除引用的精华消息 |
| `qgroup admin <目标>` | 设置群管理 | `qgroup admin @用户` 设置用户为管理员 |
| `qgroup admin.del <目标>` | 取消群管理 | `qgroup admin.del @用户` 取消用户的管理员 |
| `qgroup mute <目标> [时长]` | 禁言群成员 | `qgroup mute @用户 60` 禁言用户60秒 `qgroup mute @用户 -c` 取消禁言 |
| `qgroup mute.all [开关]` | 全体禁言 | `qgroup mute.all` 开启全体禁言 `qgroup mute.all false` 关闭全体禁言 |
| `qgroup kick <目标>` | 踢出群成员 | `qgroup kick @用户` 踢出用户 `qgroup kick @用户 -r` 踢出并拒绝再次加群 |
| `qgroup revoke` | 撤回消息 | `qgroup revoke` 撤回引用的消息 |

### 自动处理规则说明

- **好友请求**：当设置为 `auto` 时，插件会检查申请人的注册时间、QQ等级和会员等级，如果满足设置的条件则通过，否则拒绝
- **加群请求**：当设置为 `auto` 时，插件会检查申请人的注册时间、QQ等级和会员等级，如果满足设置的条件则通过，否则拒绝
- **入群邀请**：当设置为 `auto` 时，插件会检查邀请人是否在白名单中、群成员数量和群容量是否满足条件，满足则通过，否则拒绝

### 通知功能

当 `enableNotify` 设置为 `true` 时，插件会将请求消息转发到 `notifyTarget` 指定的目标。

- 通知目标格式：`guild:群号` 或 `private:QQ号`
- 请求通知将显示请求编号，例如 `#1`
- 处理请求回复格式：`y1` 同意请求 #1，`n1 理由` 拒绝请求 #1
- 添加好友请求回复格式：`y1 备注` 添加好友并设置备注
- 超时处理：如果设置了 `manualTimeout`，超时未处理的请求将按 `manualTimeoutAction` 自动处理

## 注意事项

- 插件需要 Onebot 适配器支持
- 命令前缀均为 `qgroup`，可根据实际配置调整
- 群管理功能需要机器人具有相应的权限，如设置头衔需要群主权限
- 群管理命令支持 `-g` 参数指定群号，如 `qgroup tag 头衔 -g 123456`
- 自动处理功能需要正确配置并启用对应条件
- 对于 `auto` 模式，如果未设置条件（保持 -1），将默认拒绝请求
