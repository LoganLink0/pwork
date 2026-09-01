/**
 * 主题偏好（light / dark / auto），延续 FUPAN 的 data-theme 机制。
 * 偏好存 localStorage；渲染前应用避免闪屏（见 main.tsx）。
 */
export type ThemePref = 'auto' | 'light' | 'dark'

const KEY = 'pwork-theme'

export function loadTheme(): ThemePref {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' || v === 'auto' ? v : 'auto'
}

export function saveTheme(pref: ThemePref): void {
  localStorage.setItem(KEY, pref)
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
  if (pref === 'auto') {
    delete document.documentElement.dataset.theme
  } else {
    document.documentElement.dataset.theme = pref
  }
}
