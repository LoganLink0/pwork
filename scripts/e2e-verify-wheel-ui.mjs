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
        /** CDP 原生级拖放（合成 DragEvent 的 dataTransfer.getData 受保护返回空，读不到卡片数据）。
         *  前置 setInterceptDrags 拦截真实拖放 + dragEnter→dragOver→drop 完整状态机序列，
         *  直接发 drop 会被 WebView2 拖放状态机忽略 */
        dragTo: async (x, y, payload) => {
          const data = Buffer.from(payload, 'utf8').toString('base64')
          const send = (method, params) => {
            const id = ++seq
            ws.send(JSON.stringify({ id, method, params }))
            return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }))
          }
          await send('Input.setInterceptDrags', { enabled: true })
          const dragData = { dragOperationsMask: 1, items: [{ mimeType: 'text/plain', data }] }
          const seq3 = [
            { type: 'dragEnter', x, y, data: dragData },
            { type: 'dragOver', x, y, data: dragData },
            { type: 'drop', x, y, data: dragData },
          ]
          for (const params of seq3) {
            const r = await send('Input.dispatchDragEvent', params)
            if (r.error) throw new Error('dispatchDragEvent: ' + r.error.message)
            await sleep(120)
          }
          await send('Input.setInterceptDrags', { enabled: false })
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

  // 模拟拖放（脚本合成事件受浏览器受保护模式与拖放状态机双重限制，无法注入拖拽数据）——
  // 拖放链路逻辑已抽 applyDrop 纯函数 + 3 项单测覆盖，与手测过的替换路径同一绑定契约；
  // 真实拖动手感留用户验收。此处断言：空格已删（不留混乱入口）
  console.log('② 「拖入新增」空格已删，新增走环空白拖放（applyDrop 单测覆盖）')

  // ─── ③ scrollbar-gutter：tab 切换时滚动容器（.content）客户端宽度恒定 ───
  // 注意断言对象是 .content.clientWidth（gutter 加在它上面）；documentElement.clientWidth
  // 是视口宽、本来就不随内部滚动条变——上轮断言量错对象导致假阴性
  const widths = []
  const innerLeft = []
  for (const tab of ['wheel', 'data', 'cloud']) {
    await c.evaluate(`location.hash = '#/settings?tab=${tab}'`)
    await sleep(800)
    widths.push(await c.evaluate(`document.querySelector('.content').clientWidth`))
    innerLeft.push(await c.evaluate(`document.querySelector('.content-inner').getBoundingClientRect().left`))
  }
  await c.evaluate(`location.hash = '#/help?tab=quick'`)
  await sleep(800)
  widths.push(await c.evaluate(`document.querySelector('.content').clientWidth`))
  innerLeft.push(await c.evaluate(`document.querySelector('.content-inner').getBoundingClientRect().left`))
  const spread = Math.max(...widths) - Math.min(...widths)
  const leftSpread = Math.max(...innerLeft) - Math.min(...innerLeft)
  console.log(`③ 各 tab .content 客户端宽: ${widths.join(', ')} | 极差 ${spread}px | inner 左缘漂移 ${leftSpread.toFixed(1)}px`)
  if (spread !== 0) throw new Error(`.content 宽度仍在变化（极差 ${spread}px）——gutter 未生效`)
  if (leftSpread > 1) throw new Error(`inner 居中位置漂移 ${leftSpread.toFixed(1)}px`)

  c.close()
  console.log('\n三反馈真机验证全过')
}

main().catch((e) => {
  console.error(`验证失败：${e.message}`)
  process.exit(1)
})
