import { Link, useLocation } from 'react-router-dom'
import { crumbFor } from '../../content/nav'
import { useUi } from '../../store/ui'
import { Icon } from './icons'

/** 顶栏（PRD §4.1）：面包屑 + 搜索(⌘K) + 速记 + 设置（主题切换在侧栏底部） */
export function Topbar() {
  const { pathname } = useLocation()
  const openPalette = useUi((s) => s.openPalette)
  const openQuick = useUi((s) => s.openQuick)
  const updateReady = useUi((s) => s.updateReady)
  const applyUpdate = useUi((s) => s.applyUpdate)

  const [title, trail, mark] = crumbFor(pathname)

  return (
    <header className="topbar">
      <div className={`crumb ${mark}`}>
        <span className="mod-dot" aria-hidden />
        <b>{title}</b>
        <span>{trail}</span>
      </div>
      <button type="button" className="searchbox" onClick={openPalette} aria-label="打开搜索与命令面板">
        <Icon name="search" /> <span>搜索或跳转…</span> <kbd>Ctrl K</kbd>
      </button>
      {updateReady && (
        <button
          type="button"
          className="mini-btn"
          data-testid="pwa-update"
          title="新版本已就绪，点击应用并刷新页面"
          onClick={applyUpdate}
          style={{ color: 'var(--accent-text)', borderColor: 'var(--accent)' }}
        >
          ⟳ 新版本
        </button>
      )}
      <button type="button" className="quicknote-btn" onClick={openQuick}>
        <Icon name="zap" /> 速记
      </button>
      <Link to="/settings" className="iconbtn" title="设置" aria-label="设置">
        <Icon name="settings" />
      </Link>
    </header>
  )
}
