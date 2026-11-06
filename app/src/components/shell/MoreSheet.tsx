import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { MODULE_NAV, PALETTE_PAGES, WORKSPACE_NAV } from '../../content/nav'
import { Icon } from './icons'

/**
 * 「更多」抽屉（2026-11-06 手机端验收）：底部导航五项到不了全部页面，
 * 点「更多」弹出完整导航面板——等同侧栏的移动版。
 * 数据源双轨：模块 children（侧栏同源，输入/回路）优先；
 * 单链接模块（输出）用命令面板页面全集按 /output 前缀兜底（覆盖报告/调研等全部子页）。
 * 点击任意条目跳转并关闭。窄屏（<768px）专用。
 */
const GROUPS: { key: string; label: string; prefix: string }[] = [
  { key: 'input', label: '输入', prefix: '/input' },
  { key: 'process', label: '处理', prefix: '/process' },
  { key: 'output', label: '输出', prefix: '/output' },
  { key: 'review', label: '回路', prefix: '/review' },
]

export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const renderItem = (to: string, icon: string, label: string) => (
    <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `ms-item${isActive ? ' on' : ''}`} onClick={onClose}>
      <span className="ico" aria-hidden><Icon name={icon} /></span>
      {label}
    </NavLink>
  )

  return (
    <div className="overlay more-sheet-overlay" role="dialog" aria-label="全部导航" onClick={onClose}>
      <div className="more-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ms-head">
          <b>全部页面</b>
          <button type="button" className="an-x" aria-label="关闭导航面板" onClick={onClose}>✕</button>
        </div>
        <div className="ms-body">
          <div className="nav-group">工作区</div>
          {WORKSPACE_NAV.map((it) => renderItem(it.to, it.icon, it.label))}
          {GROUPS.map((g) => {
            const mod = MODULE_NAV.find((m) => m.key === g.key)
            const items = mod?.children?.length
              ? mod.children.map((c) => ({ to: c.to, icon: c.icon, label: c.label }))
              : PALETTE_PAGES.filter((p) => p.to.startsWith(g.prefix)).map((p) => ({ to: p.to, icon: p.icon, label: p.label }))
            if (items.length === 0) return null
            return (
              <div key={g.key}>
                <div className="nav-group">{g.label}</div>
                {items.map((it) => renderItem(it.to, it.icon, it.label))}
              </div>
            )
          })}
          <div className="nav-group">其他</div>
          {renderItem('/help', 'helpCircle', '帮助')}
          {renderItem('/settings', 'settings', '设置')}
        </div>
      </div>
    </div>
  )
}
