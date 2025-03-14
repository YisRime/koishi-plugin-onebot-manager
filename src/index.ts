import { Context, Schema, h } from 'koishi'
import { inspect } from 'util'

export const name = 'dev-tool'

export interface Config {}

export const Config: Schema<Config> = Schema.object({})

export function apply(ctx: Context) {
  const ins = ctx.command('inspect')

  /**
   * 检查消息元素命令
   * 用于调试和查看消息结构
   */
  ins.subcommand('elements', '检查消息元素')
    .action(({ session }) => {
      let { elements, quote } = session
      if (quote) elements = quote.elements
      const jsons = []
      elements = elements.map((element) => {
        if (element.type === 'json') {
          jsons.push(JSON.parse(element.attrs.data))
          element.attrs.data = `[JSON ${jsons.length}]`
        }
        return element
      })
      let result = inspect(elements, { depth: Infinity })
      if (jsons.length) {
        result += '\n\n' + jsons.map((data, index) => `[JSON ${index + 1}]: ${inspect(data, { depth: Infinity })}`).join('\n\n')
      }
      return h.text(result)
    })

  /**
   * 获取消息ID命令
   * 用于获取当前消息或引用消息的ID
   */
  ins.subcommand('msgid', '获取消息ID')
    .action(async ({ session }) => {
      if (session.quote) {
        return session.quote.id
      }
      return session.messageId
    })
}
