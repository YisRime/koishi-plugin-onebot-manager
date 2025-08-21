# koishi-plugin-onebot-manager

[![npm](https://img.shields.io/npm/v/koishi-plugin-onebot-manager?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-onebot-manager)

适用于 Onebot 的 QQ 群管，可自动处理好友申请、群邀请和入群请求，并提供一系列群组管理命令。

## 功能特性

- **统一请求处理**：自动处理所有好友、加群及邀请请求。不满足自动通过条件的请求将自动转为人工审核。
- **智能筛选**：可根据QQ等级、关键词、邀请人白名单、群成员数及容量等条件自动审核请求。
- **事件监听**：可自定义成员入群和离群的欢迎/提示消息。
- **强制通知**：待审核请求强制转发至指定管理员，并通过回复指令快速处理；当机器人被踢出群聊时，也可发送通知。
- **群组管理**：提供设置群头衔、群名片、精华消息、禁言、踢人等多种实用管理命令。

## 配置说明

```yaml
# 基础配置
enable: true          # 是否启用插件的请求处理功能
enableJoin: false     # 是否开启入群监听
joinMessage: '欢迎 {userName} 加入本群！' # 自定义入群欢迎语 (占位符: {userName}, {userId}, {guildName}, {guildId})
enableLeave: false    # 是否开启群成员退群监听
leaveMessage: '{userName} 已离开本群'    # 自定义退群提示 (占位符: {userName}, {userId}, {guildName}, {guildId})
enableKick: true      # 是否开启机器人被踢/主动退群监听，开启后会向通知目标发送提醒

# 请求处理与审核配置
notifyTarget: ''      # [必填] 审核通知目标，格式为 "guild:群号" 或 "private:QQ号"
manualTimeout: 720    # 人工审核超时时间(分钟)，0 为永不超时
manualTimeoutAction: 'reject' # 超时后的行为：accept(同意) 或 reject(拒绝)

# --- 自动审核条件 ---

# 【好友请求】
FriendRequestAutoKeyword: '' # 关键词（满足则直接通过，留空表示不启用此条件）
FriendLevel: -1              # 最低QQ等级（-1表示不启用此条件）

# 【加群请求】
MemberLevel: -1              # 最低QQ等级（-1表示不启用此条件）
MemberRequestAutoRules: []   # 关键词自动通过规则 (示例: [{ guildId: '123456', keyword: '暗号' }])

# 【入群邀请】
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

### 请求处理流程说明

当 `enable` 设置为 `true` 时，插件将处理所有接收到的好友、加群和邀请请求：

1. **检查自动通过条件**：插件首先检查请求是否满足您在 “自动审核条件” 中设定的相应规则。
2. **自动通过**：如果满足条件，请求将被自动同意。
3. **转为人工审核**：如果不满足条件，插件会将请求的详细信息发送到您指定的 `notifyTarget`，等待人工处理。
4. **人工处理**：管理员可通过回复指令（如 `y1` 同意，`n1 理由` 拒绝）来处理请求。
5. **超时处理**：如果在 `manualTimeout` 设置的时间内未处理，请求将按 `manualTimeoutAction` 的设置被自动同意或拒绝。
6. **通知失败**：如果 `notifyTarget` 未填写或格式错误，插件将无法发送审核通知，此时请求将等待超时后，按 `manualTimeoutAction` 的设置自动处理。

## 注意事项

- 本插件依赖 OneBot v11 适配器，请确保已正确安装和配置。
- **正确填写 `notifyTarget` 是进行人工审核的关键。如果留空或格式错误，所有需要人工审核的请求将无法收到通知，并会在超时后被自动处理。**
- 所有命令前缀均为 `qgroup`，可在 Koishi 配置文件中调整。
- 使用群管理命令需要机器人拥有相应的群权限（管理员或群主）。
- 大部分群管理命令支持 `-g <群号>` 或 `--group <群号>` 参数，用于在其他聊天环境中管理指定群组。
