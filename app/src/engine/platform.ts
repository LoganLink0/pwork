/**
 * 运行环境探测（2026-10 桌面壳）：区分浏览器版 / 桌面版（Tauri WebView）。
 * 桌面版能力差异目前两处：自动备份写磁盘、网关随应用启动。
 * 判据用 Tauri 注入的全局标记，不猜 UA。
 */
export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** macOS（键位语义 ⌘ 与 Windows Ctrl 分家的根源）；WebView 与浏览器统一用 UA 判定 */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac/i.test(navigator.platform ?? '') || /Macintosh/i.test(navigator.userAgent ?? '')
}
