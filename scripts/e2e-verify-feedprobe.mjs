/**
 * Feed 自动探测真机验证（信源融合批）：三个真实场景——
 * ① 已是 feed 的输入（react.dev/rss.xml）→ how='input' 原样返回；
 * ② 站点主页（react.dev）→ 经页面声明或惯例路径找到 feed；
 * ③ 无 feed 的站点（example.com）→ 找不到，静默返回 null。
 * 前置：dev 已启动（网关 8788 在位）。用法：node scripts/e2e-verify-feedprobe.mjs
 */
const DEBUG_PORT = Number(process.env.CDP_PORT ?? 9223)
const BASE = `http://127.0.0.1:${DEBUG_PORT}`

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`${BASE}/json/version`)
      if (r.ok) break
    } catch {}
    await sleep(1000)
  }
  const list = await (await fetch(`${BASE}/json`)).json()
  const page = list.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let seq = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result)
      pending.delete(m.id)
    }
  }
  const ev = async (expr) => {
    const id = ++seq
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }))
    const r = await new Promise((res) => pending.set(id, res))
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? '页面异常')
    return r.result?.value
  }
  await sleep(2500)

  const r1 = await ev(`(async () => { const m = await import('/src/engine/feedProbe.ts'); return JSON.stringify(await m.probeFeedUrl('https://react.dev/rss.xml')) })()`)
  console.log('① 输入本身是 feed:', r1)
  if (!JSON.parse(r1).how.startsWith('input')) throw new Error('① 应识别为 feed 本身')

  const r2 = await ev(`(async () => { const m = await import('/src/engine/feedProbe.ts'); return JSON.stringify(await m.probeFeedUrl('https://react.dev')) })()`)
  console.log('② 主页探测:', r2)
  if (!JSON.parse(r2).feedUrl) throw new Error('② react.dev 主页应能探测到 feed')

  const r3 = await ev(`(async () => { const m = await import('/src/engine/feedProbe.ts'); return JSON.stringify(await m.probeFeedUrl('https://example.com')) })()`)
  console.log('③ 无 feed 站点:', r3)
  if (JSON.parse(r3).feedUrl !== null) throw new Error('③ example.com 不应探测到 feed')

  ws.close()
  console.log('\nFeed 探测真机验证三场景全过')
}

main().catch((e) => {
  console.error(`验证失败：${e.message}`)
  process.exit(1)
})
