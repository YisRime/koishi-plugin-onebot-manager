# koishi-plugin-onebot-manager

[![npm](https://img.shields.io/npm/v/koishi-plugin-onebot-manager?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-onebot-manager)

适用于 Onebot 的 QQ 群管系统，提供自动处理请求和群组管理功能

## 功能特性

- **请求处理**：自动处理好友申请、群邀请和入群请求
- **通知功能**：将请求消息转发至指定群或私聊，并可通过回复进行处理
- **群管理**：设置群专属头衔等实用功能

## 配置说明

```yaml
enable: true              # 是否启用插件，默认为 true
requestOption: 'reject'   # 请求处理方式：accept(同意)、reject(拒绝)、manual(手动)
enableNotify: false       # 是否启用通知功能
notifyTarget: ''          # 通知目标，格式为 "group:群号" 或 "private:QQ号"
```

### 通知功能

当 `enableNotify` 设置为 `true` 时，插件会将请求消息转发到 `notifyTarget` 指定的目标。

- 通知目标格式：`group:群号` 或 `private:QQ号`
- 私聊通知模式下，可通过回复 `y` 或 `n` 来处理请求
- 添加好友请求回复格式：`y [备注]` 或 `n [理由]`
- 群请求回复格式：`y` 同意，`n [拒绝理由]` 拒绝

## 命令说明

| 命令 | 描述 | 示例 |
|------|------|------|
| `tag [头衔] [目标]` | 设置群专属头衔 | `tag 管理员` 设置自己头衔`tag 群主 @用户` 设置他人头衔`tag` 清除自己头衔 |

## 注意事项

- 插件需要 Onebot 适配器支持
- 设置头衔功能需要机器人具有群管理员或群主权限
- 通知功能需要正确配置通知目标才能生效
