# koishi-plugin-onebot-manager

[![npm](https://img.shields.io/npm/v/koishi-plugin-onebot-manager?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-onebot-manager)

适用于 Onebot 的 QQ 群管，可自动处理好友申请、群邀请和入群请求，并提供一系列群组管理命令。

## ✨ 功能亮点

- **🤖 全自动请求处理**：自动处理好友申请、加群请求和入群邀请。当请求不满足预设条件时，将无缝转为人工审核。
- **🧠 智能条件审批**：可基于 **QQ 等级**、**正则表达式关键词**、**邀请人白名单**、**群成员数**及**群容量**等多种条件，实现精准的自动化审批。
- **🔔 关键事件通知**：
  - **入群/退群**：可自定义成员入群和离群的欢迎/提示消息。
  - **待办提醒**：待审核的请求将强制转发至指定管理员，并通过指令快速处理。
  - **被踢通知**：当机器人被移出群聊时，会立刻向管理员发送通知。
- **🛠️ 全面的群管命令**：提供从设置群头衔、群名片到精华消息、禁言、踢人等一系列实用管理命令，覆盖高频管理场景。
- **⚡️ 高效批量操作**：对于需要人工审核的请求，管理员可以使用 `ya` 或 `na` 指令一键同意或拒绝所有待处理请求。

## ⚙️ 配置说明

```yaml
# koishi.yml
plugins:
  onebot-manager:
    # 基础配置
    enable: true          # true: 启用插件的请求处理功能
    enableJoin: false     # true: 开启入群监听
    joinMessage: '欢迎 {userName} 加入本群！' # 自定义入群欢迎语
    enableLeave: false    # true: 开启群成员退群监听
    leaveMessage: '{userName} 已离开本群'    # 自定义退群提示
    # 可用占位符: {userName}, {userId}, {guildName}, {guildId}
    enableKick: true      # true: 开启机器人被踢/主动退群监听
    commandWhitelist: []  # 命令白名单 (填写用户QQ号)，白名单内的用户可无视权限要求使用所有管理命令。

    # 请求处理与审核配置
    notifyTarget: ''      # [必填] 审核通知目标，格式 "guild:群号" 或 "private:QQ号"
    manualTimeout: 720    # 人工审核超时时间(分钟)，0 表示永不超时
    manualTimeoutAction: 'reject' # 超时后的默认操作：'accept' (同意) 或 'reject' (拒绝)

    # --- 自动审批条件 ---

    # 【好友请求】
    FriendLevel: -1              # 自动通过的最低QQ等级（-1表示不限制）
    FriendRequestAutoRegex: ''   # 匹配验证信息的正则表达式（满足则通过）

    # 【加群请求】
    MemberRequestAutoRules: []   # 自动审批规则 (可为不同群组设不同规则)
    # 示例:
    # MemberRequestAutoRules:
    #   - guildId: '12345678' # 目标群号
    #     keyword: 'koishi' # 匹配验证信息的正则
    #     minLevel: 16      # 申请人的最低QQ等级（可选，-1为不限）
    #   - guildId: '87654321' # 另一群
    #     keyword: '芝麻开门'

    # 【入群邀请】
    GuildAllowUsers: []      # 邀请人ID白名单（白名单内用户邀请将直接通过）
    GuildMinMemberCount: -1  # 被邀请群的最低成员数（-1表示不限制）
    GuildMaxCapacity: -1     # 被邀请群的最低容量（-1表示不限制）
```

## 📖 命令用法

**注意**：

- 所有命令都需要机器人拥有相应的群权限（管理员或群主）。
- 用户在 `commandWhitelist` 白名单中时，可以无视此权限要求。
- 大多数命令支持 `-g <群号>` 或 `--group <群号>` 参数，以便在其他聊天环境中远程管理指定群组。

| 命令 | 描述 | 示例 |
| --- | --- | --- |
| `qgroup tag [头衔] [目标]` | 设置或清除群专属头衔 | `qgroup tag 技术大佬` (为自己设置)`qgroup tag BUG制造机 @张三` (为他人设置)`qgroup tag` (清除自己头衔) |
| `qgroup membercard [名片] [目标]` | 设置或清除群名片 | `qgroup membercard 摸鱼中` (为自己设置)`qgroup membercard 奋斗中 @李四` (为他人设置) |
| `qgroup groupname <群名>` | 设置当前群的名称 | `qgroup groupname Koishi交流群` |
| `qgroup essence [消息ID]` | 将消息设为精华 | `qgroup essence` (引用回复一条消息)`qgroup essence 123456` (通过消息ID指定) |
| `qgroup essence.del [消息ID]` | 移除精华消息 | `qgroup essence.del` (引用回复一条精华消息) |
| `qgroup admin <目标>` | 设为管理员 | `qgroup admin @王五` |
| `qgroup admin.del <目标>` | 取消管理员 | `qgroup admin.del @王五` |
| `qgroup mute <目标> [时长]` | 禁言成员 (秒)，默认30分钟 | `qgroup mute @赵六 60` (禁言60秒)`qgroup mute @赵六 -c` (取消禁言) |
| `qgroup mute.all [开关]` | 全体禁言 | `qgroup mute.all` (开启)`qgroup mute.all false` (关闭) |
| `qgroup kick <目标>` | 踢出成员 | `qgroup kick @钱七` (踢出)`qgroup kick @钱七 -r` (踢出并拒加) |
| `qgroup revoke` | 撤回消息 (仅限机器人自己) | (引用回复机器人发的一条消息) `qgroup revoke` |

### 审批流程详解

当 `enable` 设为 `true` 时，插件将按以下流程处理所有请求：

1. **自动审批检查**：插件首先根据请求类型（好友/加群/邀请），检查其是否满足您在配置中设定的自动审批条件。
2. **通过或转交**：如果满足任一条件，请求将被**自动同意**。若不满足任何条件，请求将进入人工审核流程。
3. **发送审核通知**：插件会将请求的详细信息（如申请人、目标群组、验证信息等）发送到您指定的 `notifyTarget`，并附带处理指令。
4. **人工审核**：管理员可根据通知，回复指令来处理单条请求：
    - 同意：`y<请求编号>` 或 `通过<请求编号>` (可附加好友备注)
    - 拒绝：`n<请求编号>` 或 `拒绝<请求编号>` (可附带拒绝理由)
    - **批量同意**：`ya` 或 `全部同意` (将一次性通过所有待处理请求)
    - **批量拒绝**：`na` 或 `全部拒绝` (将一次性拒绝所有待处理请求)
5. **超时自动处理**：如果在 `manualTimeout` 设定的时间内无人处理，请求将根据 `manualTimeoutAction` 的配置被自动同意或拒绝。
6. **通知失败**：若 `notifyTarget` **未填写或格式错误**，需要人工审核的请求将无法发出通知，并会在超时后按步骤 5 自动处理。

## ⚠️ 注意事项

- **本插件强依赖 OneBot v11 适配器**，使用前请确保您的 Koishi 实例已正确安装和配置 `koishi-plugin-adapter-onebot`。
- **`notifyTarget` 是人工审核的核心**。请务必正确填写此项，否则所有需要审核的请求都将静默地等待超时处理。
- 插件的许多功能需要机器人拥有**群主**或**管理员**权限才能正常工作。请确保给予机器人相应权限。
- 您可以在 Koishi 的配置文件中为 `qgroup` 命令设置别名，以简化输入。
