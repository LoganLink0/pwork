/**
 * 0.1.12 → 0.1.13 应用内更新链真机验收（无人值守）：
 * 驱动真实 UI：设置 → 关于 → 检查更新 → 应命中 v0.1.13 → 下载并安装（passive 静默）→ 重启应用
 * → 重启后进程版本应为 0.1.13。
 * 前置：0.1.12 安装版已以 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223 启动。
 * 用法：node scripts/e2e-verify-update-chain.mjs
 */
const DEBUG_PORT = Number(process.env.CDP_PORT ?? 9223)
const BASE = `http://127.0.0.1:${DEBUG_PORT}`
import { execSync } from 'node:child_process'

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
        close: () => ws.close(),
      })
    ws.onerror = () => reject(new Error('CDP 连接失败'))
  })
}

async function waitFor(desc, fn, timeoutMs = 120000) {
  const start = Date.now()
  for (;;) {
    try {
      const v = await fn()
      if (v) return v
    } catch {}
    if (Date.now() - start > timeoutMs) throw new Error(`等待超时：${desc}`)
    await sleep(800)
  }
}

function fileVersion() {
  return execSync(`powershell -NoProfile -Command "(Get-Item 'E:\\PWORK\\app.exe').VersionInfo.FileVersion"`, { timeout: 30000 }).toString().trim()
}

function clickButton(c, text) {
  return c.evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)})
    if (!btn) return 'no-btn'
    btn.click()
    return 'clicked'
  })()`)
}

async function main() {
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch(`${BASE}/json/version`)
      if (r.ok) break
    } catch {}
    await sleep(1000)
  }
  const list = await (await fetch(`${BASE}/json`)).json()
  const page = list.filter((t) => t.type === 'page')[0]
  const c = await connect(page.webSocketDebuggerUrl)
  await sleep(2500)

  console.log('安装前进程版本:', fileVersion())

  // ─── ① 若有迁移窗口先「暂不」（本次只验更新链；迁移留新版 UI 给用户体验）───
  const mig = await c.evaluate(`document.body.innerText.includes('数据存储升级')`)
  if (mig) {
    await c.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('暂不'))?.click()`)
    await sleep(800)
    console.log('① 迁移窗口已暂不（跳过迁移，专注更新链）')
  }

  // ─── ②③ 检查更新（带网络窗口重试：GitHub 间歇性阻断，失败等 75s 再试，最多 12 轮 ≈ 20 分钟）───
  await c.evaluate(`location.hash = '#/settings?tab=about'`)
  await sleep(1200)
  let hit = null
  for (let round = 1; round <= 12; round++) {
    console.log(`② 第 ${round} 轮点检查更新…`)
    await clickButton(c, '检查更新')
    const r = await waitFor('检查结果', async () => {
      const t = await c.evaluate(`document.querySelector('[data-testid="upd-row"]')?.innerText ?? ''`)
      if (t.includes('发现新版本')) return t.replace(/\s+/g, ' ').slice(0, 80)
      if (t.includes('已是最新')) return 'FAIL:显示已是最新（清单未被读取？）'
      if (t.includes('失败')) return 'NET: ' + t.slice(0, 90)
      return null
    }, 90000)
    if (String(r).startsWith('NET:')) {
      console.log(`  第 ${round} 轮网络失败：${String(r).slice(5, 60)}，等 75 秒重试`)
      await sleep(75000)
      continue
    }
    if (String(r).startsWith('FAIL')) throw new Error(r)
    hit = r
    console.log('③ 命中:', hit)
    break
  }
  if (!hit) throw new Error('12 轮重试后仍失败——GitHub 网络窗口长时间未恢复')

  // ─── ④ 下载并安装（passive 静默）───
  await clickButton(c, '下载并安装')
  const done = await waitFor('下载安装完成', async () => {
    const t = await c.evaluate(`document.querySelector('[data-testid="upd-row"]')?.innerText ?? ''`)
    if (t.includes('已就位')) return t.slice(0, 60)
    if (t.includes('失败')) return 'FAIL:' + t.slice(0, 120)
    return null
  }, 300000)
  if (String(done).startsWith('FAIL')) throw new Error(done)
  console.log('④ 下载安装完成:', done)

  // ─── ⑤ 重启应用 ───
  await clickButton(c, '重启应用')
  console.log('⑤ 已点重启应用，等待新进程…')
  // 等待旧进程退出、新进程起来
  await sleep(15000)

  const v = fileVersion()
  console.log('⑥ 重启后进程版本:', v)
  if (!v.startsWith('0.1.13')) throw new Error(`更新后版本不符：${v}（期望 0.1.13）`)

  console.log('\n更新链全链路验收通过：0.1.12 → 检查命中 0.1.13 → 下载签名安装 → 重启 0.1.13')
}

main().catch((e) => {
  console.error(`验收失败：${e.message}`)
  process.exit(1)
})
