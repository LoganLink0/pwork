// 被动取证：监听目标的事件流（崩溃/异常/控制台），不发任何 evaluate
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
let seq = 0
const pending = new Map()
const consoleLines = []
const exceptions = []
let crashed = false
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ')
    consoleLines.push(`[${msg.params.type}] ${text.slice(0, 200)}`)
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    exceptions.push((d.exception?.description ?? d.text).slice(0, 300))
  }
  if (msg.method === 'Inspector.targetCrashed') crashed = true
  if (msg.method === 'Target.targetCrashed') crashed = true
  if (msg.id && pending.has(msg.id)) {
    const { resolve: res } = pending.get(msg.id)
    pending.delete(msg.id)
    res(msg.result)
  }
}
ws.onopen = () => {
  ws.send(JSON.stringify({ id: ++seq, method: 'Runtime.enable', params: {} }))
  ws.send(JSON.stringify({ id: ++seq, method: 'Log.enable', params: {} }))
  ws.send(JSON.stringify({ id: ++seq, method: 'Page.enable', params: {} }))
  // 15 秒后触发一次重载，观察新文档的事件流（含启动期控制台与异常）
  setTimeout(() => {
    const lastCount = consoleLines.length
    ws.send(JSON.stringify({ id: ++seq, method: 'Page.enable', params: {} }))
    ws.send(JSON.stringify({ id: ++seq, method: 'Runtime.evaluate', params: { expression: '1+1' } }))
    setTimeout(() => {
      console.log(`targetCrashed: ${crashed}`)
      console.log(`控制台（重载后 ${consoleLines.length - lastCount} 条 / 全部 ${consoleLines.length} 条）:`)
      for (const l of consoleLines.slice(-15)) console.log('  ' + l)
      console.log(`异常 ${exceptions.length} 条:`)
      for (const e of exceptions.slice(-5)) console.log('  ' + e)
      process.exit(0)
    }, 8000)
    ws.send(JSON.stringify({ id: ++seq, method: 'Page.reload', params: {} }))
  }, 3000)
}
ws.onerror = () => {
  console.log('ws 连接失败')
  process.exit(1)
}
setTimeout(() => {
  console.log('ws 建立超时')
  process.exit(1)
}, 15000)
