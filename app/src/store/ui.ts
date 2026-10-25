import { create } from 'zustand'
import { applyTheme, loadTheme, saveTheme, type ThemePref } from '../engine/appearance'

/** 壳级 UI 状态：命令面板 / 速记浮层开闭 + 主题偏好（顶栏与设置页共享） */
interface UiState {
  paletteOpen: boolean
  quickOpen: boolean
  theme: ThemePref
  openPalette: () => void
  closePalette: () => void
  openQuick: () => void
  closeQuick: () => void
  setTheme: (pref: ThemePref) => void
  /** PWA 新版本就绪（prompt 模式）：Topbar 出更新按钮，点击应用并刷新 */
  updateReady: boolean
  applyUpdate: () => void
  setUpdateReady: (ready: boolean, apply?: () => void) => void
}

export const useUi = create<UiState>((set) => ({
  paletteOpen: false,
  quickOpen: false,
  theme: loadTheme(),
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  openQuick: () => set({ quickOpen: true }),
  closeQuick: () => set({ quickOpen: false }),
  setTheme: (pref) => {
    applyTheme(pref)
    saveTheme(pref)
    set({ theme: pref })
  },
  updateReady: false,
  applyUpdate: () => set((s) => { s.applyUpdate?.(); return { updateReady: false } }),
  setUpdateReady: (ready, apply) => set({ updateReady: ready, applyUpdate: ready ? (apply ?? (() => location.reload())) : undefined }),
}))
