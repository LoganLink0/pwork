/**
 * 反馈批真机验证：①Shell 通知桥一键配置（profile 写入 + pdone 实发通知）
 * ②轮盘设置预览几何（实格圆分布对称、空格挂底、格内文字居中）
 * 前置：dev 已启动（CDP 9223）。用法：node scripts/e2e-verify-feedback.mjs
 */
const DEBUG_PORT = Number(process.env.CDP_PORT ?? 9223)
const BASE = `http://127.0.0.1:${DEBUG_PORT}`
import { execSync } from 'node:child_process'

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

  // ─── ① 通知桥一键配置 ───
  const install = await ev(`(async () => { try { return await window.__TAURI_INTERNALS__.invoke('shell_bridge_install') } catch (e) { return 'REJECT: ' + String(e).slice(0, 150) } })()`)
  console.log('① 一键配置返回:', install)
  if (install.startsWith('REJECT:')) throw new Error('配置命令失败')
  // pdone 实发一条通知（经 profile 函数全链路）
  await sleep(500)
  const ps = await new Promise((resolve) => {
    try {
      execSync(`powershell -Command "pdone 反馈批真机验证"`, { timeout: 30000, stdio: 'ignore' })
      resolve('pdone 执行成功')
    } catch (e) {
      resolve('pdone 执行失败: ' + String(e).slice(0, 100))
    }
  })
  console.log('① pdone 实发:', ps)
  if (!ps.includes('成功')) throw new Error('pdone 不可用')
  // 幂等：再配置一次应返回已配置
  const again = await ev(`(async () => await window.__TAURI_INTERNALS__.invoke('shell_bridge_install'))()`)
  if (!again.includes('已经配置过')) throw new Error(`幂等失败：${again}`)
  console.log('① 幂等重配置:', again.slice(0, 30) + '…')

  // ─── ② 轮盘设置预览几何 ───
  await ev(`location.hash = '#/settings?tab=wheel'`)
  await sleep(1500)
  const geo = await ev(`(() => {
    const ring = document.querySelector('.wheel-edit-ring')
    if (!ring) return JSON.stringify({ err: 'ring 不存在' })
    const rr = ring.getBoundingClientRect()
    const cx = rr.left + rr.width / 2
    const cy = rr.top + rr.height / 2
    const slots = [...ring.querySelectorAll('.wheel-slot:not(.wheel-slot-new)')].map((el) => {
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2 - cx, y: r.top + r.height / 2 - cy, w: r.width }
    })
    // 角度间隔均匀性：相邻角差应一致（允许 ±2°）
    const angles = slots.map((s) => (Math.atan2(s.x, -s.y) * 180) / Math.PI).sort((a, b) => a - b)
    const steps = angles.map((a, i) => (i === 0 ? 360 - angles[angles.length - 1] + a : a - angles[i - 1]))
    const stepSpread = Math.max(...steps) - Math.min(...steps)
    const radii = slots.map((s) => Math.hypot(s.x, s.y))
    const radiusSpread = Math.max(...radii) - Math.min(...radii)
    // 格内文字居中：span 中心与格中心偏差
    const centers = [...ring.querySelectorAll('.wheel-slot:not(.wheel-slot-new)')].map((el) => {
      const er = el.getBoundingClientRect()
      const sp = el.querySelector('span')
      if (!sp) return { dx: 0, dy: 0 }
      const sr = sp.getBoundingClientRect()
      return { dx: Math.abs(sr.left + sr.width / 2 - (er.left + er.width / 2)), dy: Math.abs(sr.top + sr.height / 2 - (er.top + er.height / 2)) }
    })
    const maxDx = Math.max(...centers.map((c) => c.dx))
    const newSlot = ring.querySelector('.wheel-slot-new')
    const nr = newSlot ? newSlot.getBoundingClientRect() : null
    return JSON.stringify({
      slots: slots.length,
      stepSpread: stepSpread.toFixed(1),
      radiusSpread: radiusSpread.toFixed(1),
      maxTextOffsetX: maxDx.toFixed(1),
      emptyAtBottom: nr ? nr.top > cy : null,
    })
  })()`)
  console.log('② 预览几何:', geo)
  const g = JSON.parse(geo)
  if (g.err) throw new Error(g.err)
  if (Number(g.stepSpread) > 2) throw new Error(`格位角度不均匀：极差 ${g.stepSpread}°`)
  if (Number(g.radiusSpread) > 3) throw new Error(`格位半径不一致：极差 ${g.radiusSpread}px`)
  if (Number(g.maxTextOffsetX) > 2) throw new Error(`格内文字水平偏移 ${g.maxTextOffsetX}px`)
  if (g.emptyAtBottom !== true) throw new Error('空格不在环底部')

  ws.close()
  console.log('\n反馈批真机验证全过')
}

main().catch((e) => {
  console.error(`验证失败：${e.message}`)
  process.exit(1)
})
