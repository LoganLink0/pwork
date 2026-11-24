import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 窗口清单三方契约（isle-anchor 两次漏配教训的制度化，2026-11-22）：
 * 新增窗口要同时同步三处清单——tauri.conf.json 声明、capabilities 授权
 * （漏授权=事件监听被静默拒绝，0.1.25 标题栏主题跟随失效的根因）、
 * lib.rs strip_window_chrome（漏列=Win11 系统边框/圆角/投影画在无边框
 * 透明窗上，用户看到「胶囊外框线」）。此前守卫靠人的记忆力，两次事故
 * 后固化为契约：任何一处漏配，CI 即红。
 */

const APP = join(__dirname, '..') // src → app
const CONF = join(APP, 'src-tauri', 'tauri.conf.json')
const CAPS_DIR = join(APP, 'src-tauri', 'capabilities')
const LIB_RS = join(APP, 'src-tauri', 'src', 'lib.rs')

// conf 里 label 省略 = 主窗（Tauri 默认 "main"，带系统装饰的普通窗）
const conf = JSON.parse(readFileSync(CONF, 'utf8')) as {
  app: { windows: Array<{ label?: string; decorations?: boolean }> }
}
const windows = conf.app.windows.map((w) => ({
  label: w.label ?? 'main',
  borderless: w.decorations === false,
}))
const declared = new Set(windows.map((w) => w.label))

// capabilities/*.json 的 windows 数组并集 = 已授权窗口集合
const covered = new Set<string>()
for (const f of readdirSync(CAPS_DIR)) {
  if (!f.endsWith('.json')) continue
  const c = JSON.parse(readFileSync(join(CAPS_DIR, f), 'utf8')) as { windows: string[] }
  for (const w of c.windows) covered.add(w)
}

// lib.rs 里紧跟 strip_window_chrome 的 get_webview_window("X") = 去框清单
const stripTargets = (): Set<string> =>
  new Set(
    [...readFileSync(LIB_RS, 'utf8').matchAll(/get_webview_window\("([^"]+)"\)\s*\{\s*strip_window_chrome/g)].map(
      (m) => m[1],
    ),
  )

describe('窗口清单三方契约（conf ↔ capabilities ↔ strip 清单）', () => {
  it('conf 声明的每个窗口都被至少一个 capabilities 文件授权', () => {
    expect(windows.length).toBeGreaterThanOrEqual(5) // 数量骤降说明窗口声明被误删
    for (const w of windows) {
      expect(
        covered.has(w.label),
        `窗口 ${w.label} 未出现在任何 capabilities 的 windows 清单——漏授权时核心事件监听被静默拒绝（isle-anchor 教训）`,
      ).toBe(true)
    }
  })

  it('conf 里每扇无边框窗（decorations:false）都进了 strip_window_chrome 清单', () => {
    const stripped = stripTargets()
    for (const w of windows) {
      if (!w.borderless) continue // 主窗保留系统装饰，不需要去框
      expect(
        stripped.has(w.label),
        `无边框窗 ${w.label} 未进 strip_window_chrome 清单——漏列时系统边框画在透明窗上（胶囊外框线教训）`,
      ).toBe(true)
    }
  })

  it('strip 清单没有指向已删除窗口的死条目', () => {
    for (const s of stripTargets()) {
      expect(declared.has(s), `strip_window_chrome 清单里的 ${s} 已不在 tauri.conf.json 声明（死条目）`).toBe(true)
    }
  })
})
