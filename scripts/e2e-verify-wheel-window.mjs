/**
 * 无焦点轮盘窗真机验证（系统工具形态核心承诺）：
 * ①热键弹出轮盘不夺焦点（弹出前后 GetForegroundWindow 不变）
 * ②wheel 窗渲染格位（wheel-show → 6 格）
 * ③置顶格位作用于前台窗口（主窗 hwnd 的 WS_EX_TOPMOST 位翻转）
 * ④应用动作（route）唤醒主窗并导航
 * ⑤12 秒无操作自动隐藏
 * 前置：dev 已启动（CDP 9223，双页面目标 main + wheel）。用法：node scripts/e2e-verify-wheel-window.mjs
 */
const DEBUG_PORT = Number(process.env.CDP_PORT ?? 9223)
const BASE = `http://127.0.0.1:${DEBUG_PORT}`
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

// PowerShell 脚本落盘调用（内联经 cmd 转义会被变量拆词）——本地中间产物进 gitignore 的 local/
const FG_PROBE = String.raw`
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class FG {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr h, bool altTab);
}
"@
Add-Type -AssemblyName System.Windows.Forms
$before = [FG]::GetForegroundWindow()
[System.Windows.Forms.SendKeys]::SendWait('^%q')
Start-Sleep -Milliseconds 1500
$after = [FG]::GetForegroundWindow()
Write-Output "$before|$after"
`
const EX_OF = (hwnd) => {
  writeFileSync('local/probe.ps1', `Add-Type @"` + '\n' + `using System;
using System.Runtime.InteropServices;
public class EX1 { [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i); }
"@` + '\n' + `$h = [IntPtr]::new(${hwnd})
Write-Output ([EX1]::GetWindowLong($h, -20))
`, 'utf8')
  return execSync('powershell -NoProfile -ExecutionPolicy Bypass -File local/probe.ps1', { timeout: 30000 }).toString().trim()
}

/** 对任意窗口置顶/取消置顶（清场用；HWND_NOTOPMOST=-2，SWP_NOMOVE|NOSIZE|NOACTIVATE=0x13） */
const SET_TOP = (hwnd, topmost) => {
  writeFileSync('local/probe.ps1', `Add-Type @"` + '\n' + `using System;
using System.Runtime.InteropServices;
public class ST { [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f); }
"@` + '\n' + `$h = [IntPtr]::new(${hwnd})
$a = [IntPtr]::new(${topmost ? -1 : -2})
Write-Output ([ST]::SetWindowPos($h, $a, 0, 0, 0, 0, 0x13))
`, 'utf8')
  return execSync('powershell -NoProfile -ExecutionPolicy Bypass -File local/probe.ps1', { timeout: 30000 }).toString().trim()
}
function psRun(script) {
  writeFileSync('local/probe.ps1', script, 'utf8')
  return execSync('powershell -NoProfile -ExecutionPolicy Bypass -File local/probe.ps1', { timeout: 30000 }).toString().trim()
}

