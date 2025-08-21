# koishi-plugin-onebot-manager

[![npm](https://img.shields.io/npm/v/koishi-plugin-onebot-manager?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-onebot-manager)

适用于 Onebot 的 QQ 群管，可自动处理好友申请、群邀请和入群请求，并提供一系列群组管理命令。

## 功能特性

- **请求处理**：自动或手动处理好友申请、群邀请和入群请求。
- **智能筛选**：可根据账号注册时间、QQ等级、会员等级、邀请人白名单、群成员数及容量等条件自动审核请求。
- **事件监听**：可自定义成员入群和离群的欢迎/提示消息。
- **通知功能**：可将请求转发至指定管理员，并通过回复指令快速处理；当机器人被踢出群聊时，可向管理员发送通知。
- **群组管理**：提供设置群头衔、群名片、精华消息、禁言、踢人等多种实用管理命令。

## 配置说明

```yaml
# 基础配置
enable: true          # 是否启用插件，默认为 true

# 事件监听
enableJoin: false     # 是否开启入群监听
joinMessage: '欢迎 {userName} 加入本群！' # 自定义入群欢迎语 (占位符: {userName}, {userId}, {guildName}, {guildId})
enableLeave: false    # 是否开启群成员退群监听
leaveMessage: '{userName} 已离开本群'    # 自定义退群提示 (占位符: {userName}, {userId}, {guildName}, {guildId})
enableKick: true      # 是否开启机器人被踢/主动退群监听，开启后会向通知目标发送提醒

# 通知功能
enableNotify: false    # 是否启用请求通知功能
notifyTarget: ''     # 通知目标，格式为 "guild:群号" 或 "private:QQ号"

# 请求处理方式
friendRequest: 'reject'  # 好友请求处理：accept(同意)、reject(拒绝)、manual(手动)、auto(智能)
memberRequest: 'reject'  # 加群请求处理：accept(同意)、reject(拒绝)、manual(手动)、auto(智能)
guildRequest: 'reject'   # 入群邀请处理：accept(同意)、reject(拒绝)、manual(手动)、auto(智能)

# 人工审核模式下的超时设置
manualTimeout: 720    # 手动审核超时时间(分钟)，0表示永不超时
manualTimeoutAction: 'reject' # 超时后的行为：accept(同意) 或 reject(拒绝)

# 当好友请求为 auto 时的筛选条件
FriendRegTime: -1     # 最短注册年份（-1表示不启用此条件）
FriendLevel: -1       # 最低QQ等级（-1表示不启用此条件）
FriendVipLevel: -1    # 最低会员等级（-1表示不启用此条件）

# 当加群请求为 auto 时的筛选条件
MemberRegTime: -1      # 最短注册年份（-1表示不启用此条件）
MemberLevel: -1        # 最低QQ等级（-1表示不启用此条件）
MemberVipLevel: -1     # 最低会员等级（-1表示不启用此条件）
MemberRequestAutoRules: [] # 关键词自动通过规则 (示例: [{ groupId: '123456', keyword: '暗号' }])

# 当入群邀请为 auto 时的筛选条件
GuildAllowUsers: []      # 邀请人ID白名单
GuildMinMemberCount: -1  # 最低群成员数量（-1表示不启用此条件）
GuildMaxCapacity: -1     # 最低群容量要求（-1表示不启用此条件）
```

## 群管理命令

| 命令                             | 描述                                       | 示例                                                              |
| -------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| `qgroup tag [头衔] [目标]`       | 设置群专属头衔                             | `qgroup tag 管理员` 设置自己头衔`qgroup tag 群主 @用户` 设置他人头衔`qgroup tag` 清除自己头衔 |
| `qgroup membercard [名片] [目标]` | 设置群名片                                 | `qgroup membercard 新名片` 设置自己名片`qgroup membercard 新名片 @用户` 设置他人名片 |
| `qgroup groupname <群名>`        | 设置群名称                                 | `qgroup groupname 新群名`                                           |
| `qgroup essence [消息ID]`        | 设置精华消息                               | `qgroup essence` 将引用的消息设为精华`qgroup essence 123456` 将指定消息设为精华 |
| `qgroup essence.del [消息ID]`    | 移除精华消息                               | `qgroup essence.del` 移除引用的精华消息                             |
| `qgroup admin <目标>`            | 设置群管理                                 | `qgroup admin @用户` 设置用户为管理员                             |
| `qgroup admin.del <目标>`        | 取消群管理                                 | `qgroup admin.del @用户` 取消用户的管理员                         |
| `qgroup mute <目标> [时长]`      | 禁言群成员 (默认30分钟)                    | `qgroup mute @用户 60` 禁言用户60秒`qgroup mute @用户 -c` 取消禁言 |
| `qgroup mute.all [开关]`         | 全体禁言                                   | `qgroup mute.all` 开启全体禁言`qgroup mute.all false` 关闭全体禁言 |
| `qgroup kick <目标>`             | 踢出群成员                                 | `qgroup kick @用户` 踢出用户`qgroup kick @用户 -r` 踢出并拒绝再次加群 |
| `qgroup revoke`                  | 撤回消息 (仅限撤回自己发送的消息)          | (需回复一条消息) `qgroup revoke` 撤回引用的消息                   |

### 自动处理规则说明

- **好友请求**：当设置为 `auto` 时，插件会检查申请人的注册时间、QQ等级和会员等级，如果满足所有已设置的条件则通过，否则拒绝。
- **加群请求**：当设置为 `auto` 时，优先匹配关键词规则。若未匹配，则检查申请人的注册时间、QQ等级和会员等级，如果满足所有已设置的条件则通过，否则拒绝。
- **入群邀请**：当设置为 `auto` 时，插件会检查邀请人是否在白名单中、或群成员数量和群容量是否满足条件，满足任一条件则通过，否则拒绝。

### 通知与人工审核

当 `enableNotify` 设置为 `true` 时，插件会将需要 `manual`（人工）或 `auto`（自动）处理的请求转发到 `notifyTarget` 指定的目标。

- **通知目标格式**：`guild:群号` 或 `private:QQ号`。
- **处理请求**：通知消息会包含请求编号（如 `#1`）。管理员可通过回复以下格式的指令来处理：
  - 同意：`y1` 或 `通过1`
  - 拒绝：`n1 理由` 或 `拒绝1 理由`
  - 同意好友请求并添加备注：`y1 备注`
- **超时处理**：如果设置了 `manualTimeout`，在规定时间内未被处理的请求，将按照 `manualTimeoutAction` 的设置被自动处理。

## 注意事项

- 本插件依赖 OneBot v11 适配器，请确保已正确安装和配置。
- 所有命令前缀均为 `qgroup`，可在 Koishi 配置文件中调整。
- 使用群管理命令需要机器人拥有相应的群权限（管理员或群主）。
- 大部分群管理命令支持 `-g <群号>` 或 `--group <群号>` 参数，用于在其他聊天环境中管理指定群组。
- 对于 `auto` 模式，如果未设置任何筛选条件（例如全部保持-1），请求将默认被拒绝。
