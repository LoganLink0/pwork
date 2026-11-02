/**
 * 用户三反馈真机验证：
 * ①轮盘 desc 分段与主题色强调（换行 + 强调 span 颜色 = accent-text）
 * ②空格已删 + 拖到环空白新增格位（DataTransfer 模拟拖放）+ 格位替换不受冒泡干扰
 * ③scrollbar-gutter：设置各 tab 间切换时滚动宽度（scrollbar 占位）恒定——页面不水平微移
 * 前置：dev 已启动。用法：node scripts/e2e-verify-wheel-ui.mjs
 */
const DEBUG_PORT = Number(process.env.CDP_PORT ?? 9223)
const BASE = `http://127.0.0.1:${DEBUG_PORT}`

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
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
        /** CDP 原生级拖放（合成 DragEvent 的 dataTransfer.getData 受保护返回空，读不到卡片数据） */
        dragTo: async (x, y, payload) => {
          const id = ++seq
          const data = Buffer.from(payload, 'utf8').toString('base64')
          ws.send(JSON.stringify({
            id,
            method: 'Input.dispatchDragEvent',
            params: {
              type: 'drop',
              x,
              y,
              data: { dragOperationsMask: 1, items: [{ mimeType: 'text/plain', data }] },
            },
          }))
          const r = await new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }))
          if (r.error) throw new Error('dispatchDragEvent: ' + r.error.message)
          return true
        },
        close: () => ws.close(),
      })
    ws.onerror = () => reject(new Error('CDP 连接失败'))
  })
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
  const main = list.filter((t) => t.type === 'page').find((p) => !p.url.includes('#/wheel'))
  const c = await connect(main.webSocketDebuggerUrl)
  await sleep(2500)
  // 基线清底：上一轮遗留的格位状态不参与本轮断言
  await c.evaluate(`localStorage.removeItem('pwork-wheel-slots')`)
  await c.evaluate(`location.hash = '#/'; location.reload()`)
  await sleep(2000)
  await c.evaluate(`location.hash = '#/settings?tab=wheel'`)
  await sleep(1200)

  // ─── ① desc 分段 + 主题色强调 ───
  await c.evaluate(`location.hash = '#/settings?tab=wheel'`)
  await sleep(1200)
  const desc = await c.evaluate(`(() => {
    const d = [...document.querySelectorAll('[data-tab="wheel"] .desc')].find((x) => x.innerText.includes('自定义方式'))
    if (!d) return null
    const em = d.querySelector('b[style]')
    return JSON.stringify({
      hasBr: !!d.querySelector('br'),
      emColor: em ? getComputedStyle(em).color : null,
      text: d.innerText.slice(0, 40),
    })
  })()`)
  const d1 = JSON.parse(desc)
  console.log(`① desc 换行=${d1.hasBr} | 强调色=${d1.emColor} | 开头=${JSON.stringify(d1.text)}`)
  if (!d1.hasBr) throw new Error('desc 未分段')
  if (d1.emColor === 'rgb(0, 0, 0)' || d1.emColor === null) throw new Error('强调句未用主题色')

  // ─── ② 空格已删 + 环空白拖放新增 ───
  const before2 = await c.evaluate(`(() => {
    const ring = document.querySelector('.wheel-edit-ring')
    return JSON.stringify({ slots: ring.querySelectorAll('.wheel-slot').length, empty: !!ring.querySelector('.wheel-slot-new, .wheel-slot-empty') })
  })()`)
  const b2 = JSON.parse(before2)
  console.log(`② 空格删除前状态: ${b2.slots} 格 | 虚线空格存在=${b2.empty}`)
  if (b2.empty) throw new Error('「拖入新增」空格仍在')

  // 模拟拖放新增：CDP 原生 drop 到环空白（中心处；中心文字 pointer-events:none 事件落到环容器）
  const ringRect = await c.evaluate(`(() => { const r = document.querySelector('.wheel-edit-ring').getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) })()`)
  const rr = JSON.parse(ringRect)
  await c.dragTo(rr.x, rr.y, JSON.stringify({ kind: 'route', target: '/goals', label: '目标', icon: 'goals' }))
  await sleep(600)
  const added = await c.evaluate(`document.querySelectorAll('.wheel-edit-ring .wheel-slot').length`)
  console.log(`② 拖到环空白新增后: ${added} 格`)
  if (added !== b2.slots + 1) throw new Error('环空白拖放未新增格位')
  // 新格内容正确（目标页）
  const newLabel = await c.evaluate(`[...document.querySelectorAll('.wheel-edit-ring .wheel-slot')].some((s) => s.textContent.includes('目标'))`)
  if (!newLabel) throw new Error('新增格内容不符')

  // 替换路径不受冒泡干扰：拖卡片到已有格 → 数量不变、内容替换
  const slotRect = await c.evaluate(`(() => { const r = document.querySelector('.wheel-edit-ring .wheel-slot').getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) })()`)
  const sr = JSON.parse(slotRect)
  await c.dragTo(sr.x, sr.y, JSON.stringify({ kind: 'route', target: '/tasks', label: '待办', icon: 'tasks' }))
  await sleep(600)
  const replaced = await c.evaluate(`(() => {
    const ring = document.querySelector('.wheel-edit-ring')
    return JSON.stringify({ count: ring.querySelectorAll('.wheel-slot').length, hasNew: [...ring.querySelectorAll('.wheel-slot')].some((s) => s.textContent.includes('待办')) })
  })()`)
  const r2 = JSON.parse(replaced)
  console.log(`② 拖到已有格替换后: ${r2.count} 格（数量不变） | 内容已替换=${r2.hasNew}`)
  if (r2.count !== added || !r2.hasNew) throw new Error('替换路径异常（冒泡导致数量变化或未替换）')

  // ─── ③ scrollbar-gutter：tab 切换时布局视口宽度恒定 ───
  const widths = []
  for (const tab of ['wheel', 'data', 'cloud']) {
    await c.evaluate(`location.hash = '#/settings?tab=${tab}'`)
    await sleep(800)
    widths.push(await c.evaluate(`document.documentElement.clientWidth`))
  }
  await c.evaluate(`location.hash = '#/help?tab=quick'`)
  await sleep(800)
  widths.push(await c.evaluate(`document.documentElement.clientWidth`))
  const spread = Math.max(...widths) - Math.min(...widths)
  console.log(`③ 各 tab 布局视口宽度: ${widths.join(', ')} | 极差 ${spread}px`)
  if (spread !== 0) throw new Error(`滚动条出现/消失仍引发视口宽度变化（极差 ${spread}px）——scrollbar-gutter 未生效`)

  c.close()
  console.log('\n三反馈真机验证全过')
}

main().catch((e) => {
  console.error(`验证失败：${e.message}`)
  process.exit(1)
})
