/**
 * 键位中心（0.4-3，2026-10-29；系统工具台 2026-10-31 增第 6 键位）：六个可自定义键位的
 * 配置、归一化、冲突校验与录制。键位串统一归一化形态：修饰键固定顺序 ctrl+shift+alt，
 * 主键小写字母/数字或原样符号，如 "n" / "?" / "ctrl+k" / "ctrl+alt+q"。命令面板保留 "/"
 * 作为固定别名（不可改，延续习惯）；桌面全局键（轮盘/置顶）的重注册走 Rust 命令
 * （见 lib.rs register_global_hotkeys）。
 */
import type { KeybindAction } from '../types/keybinds'

export type { KeybindAction }

import { isMac } from './platform'

export interface Keybinds {
  quickNote: string
  palette: string
  help: string
  settings: string
  wheel: string
  topmost: string
}

export const KEYBIND_ACTIONS: { key: KeybindAction; label: string; desc: string }[] = [
  { key: 'quickNote', label: '速记浮层', desc: '任何地方唤起速记输入' },
  { key: 'palette', label: '命令面板', desc: '跨模块检索与跳转（/ 永远可用）' },
  { key: 'help', label: '帮助页', desc: '打开帮助' },
  { key: 'settings', label: '设置页', desc: '打开设置' },
  { key: 'wheel', label: '工具轮盘', desc: '桌面版全局呼出（其他应用在前台也生效）' },
  { key: 'topmost', label: '置顶窗口', desc: '切换当前窗口置顶（Windows，任何应用在前台都生效）' },
]

/** 平台默认键位：轮盘全局键 Windows 用 Ctrl，macOS 用 ⌘（键位中心 0.4-3 的 macOS 补全）；
 *  置顶（系统工具台）默认 Ctrl+Alt+T（Windows；macOS 对应实现在后续批次） */
export function defaultKeybinds(): Keybinds {
  return {
    quickNote: 'n',
    palette: 'ctrl+k',
    help: '?',
    settings: 'ctrl+,',
    wheel: isMac() ? 'meta+alt+q' : 'ctrl+alt+q',
    topmost: isMac() ? 'meta+ctrl+t' : 'ctrl+alt+t',
  }
}

/** 轮盘默认键的展示文案（界面静态文案引用——引导页/帮助页不用再各写一份平台判断） */
export const WHEEL_LABEL_DISPLAY = displayCombo(defaultKeybinds().wheel)

const KEY = 'pwork-keybinds'

export function loadKeybinds(): Keybinds {
  const defaults = defaultKeybinds()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaults
    const p = JSON.parse(raw) as Partial<Keybinds>
    const out = { ...defaults }
    for (const k of Object.keys(defaults) as KeybindAction[]) {
      const v = p[k]
      if (typeof v === 'string' && normalizeCombo(v)) out[k] = normalizeCombo(v)!
    }
    return out
  } catch {
    return defaults
  }
}

export function saveKeybinds(cfg: Keybinds): void {
  localStorage.setItem(KEY, JSON.stringify(cfg))
}

/** 归一化：修饰键定序 ctrl+shift+alt+meta + 小写主键；空串/纯修饰键/超长返回 null（无效） */
export function normalizeCombo(input: string): string | null {
  const parts = input
    .toLowerCase()
    .split('+')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0 || parts.length > 4) return null
  const mods = { ctrl: false, shift: false, alt: false, meta: false }
  let main = ''
  for (const p of parts) {
    if (p === 'ctrl' || p === 'control') mods.ctrl = true
    else if (p === 'shift') mods.shift = true
    else if (p === 'alt' || p === 'option') mods.alt = true
    else if (p === 'meta' || p === 'cmd' || p === 'command') mods.meta = true
    else if (main === '') main = p
    else return null // 两个主键
  }
  if (main === '' || main === 'escape' || main === 'tab') return null // 保留键不分配
  // 定序：ctrl+shift+meta+alt——⌘ 在 Option 前（macOS 惯例读法），录制值与默认值共用同一序
  const prefix = `${mods.ctrl ? 'ctrl+' : ''}${mods.shift ? 'shift+' : ''}${mods.meta ? 'meta+' : ''}${mods.alt ? 'alt+' : ''}`
  return `${prefix}${main}`
}

/** 从键盘事件录制键位串；纯修饰键按下返回 null（等主键）。参数收窄到实际读取的字段，React 合成事件同样可用 */
export function comboFromEvent(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>): string | null {
  const k = e.key
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return null
  const main = k.toLowerCase()
  let shift = e.shiftKey
  if (k.length === 1 && !/[a-z0-9]/.test(main)) shift = false // 符号键的 shift 是产生符号的一部分（? 就是 Shift+/），不算修饰键
  return normalizeCombo(`${e.ctrlKey ? 'ctrl+' : ''}${shift ? 'shift+' : ''}${e.altKey ? 'alt+' : ''}${e.metaKey ? 'meta+' : ''}${main}`)
}

/** 冲突检测：combo 与其他动作的键位相同则返回那个动作（无冲突返回 null） */
export function findConflict(cfg: Keybinds, action: KeybindAction, combo: string): KeybindAction | null {
  for (const { key } of KEYBIND_ACTIONS) {
    if (key === action) continue
    if (cfg[key] === combo) return key
  }
  return null
}

/** 显示格式："ctrl+alt+q" → "Ctrl+Alt+Q"；meta → ⌘（macOS 语义）；单字符原样（n → N、? → ?） */
export function displayCombo(combo: string): string {
  return combo
    .split('+')
    .map((p, i, arr) => {
      if (p === 'meta') return '⌘'
      const cased = i === arr.length - 1 && p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)
      return cased
    })
    .join('+')
}

/** 轮盘键允许的范围（Rust global-shortcut 侧只稳定支持字母/数字/F 键做主键）；meta/ctrl 均为合法修饰。顺序与 normalizeCombo 一致 */
export function wheelComboAllowed(combo: string): boolean {
  const m = /^(ctrl\+)?(shift\+)?(meta\+)?(alt\+)?([a-z0-9]|f[1-9]|f1[0-2])$/.test(combo)
  return m && combo.includes('+') // 全局键必须是组合键——单字母会劫持一切输入
}
