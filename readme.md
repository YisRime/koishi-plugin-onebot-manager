# koishi-plugin-onebot-manager

[![npm](https://img.shields.io/npm/v/koishi-plugin-onebot-manager?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-onebot-manager)

适用于 Onebot 的 QQ 群管，可自动处理好友申请、群邀请和入群请求，并提供一系列群组管理命令。

## ✨ 功能亮点

- **🤖 全自动请求处理**：自动处理好友申请、加群请求和群邀请。当请求不满足预设条件时，将无缝转为人工审核。
- **🧠 智能条件审批**：可基于 **QQ 等级**、**验证信息正则**、**邀请人白名单**、**群成员数**及**群容量**等多种条件，实现精准的自动化审批。
- **🔔 关键事件通知**：
  - **成员变动**：可自定义成员入群和退群的提示消息。
  - **待办提醒**：待审核的请求将发送至指定联系人或群组，并可通过指令快速处理。
  - **被踢通知**：当机器人被移出群聊时，会立刻向指定目标发送通知。
  - **管理变动**：当群内管理员被设置或取消时，会发送通知。
- **🛠️ 全面的群管命令**：提供从设置群名片、专属头衔到设置精华消息、禁言、踢人等一系列实用管理命令。
- **⚡️ 高效批量操作**：对于待处理的请求，管理员可以使用 `ya` 或 `na` 等指令一键同意或拒绝所有请求。

## ⚠️ 注意事项

- **本插件强依赖 OneBot v11 适配器**。使用前，请确保您的 Koishi 实例已正确安装并配置 `koishi-plugin-adapter-onebot`。
- **`notifyTarget` 是人工审核的核心**。请务必正确填写此项，否则所有需要人工审核的请求都将静默地等待超时后自动处理。
- 插件的许多管理功能需要机器人拥有**群主**或**管理员**权限才能正常工作。
- 您可以在 Koishi 的配置文件中为 `qgroup` 命令设置别名，以简化输入。

## ⚙️ 配置说明

以下是所有可用的配置项说明。

```yaml
plugins:
  onebot-manager:
    # ------------------ 监听配置 ------------------
    enableKick: true      # 开启机器人被踢或主动退群的监听。
    enableAdmin: true     # 开启群内管理员变动（设置/取消）的监听。
    notifyTarget: ''      # [必填] 审核和事件通知的目标，格式为 "guild:群号" 或 "private:QQ号"。
    enableJoin: false     # 开启新成员入群监听。
    enableLeave: false    # 开启群成员退群监听。
    joinMessage: '{userName} 加入了本群' # 自定义入群欢迎语。
    leaveMessage: '{userName} 离开了本群' # 自定义退群提示。
    # 可用占位符: {userName}, {userId}, {guildName}, {guildId}

    # ------------------ 请求配置 ------------------
    enable: true          # 开启插件的请求处理总开关（好友、加群、邀请）。
    manualTimeout: 360    # 人工审核的超时时长（分钟），0 表示永不超时。
    manualTimeoutAction: 'accept' # 超时后的默认操作：'accept' (同意) 或 'reject' (拒绝)。

    # --- 自动审批条件 ---
    # 【好友请求】
    FriendLevel: -1              # 自动通过的好友最低QQ等级（-1表示不限制）。
    FriendRequestAutoRegex: ''   # 匹配好友验证信息的正则表达式，满足条件则自动通过。

    # 【加群请求】
    MemberRequestAutoRules: []   # 自动审批规则，可为不同群组设定不同规则。
    # 示例:
    # MemberRequestAutoRules:
    #   - guildId: '123456'  # 目标群号
    #     keyword: 'koishi'  # 匹配加群验证信息的正则表达式
    #     minLevel: 16       # 申请人的最低QQ等级（可选，-1为不限制）
    #   - guildId: '654321'
    #     keyword: '芝麻开门'

    # 【群邀请】
    GuildAllowUsers: []      # 邀请人白名单（QQ号列表），白名单内的用户发出的邀请将直接通过。
    GuildMinMemberCount: -1  # 自动同意邀请的群最低成员数（-1表示不限制）。
    GuildMaxCapacity: -1     # 自动同意邀请的群最低容量（-1表示不限制）。

    # ------------------ 命令配置 ------------------
    commandWhitelist: []  # 命令白名单 (填写用户QQ号)，白名单用户可无视权限要求使用所有管理命令。
```

## 📖 命令用法

**权限说明**：

- **机器人权限**：执行大多数命令要求机器人自身在群内拥有**管理员**或**群主**身份。
- **用户权限**：命令执行者通常需要是群内的**管理员**或**群主**。
- **白名单**：在 `commandWhitelist` 中的用户不受用户权限的限制。
- **远程管理**：大多数命令支持 `-g <群号>` 或 `--group <群号>` 参数，允许在其他聊天窗口远程管理指定群组。

| 命令 | 描述 | 权限要求 (机器人/用户) | 示例 |
| --- | --- | --- | --- |
| `qgroup tag [头衔] [目标]` | 设置或清除群专属头衔 | **群主** / **管理员**或**群主** (为他人) | `qgroup tag 技术大佬` (为自己设置)`qgroup tag BUG制造机 @张三` (为他人)`qgroup tag "" @张三` (清除他人头衔) |
| `qgroup membercard [名片] [目标]` | 设置或清除群名片 | 管理员 / 管理员或群主 (为他人) | `qgroup membercard 摸鱼中` (为自己)`qgroup membercard 奋斗中 @李四` (为他人) |
| `qgroup groupname <群名>` | 设置当前群的名称 | 管理员 / 管理员或群主 | `qgroup groupname Koishi交流群` |
| `qgroup essence [消息ID]` | 将消息设为精华 | 管理员 / 管理员或群主 | `qgroup essence` (引用一条消息)`qgroup essence 123456` |
| `qgroup essence.del [消息ID]` | 移除精华消息 | 管理员 / 管理员或群主 | `qgroup essence.del` (引用一条精华消息) |
| `qgroup admin <目标>` | 设置某人为管理员 | **群主** / 管理员或群主 | `qgroup admin @王五` |
| `qgroup admin.del <目标>` | 取消某人的管理员 | **群主** / 管理员或群主 | `qgroup admin.del @王五` |
| `qgroup mute <目标> [时长]` | 禁言成员 (秒)，默认30分钟 | 管理员 / 管理员或群主 | `qgroup mute @赵六 60` (禁言60秒)`qgroup mute @赵六 -c` (取消禁言) |
| `qgroup mute.all [开关]` | 全体禁言 | 管理员 / 管理员或群主 | `qgroup mute.all` (开启)`qgroup mute.all false` (关闭) |
| `qgroup kick <目标>` | 踢出成员 | 管理员 / 管理员或群主 | `qgroup kick @钱七``qgroup kick @钱七 -r` (踢出并拒加) |
| `qgroup revoke` | 撤回消息 | 管理员 / 消息发送者 | (引用一条消息) `qgroup revoke` |

## 审批流程详解

当 `enable` 设为 `true` 时，插件将按以下流程处理所有请求：

1. **自动审批检查**：插件首先根据请求类型（好友/加群/邀请），检查其是否满足您在配置中设定的任一自动审批条件。
    - **加群请求**：匹配 `MemberRequestAutoRules` 中对应群号的 `keyword` 正则或 `minLevel` 等级要求。
    - **好友请求**：匹配 `FriendRequestAutoRegex` 正则或 `FriendLevel` 等级要求。
    - **群邀请**：邀请人位于 `GuildAllowUsers` 白名单中，或被邀请的群满足 `GuildMinMemberCount` 和 `GuildMaxCapacity` 的要求。
2. **通过或转交**：如果满足条件，请求将**自动同意**。若不满足任何条件，请求将进入人工审核流程。
3. **发送审核通知**：插件会将请求详情（如申请人、目标群、验证信息等）格式化后，发送到您指定的 `notifyTarget`，并为该请求分配一个唯一的请求编号。
4. **人工审核**：管理员可根据收到的通知，回复指令来处理请求：
    - **单条处理**：
        - 同意：`y<请求编号> [备注]` 或 `通过<请求编号> [备注]`
        - 拒绝：`n<请求编号> [理由]` 或 `拒绝<请求编号> [理由]`
    - **批量处理**：
        - 全部同意：`ya [备注]` 或 `全部同意 [备注]`
        - 全部拒绝：`na [理由]` 或 `全部拒绝 [理由]`
5. **超时自动处理**：如果在 `manualTimeout` 设定的时间内无人处理，请求将根据 `manualTimeoutAction` 的配置被自动同意或拒绝，并发送通知。
6. **通知失败**：若 `notifyTarget` **未填写或格式错误**，需要人工审核的请求将无法发出通知，并会在超时后按步骤 5 自动处理。
