import { Link, useLocation } from 'react-router-dom'
import { crumbFor } from '../../content/nav'
import { useUi } from '../../store/ui'
import type { ThemePref } from '../../engine/appearance'

const THEME_ORDER: ThemePref[] = ['auto', 'light', 'dark']
const THEME_ICON: Record<ThemePref, string> = { auto: '◐', light: '☀', dark: '☾' }
const THEME_TITLE: Record<ThemePref, string> = { auto: '主题：跟随系统', light: '主题：明亮', dark: '主题：暗色' }

/** 顶栏（PRD §4.1）：面包屑 + 搜索(⌘K) + 速记 + 主题 + 设置 */
export function Topbar() {
  const { pathname } = useLocation()
  const openPalette = useUi((s) => s.openPalette)
  const openQuick = useUi((s) => s.openQuick)
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)

  const [title, trail, mark] = crumbFor(pathname)
  const nextTheme = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length] ?? 'auto'

  return (
    <header className="topbar">
      <div className={`crumb ${mark}`}>
        <span className="mod-dot" aria-hidden />
        <b>{title}</b>
        <span>{trail}</span>
      </div>
      <button type="button" className="searchbox" onClick={openPalette} aria-label="打开搜索与命令面板">
        🔍 <span>搜索或跳转…</span> <kbd>Ctrl K</kbd>
      </button>
      <button type="button" className="quicknote-btn" onClick={openQuick}>
        ⚡ 速记
      </button>
      <button
        type="button"
        className="iconbtn"
        title={THEME_TITLE[theme]}
        aria-label={THEME_TITLE[theme]}
        onClick={() => setTheme(nextTheme)}
      >
        {THEME_ICON[theme]}
      </button>
      <Link to="/settings" className="iconbtn" title="设置" aria-label="设置">
        ⚙
      </Link>
    </header>
  )
}
