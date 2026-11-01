/** 视频链接入库的真机回归：入库 → 主库落行 → 重复提示。前置：dev 已启动、CaptureTool 解析预览已在页面上 */
const BASE = 'http://127.0.0.1:9223'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function pageWs() {
  const list = await (await fetch(`${BASE}/json`)).json()
  const page = list.find((t) => t.type === 'page')
  return page.webSocketDebuggerUrl
}

let seq = 0
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const pending = new Map()
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        const { resolve: res, reject: rej } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) rej(new Error(msg.error.message))
        else res(msg.result)
      }
    }
    ws.onopen = () =>
      resolve({
        evaluate: async (expression) => {
          const id = ++seq
          ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
          const r = await new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }))
          if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? '页面异常')
          return r.result?.value
        },
        close: () => ws.close(),
      })
    ws.onerror = () => reject(new Error('CDP 连接失败'))
  })
}

async function main() {
  const c = await connect(await pageWs())

  // ④ 点「确认存入条目库」
  await c.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('确认存入条目库'))?.click()`)
  await sleep(1500)
  const okMsg = await c.evaluate(`(() => { const el = [...document.querySelectorAll('div')].find((d) => d.getAttribute('style')?.includes('var(--ok)')); return el?.innerText ?? null })()`)
  console.log('④ 入库提示:', JSON.stringify(okMsg))

  // ⑤ 主库确认捕获条目
  const rows = await c.evaluate(`(async () => (await window.__TAURI_INTERNALS__.invoke('db_select', { sql: "SELECT id, payload FROM items WHERE sourceId = 'capture'", params: [] })))()`)
  const titles = rows.map((r) => JSON.parse(r.payload).title)
  console.log('⑤ 主库捕获条目:', JSON.stringify(titles))
  if (!titles.some((t) => t.includes('Rick Astley'))) throw new Error('主库没查到捕获条目')

  // ⑥ 重新填同一链接 → 解析 → 入库 → 重复提示
  await c.evaluate(`(() => {
    const ta = [...document.querySelectorAll('textarea')].find((t) => t.placeholder.includes('视频页面链接'))
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    setter.call(ta, 'https://www.bilibili.com/video/BV1GJ411x7h7')
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await c.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '解析')?.click()`)
  await sleep(7000)
  await c.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('确认存入条目库'))?.click()`)
  await sleep(1200)
  const dupMsg = await c.evaluate(`(() => { const el = [...document.querySelectorAll('div')].find((d) => d.getAttribute('style')?.includes('var(--danger)')); return el?.innerText ?? null })()`)
  console.log('⑥ 重复入库提示:', JSON.stringify(dupMsg))
  if (!dupMsg?.includes('已经在条目库')) throw new Error('重复入库没有给出已存在提示')

  const count = await c.evaluate(`(async () => (await window.__TAURI_INTERNALS__.invoke('db_select', { sql: "SELECT COUNT(*) AS n FROM items WHERE sourceId = 'capture'", params: [] }))[0].n)()`)
  console.log(`⑦ 去重确认：捕获条目共 ${count} 条（应为 1）`)
  if (count !== 1) throw new Error('去重失败：重复链接入库了两次')

  c.close()
  console.log('\n链接捕获真机回归全部通过')
}

main().catch((e) => {
  console.error(`验证失败：${e.message}`)
  process.exit(1)
})
