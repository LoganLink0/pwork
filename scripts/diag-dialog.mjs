// 诊断：页面是否被阻塞式 JS 对话框冻结（CDP Page 域事件取证）
const BASE = `http://127.0.0.1:${process.env.CDP_PORT ?? 9223}`
async function pageWs() {
  const list = await (await fetch(BASE + '/json')).json()
  const page = list.find((t) => t.type === 'page')
  return page?.webSocketDebuggerUrl
}
const wsUrl = await pageWs()
if (!wsUrl) {
  console.log('无页面目标')
  process.exit(1)
}
const ws = new WebSocket(wsUrl)
const events = []
let seq = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.method) events.push({ method: msg.method, params: msg.params })
  if (msg.id && pending.has(msg.id)) {
    const { resolve: res, reject: rej } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? rej(new Error(msg.error.message)) : res(msg.result)
  }
}
ws.onopen = () => {
  ws.send(JSON.stringify({ id: ++seq, method: 'Page.enable', params: {} }))
  setTimeout(() => {
    ws.send(JSON.stringify({ id: ++seq, method: 'Runtime.evaluate', params: { expression: 'location.reload()' } }))
  }, 500)
  setTimeout(() => {
    const dialogs = events.filter((e) => e.method === 'Page.javascriptDialogOpening')
    if (dialogs.length > 0) {
      for (const d of dialogs) {
        console.log(`发现阻塞对话框：type=${d.params.type} message=${JSON.stringify(d.params.message)} url=${d.params.url ?? ''}`)
      }
      // 解除对话框（接受），让页面恢复响应
      ws.send(JSON.stringify({ id: ++seq, method: 'Page.handleJavaScriptDialog', params: { accept: true } }))
      setTimeout(() => {
        console.log('对话框已接受解除，页面应恢复响应')
        process.exit(0)
      }, 800)
    } else {
      console.log('未发现对话框事件；期间事件清单：', events.map((e) => e.method).join(', ') || '（无）')
      process.exit(0)
    }
  }, 6000)
}
ws.onerror = () => {
  console.log('ws 连接失败')
  process.exit(1)
}
