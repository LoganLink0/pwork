import { create } from 'zustand'
import { applyTheme, loadTheme, saveTheme, type ThemePref } from '../engine/appearance'
import { applyAndSavePrefs, loadPrefs, type Prefs } from '../engine/prefs'

/** 壳级 UI 状态：命令面板 / 速记浮层开闭 + 主题偏好 + 显示设置（顶栏与设置页共享）。
 *  轮盘不在此管理：它是独立无焦点小窗（label=wheel），开关由 Rust 热键直控 */
interface UiState {
  paletteOpen: boolean
  /** 面板打开来源：littlep（问小 P 圆钮）时输入框占位切换为提问式（2026-11-10 问小 P 衍生优化） */
  paletteVia: 'key' | 'littlep'
  quickOpen: boolean
  theme: ThemePref
  prefs: Prefs
  openPalette: (via?: 'key' | 'littlep') => void
  closePalette: () => void
  openQuick: () => void
  closeQuick: () => void
  setTheme: (pref: ThemePref) => void
  /** 显示设置改动：应用 CSS 变量 + 持久化 + 同步状态 */
  setPrefs: (patch: Partial<Prefs>) => void
  /** PWA 新版本就绪（prompt 模式）：Topbar 出更新按钮，点击应用并刷新 */
  updateReady: boolean
  applyUpdate: () => void
  setUpdateReady: (ready: boolean, apply?: () => void) => void
}

export const useUi = create<UiState>((set) => ({
  paletteOpen: false,
  paletteVia: 'key',
  quickOpen: false,
  theme: loadTheme(),
  prefs: loadPrefs(),
  openPalette: (via = 'key') => set({ paletteOpen: true, paletteVia: via }),
  closePalette: () => set({ paletteOpen: false }),
  openQuick: () => set({ quickOpen: true }),
  closeQuick: () => set({ quickOpen: false }),
  setTheme: (pref) => {
    applyTheme(pref)
    saveTheme(pref)
    set({ theme: pref })
  },
  setPrefs: (patch) => {
    const next = applyAndSavePrefs(patch)
    set({ prefs: next })
  },
  updateReady: false,
  applyUpdate: () => set((s) => { s.applyUpdate?.(); return { updateReady: false } }),
  setUpdateReady: (ready, apply) => set({ updateReady: ready, applyUpdate: ready ? (apply ?? (() => location.reload())) : undefined }),
}))
