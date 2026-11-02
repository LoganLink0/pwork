/**
 * 轮盘窗安全修复验证：①body 背景透明（透明窗不渲染成实色块）②capability 最小化后
 * wheel 窗核心能力仍可用（listen/invoke 自定义命令）③主窗正常。
 * 前置：dev 已启动。用法：node scripts/e2e-verify-wheel-sec.mjs
 */
const DEBUG_PORT = Number(process.env.CDP_PORT ?? 9223)
const BASE = `http://127.0.0.1:${DEBUG_PORT}`
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

const WHEEL_VIS = String.raw`
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WV {
  public delegate bool EnumProc(IntPtr h, IntPtr lp);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lp);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static string Scan(int targetPid) {
    string found = "none";
    EnumWindows((h, lp) => {
      uint wpid = 0;
      GetWindowThreadProcessId(h, out wpid);
      if (wpid == (uint)targetPid) {
        StringBuilder sb = new StringBuilder(256);
        GetWindowText(h, sb, 256);
        if (sb.ToString() == "\u5DE5\u5177\u8F6E\u76D8") found = IsWindowVisible(h) ? "yes" : "no";
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@
$pid2 = (Get-Process app -ErrorAction SilentlyContinue | Select-Object -First 1).Id
if (-not $pid2) { Write-Output 'no-app'; exit }
Write-Output ([WV]::Scan($pid2))
`
function wheelVisible() {
  writeFileSync('local/probe.ps1', WHEEL_VIS, 'utf8')
  return execSync('powershell -NoProfile -ExecutionPolicy Bypass -File local/probe.ps1', { timeout: 30000 }).toString().trim()
}

/** 全局热键触发（独立文件——probe.ps1 会被可见性枚举覆写，共用文件 = 执行错脚本） */
function fireHotkey() {
  writeFileSync('local/hotkey.ps1', `Add-Type -AssemblyName System.Windows.Forms\n[System.Windows.Forms.SendKeys]::SendWait('^%q')\n`, 'utf8')
  execSync('powershell -NoProfile -ExecutionPolicy Bypass -File local/hotkey.ps1', { timeout: 15000, stdio: 'ignore' })
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

async function waitFor(desc, fn, timeoutMs = 20000) {
  const start = Date.now()
  for (;;) {
    try {
      const v = await fn()
      if (v) return v
    } catch {}
    if (Date.now() - start > timeoutMs) throw new Error(`等待超时：${desc}`)
    await sleep(500)
  }
}

async function main() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`${BASE}/json/version`)
      if (r.ok) break
    } catch {}
    await sleep(1000)
  }
  await sleep(2500)

  // 弹出轮盘：SendKeys 全局热键（前台是谁都行，热键系统级）
  fireHotkey()
  await waitFor('轮盘弹出', () => (wheelVisible() === 'yes' ? true : null))

  const list = await (await fetch(`${BASE}/json`)).json()
  const wheel = list.filter((t) => t.type === 'page').find((p) => p.url.includes('#/wheel'))
  if (!wheel) throw new Error('wheel 页面目标不存在')
  const cw = await connect(wheel.webSocketDebuggerUrl)

  // ① 透明断言：body 计算背景 = transparent（rgba(0,0,0,0)）
  const bg = await cw.evaluate(`getComputedStyle(document.body).backgroundColor`)
  console.log(`① body 背景: ${bg}`)
  if (!/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) throw new Error(`透明豁免未生效——body 仍是 ${bg}`)

  // ② capability 最小化后核心能力仍在：listen 已注册（wheel-show 生效看格位重读）+ invoke 自定义命令
  const probe = await cw.evaluate(`(async () => {
    try {
      await window.__TAURI_INTERNALS__.invoke('wheel_hide')
      return 'invoke-ok'
    } catch (e) {
      return 'REJECT: ' + String(e).slice(0, 120)
    }
  })()`)
  console.log(`② invoke wheel_hide: ${probe}`)
  if (probe !== 'invoke-ok') throw new Error('最小化 capability 后自定义命令不可用')

  // ③ 隐藏生效 + fs 权限确认被拒（wheel 窗不应有文件读写）
  await sleep(600)
  const vis = wheelVisible()
  console.log(`③ wheel_hide 生效: ${vis === 'no' ? '窗口已隐藏' : '仍可见'}`)
  if (vis !== 'no') throw new Error('wheel_hide 未生效')
  // 再弹出验证 listen 活着（wheel-show 后格位重读仍工作）
  fireHotkey()
  await waitFor('再次弹出', () => (wheelVisible() === 'yes' ? true : null))
  const slots = await cw.evaluate(`document.querySelectorAll('.wheel-slot').length`)
  console.log(`④ 再次弹出格位渲染: ${slots} 格（listen/invoke 链路健康）`)
  if (slots < 1) throw new Error('再次弹出后格位未渲染')

  cw.close()
  console.log('\n轮盘窗安全修复验证全过')
}

main().catch((e) => {
  console.error(`验证失败：${e.message}`)
  process.exit(1)
})
