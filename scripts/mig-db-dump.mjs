// 主库内容速查：经运行中的应用 invoke db_select（带超时保护）
const BASE = `http://127.0.0.1:${process.env.CDP_PORT ?? 9223}`
async function pageWs() {
  const list = await (await fetch(BASE + '/json')).json()
  const page = list.find((t) => t.type === 'page')
  return page?.webSocketDebuggerUrl
}
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const pending = new Map()
    const connTimer = setTimeout(() => reject(new Error('ws 连接超时')), 8000)
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        const { resolve: res, reject: rej } = pending.get(msg.id)
        pending.delete(msg.id)
        clearTimeout(connTimer)
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result)
      }
    }
    ws.onopen = () =>
      resolve({
        evaluate: (expression) =>
          new Promise((res, rej) => {
            const id = Date.now() + Math.random()
            const t = setTimeout(() => rej(new Error('evaluate 超时')), 8000)
            ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }))
            pending.set(id, {
              resolve: (r) => {
                clearTimeout(t)
                if (r.exceptionDetails) rej(new Error(r.exceptionDetails.exception?.description ?? '页面异常'))
                else res(r.result?.value)
              },
              reject: (e) => {
                clearTimeout(t)
                rej(e)
              },
            })
          }),
        close: () => {
          clearTimeout(connTimer)
          ws.close()
        },
      })
    ws.onerror = () => {
      clearTimeout(connTimer)
      reject(new Error('ws 连接失败'))
    }
  })
}

const cdp = await connect(await pageWs())
const queries = [
  ['notes', "SELECT id, payload FROM notes"],
  ['tasks', "SELECT id, payload FROM tasks"],
  ['meta', "SELECT key, payload FROM meta"],
  ['镜像错误', "SELECT message FROM errorLog WHERE message LIKE '%镜像%' ORDER BY at DESC LIMIT 3"],
]
for (const [label, sql] of queries) {
  try {
    const rows = await cdp.evaluate(
      `(async () => await window.__TAURI_INTERNALS__.invoke('db_select', { sql: ${JSON.stringify(sql)}, params: [] }))()`,
    )
    console.log(`${label}:`, rows.length === 0 ? '（空）' : JSON.stringify(rows).slice(0, 300))
  } catch (e) {
    console.log(`${label}: 查询失败 — ${e.message}`)
  }
}
cdp.close()
process.exit(0)
