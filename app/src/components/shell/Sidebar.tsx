import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { MODULE_NAV, WORKSPACE_NAV } from '../../content/nav'
import { Icon } from './icons'
import { useNotes } from '../../store/notes'
import { useCollect } from '../../store/collect'
import { useTasks } from '../../store/tasks'

const OPEN_KEY = 'pwork-nav-open'

function loadOpen(): Record<string, boolean> {
  try {
    const v = localStorage.getItem(OPEN_KEY)
    return v ? (JSON.parse(v) as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

/** 侧边栏（PRD §4.1）：工作区横切面 + 四模块分组；占位模块置灰可点开 */
export function Sidebar() {
  const noteCount = useNotes((s) => s.notes.length)
  const sourceCount = useCollect((s) => s.sources.filter((src) => src.active).length)
  const todayDue = useTasks((s) => s.stats.today)
  const [open, setOpen] = useState<Record<string, boolean>>(() => loadOpen())

  const countOf = (from: 'notes' | 'sources' | undefined): number | null => {
    if (from === 'notes') return noteCount || null
    if (from === 'sources') return sourceCount || null
    return null
  }

  useEffect(() => {
    localStorage.setItem(OPEN_KEY, JSON.stringify(open))
  }, [open])

  const toggle = (key: string) =>
    setOpen((o) => ({ ...o, [key]: !(o[key] ?? true) }))

  return (
    <aside className="sidebar" aria-label="主导航">
      <NavLink to="/" className="logo">
        <span className="mark">P</span>
        PWORK <span className="sub">个人工作台</span>
      </NavLink>

      <div className="nav-group">工作区</div>
      {WORKSPACE_NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `nav-item ${item.mark}${isActive ? ' active' : ''}`}
        >
          <span className="ico" aria-hidden><Icon name={item.icon} /></span>
          {item.label}
          {item.to === '/tasks' && todayDue > 0 && <span className="cnt tnum">{todayDue}</span>}
        </NavLink>
      ))}

      <div className="nav-group">模块</div>
      {MODULE_NAV.map((mod) =>
        mod.children ? (
          <div key={mod.key}>
            <button
              type="button"
              className={`nav-item ${mod.mark}`}
              aria-expanded={open[mod.key] ?? true}
              onClick={() => toggle(mod.key)}
            >
              <span className="ico" aria-hidden><Icon name={mod.icon} /></span>
              <b style={{ fontWeight: 600 }}>{mod.label}</b>
            </button>
            {(open[mod.key] ?? true) && (
              <nav className="nav-sub" aria-label={mod.label}>
                {mod.children.map((child) => (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    end
                    className={({ isActive }) => `nav-item ${mod.mark}${isActive ? ' active' : ''}`}
                  >
                    <span className="ico" aria-hidden><Icon name={child.icon} /></span>
                    {child.label}
                    {child.countFrom && countOf(child.countFrom) !== null && (
                      <span className="cnt tnum">{countOf(child.countFrom)}</span>
                    )}
                  </NavLink>
                ))}
              </nav>
            )}
          </div>
        ) : (
          <NavLink
            key={mod.key}
            to={mod.to ?? '/'}
            className={`nav-item ${mod.status === 'planned' ? 'dim' : ''} ${mod.mark}`}
          >
            <span className="ico" aria-hidden><Icon name={mod.icon} /></span>
            {mod.label}
            {mod.status === 'planned' && <span className="plan-tag">规划中</span>}
          </NavLink>
        ),
      )}

      <div className="spacer" />
      <NavLink to="/help" className={({ isActive }) => `nav-item mark-workspace${isActive ? ' active' : ''}`}>
        <span className="ico" aria-hidden><Icon name="helpCircle" /></span>
        帮助
      </NavLink>
      <NavLink to="/settings" className={({ isActive }) => `nav-item mark-workspace${isActive ? ' active' : ''}`}>
        <span className="ico" aria-hidden><Icon name="settings" /></span>
        设置
      </NavLink>
      <div className="foot">
        本地优先 · 数据都在本机
        <br />
        <NavLink to="/design">设计系统样例</NavLink>
      </div>
    </aside>
  )
}