/** 轮盘窗真实可见性（Win32 IsWindowVisible；WebView2 隐藏窗的页面 visibilityState 不变，不可用作判据） */
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
        // 「工具轮盘」的 Unicode 转义——ps1 无 BOM 时中文串面值会被 ANSI 误读
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
  return psRun(WHEEL_VIS)
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function targets() {
  const list = await (await fetch(`${BASE}/json`)).json()
  const pages = list.filter((t) => t.type === 'page')
  const wheel = pages.find((p) => p.url.includes('#/wheel'))
  const main = pages.find((p) => !p.url.includes('#/wheel'))
  return { wheel, main }
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

/** PowerShell 段：前置激活主窗、取前台句柄、SendKeys 触发热键、对比前后台、查主窗 topmost 位 */
function psForegroundAndHotkey() {
  return psRun(FG_PROBE)
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

  // 种子格位：置顶格放第 1 位（便于点击测试），route 格（信息日报）也保留
  const { main: mainT } = await targets()
  const cMain = await connect(mainT.webSocketDebuggerUrl)
  await cMain.evaluate(`localStorage.setItem('pwork-wheel-slots', JSON.stringify([
    { id: 'top', label: '置顶窗口', icon: 'target', kind: 'topmost' },
    { id: 'digest', label: '信息日报', icon: 'fileText', kind: 'route', target: '/input/digest' },
  ]))`)
  cMain.close()

  // ─── ①②③ 热键弹出 + 不夺焦 + 置顶 ───
  const out = psForegroundAndHotkey()
  console.log('① 前台句柄 before|after:', out)
  const [before, after] = out.split('|')
  const wheelHwndSeen = wheelVisible()
  if (wheelHwndSeen !== 'yes') throw new Error('轮盘未弹出（Win32 不可见）')
  if (before !== after) {
    // after 恰为轮盘窗=夺焦实锤；其余前台切换与轮盘无关（用户手动切换）
    throw new Error(`前台变了：${before} → ${after}（若 after 非轮盘窗请人工复核）`)
  }
  console.log(`① 不夺焦通过（前台 ${before} 弹出前后未变，轮盘独立可见）`)

  const t1 = await targets()
  if (!t1.wheel) throw new Error('wheel 页面目标不存在')
  const cw = await connect(t1.wheel.webSocketDebuggerUrl)
  const slotCount = await waitFor('wheel 窗渲染格位', async () => {
    const n = await cw.evaluate(`document.querySelectorAll('.wheel-slot').length`)
    return n === 2 ? n : null
  })
  const vis1 = wheelVisible()
  console.log(`② wheel 窗渲染 ${slotCount} 格，Win32 可见=${vis1}`)
  if (vis1 !== 'yes') throw new Error('wheel 窗不可见')

  // ─── ③ 置顶格位：点它 → 前台窗口（用户正在用的）置顶态翻转 + 轮盘自动隐藏 ───
  const exBefore = Number(EX_OF(before))
  await cw.evaluate(`[...document.querySelectorAll('.wheel-slot')].find((b) => b.textContent.includes('置顶窗口'))?.click()`)
  await waitFor('轮盘点击置顶后隐藏', () => (wheelVisible() === 'no' ? true : null))
  const exAfter = Number(EX_OF(before))
  const wasTop = (exBefore & 0x8) !== 0
  const isTop = (exAfter & 0x8) !== 0
  console.log(`③ 前台窗口(${before}) topmost 位：点击前=${wasTop ? '有' : '无'} → 点击后=${isTop ? '有' : '无'}`)
  if (wasTop === isTop) throw new Error('置顶 toggle 未作用到前台窗口')
  SET_TOP(before, wasTop) // 清场：恢复测试窗口原本的置顶态

  // ─── ④ route 动作唤醒主窗并导航 ───
  psForegroundAndHotkey()
  const cw3 = await connect((await targets()).wheel.webSocketDebuggerUrl)
  await waitFor('第三轮轮盘弹出', async () =>
    (await cw3.evaluate(`document.querySelectorAll('.wheel-slot').length`)) >= 2 ? true : null,
  )
  await cw3.evaluate(`[...document.querySelectorAll('.wheel-slot')].find((b) => b.textContent.includes('信息日报'))?.click()`)
  await sleep(1500)
  const { main: mainT3 } = await targets()
  const cm3 = await connect(mainT3.webSocketDebuggerUrl)
  const hash = await cm3.evaluate(`location.hash`)
  console.log(`④ route 动作后主窗 hash：${hash}`)
  if (!hash.includes('/input/digest')) throw new Error('route 动作未导航')

  // ─── ⑤ 自动隐藏 ───
  psForegroundAndHotkey()
  const cw4 = await connect((await targets()).wheel.webSocketDebuggerUrl)
  console.log('⑤ 弹出后等 13 秒验证自动隐藏…')
  await sleep(13_000)
  const vis4 = wheelVisible()
  if (vis4 !== 'no') throw new Error('12 秒自动隐藏未生效')
  console.log('⑤ 自动隐藏通过')

  // 清场：恢复默认格位
  const cmF = await connect((await targets()).main.webSocketDebuggerUrl)
  await cmF.evaluate(`localStorage.removeItem('pwork-wheel-slots')`)
  cmF.close()
  cw4.close()
  console.log('\n无焦点轮盘窗真机验证全过')
}

main().catch((e) => {
  console.error(`验证失败：${e.message}`)
  process.exit(1)
})
