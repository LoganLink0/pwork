/**
 * 主题偏好（light / dark / auto），延续 FUPAN 的 data-theme 机制。
 * 偏好存数据目录 prefs.json（配置文件化 2026-11-16，治 origin 隔离与 leveldb 强杀丢失）；
 * localStorage 双写为兼容期回落（读优先 prefs，未迁移/浏览器版走旧键）。
 * 渲染前应用避免闪屏（见 main.tsx）。
 */
import { invoke } from '@tauri-apps/api/core'
import { readPref, writePref } from './prefsFile'
import { isDesktopApp } from './platform'

export type ThemePref = 'auto' | 'light' | 'dark'

const KEY = 'pwork-theme'

/** 三值之外一律回落 auto（损坏防御） */
function parseTheme(v: unknown): ThemePref {
  return v === 'light' || v === 'dark' || v === 'auto' ? v : 'auto'
}

export function loadTheme(): ThemePref {
  return parseTheme(readPref<string | undefined>(KEY, undefined) ?? localStorage.getItem(KEY))
}

export function saveTheme(pref: ThemePref): void {
  localStorage.setItem(KEY, pref)
  writePref(KEY, pref)
}

/** 窗口标题栏主题跟随（桌面版）：网页 data-theme 管不到原生标题栏，
 *  经 Rust set_theme 同步亮/暗（auto=跟随系统）。浏览器版无窗口可设。 */
function syncWindowTheme(pref: ThemePref): void {
  if (!isDesktopApp()) return
  void invoke('window_set_theme', { theme: pref === 'auto' ? null : pref }).catch(() => {})
}

/**
 * 应用并持久化主题（对齐 FUPAN 语义：applyTheme = 写偏好 + 挂 data-theme）。
 * auto 时移除 data-theme，交给 CSS 的 prefers-color-scheme 分支。
 */
export function applyTheme(pref: ThemePref): void {
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    /* 存储不可用时仅当次生效 */
  }
  writePref(KEY, pref)
  if (pref === 'auto') {
    delete document.documentElement.dataset.theme
  } else {
    document.documentElement.dataset.theme = pref
  }
  syncWindowTheme(pref)
}

/**
 * 伴生窗（胶囊岛/问小 P 独立窗）主题跟随：读主窗偏好挂 data-theme（auto 时不挂，
 * 交给 CSS prefers-color-scheme 分支）——与主窗 applyTheme 同一套令牌机制。
 * 主窗切主题时伴生窗经 pwork-prefs-changed 事件实时跟随（调用方挂监听触发本函数）。
 */
export function syncThemeFromStore(): void {
  const pref = loadTheme()
  if (pref === 'auto') {
    delete document.documentElement.dataset.theme
  } else {
    document.documentElement.dataset.theme = pref
  }
  syncWindowTheme(pref)
}
