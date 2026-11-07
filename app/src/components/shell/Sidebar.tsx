import { useEffect, useState, useSyncExternalStore } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { MODULE_NAV, WORKSPACE_NAV } from '../../content/nav'
import { Icon } from './icons'
import { useNotes } from '../../store/notes'
import { useCollect } from '../../store/collect'
import { useTasks } from '../../store/tasks'
import { useUi } from '../../store/ui'
import { loadRecent, recordRecent, subscribeRecent } from '../../engine/recentOpen'
import type { ThemePref } from '../../engine/appearance'

const OPEN_KEY = 'pwork-nav-open'

/** 主题三态（分段控件展示顺序：暗色 / 跟随系统 / 明亮） */
const THEMES: { pref: ThemePref; icon: string; label: string }[] = [
  { pref: 'dark', icon: 'moon', label: '暗色' },
  { pref: 'auto', icon: 'appearance', label: '跟随系统' },
  { pref: 'light', icon: 'sun', label: '明亮' },
]

/** 公告轮播（WorkBuddy 学习批）：内测期的版本亮点 / 引导 / 交流入口常驻出口，
 *  左下角固定不抢注意力；关闭按钮按版本记忆（发新版自动恢复显示） */
const ANNOUNCES = [
  {
    title: '0.1.16 更新',
    desc: '通知中心、手机端全部页面直达、帮助页重排',
    to: '/help',
    internal: true,
  },
  {
    title: '新手引导',
    desc: '五步认识工作台，随时可以重看',
    to: '/welcome',
    internal: true,
  },
  {
    title: '交流与反馈',
    desc: '想法、提问、展示都在 Discussions',
    to: 'https://github.com/LoganLink0/pwork/discussions',
    internal: false,
  },
]

function loadOpen(): Record<string, boolean> {
  try {
    const v = localStorage.getItem(OPEN_KEY)
    return v ? (JSON.parse(v) as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

/** 公告轮播卡：8 秒轮换 + 小点切换；关闭记到版本级 localStorage */
function AnnounceCard() {
  const [idx, setIdx] = useState(0)
  const [off, setOff] = useState(() => {
    try {
      return localStorage.getItem(`pwork-announce-off-${__APP_VERSION__}`) === '1'
    } catch {
      return false
    }
  })
  const a = ANNOUNCES[idx]

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % ANNOUNCES.length), 8000)
    return () => clearInterval(t)
  }, [])

  if (off) return null
  return (
    <div className="announce-card" role="note" aria-label="公告">
      <div className="an-head">
        <b>{a.title}</b>
        <button
          type="button"
          className="an-x"
          aria-label="关闭公告"
          onClick={() => {
            try {
              localStorage.setItem(`pwork-announce-off-${__APP_VERSION__}`, '1')
            } catch {
              // 静默
            }
            setOff(true)
          }}
        >
          ✕
        </button>
      </div>
      <div className="an-desc">{a.desc}</div>
      <div className="an-foot">
        {ANNOUNCES.map((_, i) => (
          <button
            key={i}
            type="button"
            className={`an-dot${i === idx ? ' on' : ''}`}
            aria-label={`公告 ${i + 1}`}
            onClick={() => setIdx(i)}
          />
        ))}
        {a.internal ? (
          <NavLink to={a.to} className="an-link">
            前往 →
          </NavLink>
        ) : (
          <a href={a.to} target="_blank" rel="noreferrer noopener" className="an-link">
            前往 →
          </a>
        )}
      </div>
    </div>
  )
}

/** 侧边栏（PRD §4.1）：工作区横切面 + 四模块分组；占位模块置灰可点开 */
export function Sidebar() {
  const noteCount = useNotes((s) => s.notes.length)
  const sourceCount = useCollect((s) => s.sources.filter((src) => src.active).length)
  const todayDue = useTasks((s) => s.stats.today)
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  const [open, setOpen] = useState<Record<string, boolean>>(() => loadOpen())
  const location = useLocation()
  const recent = useSyncExternalStore(subscribeRecent, loadRecent, () => [])

  const countOf = (from: 'notes' | 'sources' | undefined): number | null => {
    if (from === 'notes') return noteCount || null
    if (from === 'sources') return sourceCount || null
    return null
  }

  useEffect(() => {
    localStorage.setItem(OPEN_KEY, JSON.stringify(open))
  }, [open])

  // 路由变化：记录「最近打开」（列表经 useSyncExternalStore 订阅自动刷新）
  useEffect(() => {
    recordRecent(location.pathname)
  }, [location.pathname])

  const toggle = (key: string) =>
    setOpen((o) => ({ ...o, [key]: !(o[key] ?? true) }))

  return (
    <aside className="sidebar" aria-label="主导航">
      <NavLink to="/" className="logo">
        <img className="mark" src="/favicon.svg" alt="" width={22} height={22} />
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
                <span className="fold" aria-hidden><Icon name="chevronDown" size={14} /></span>
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
            className={`nav-item ${mod.mark}`}
          >
            <span className="ico" aria-hidden><Icon name={mod.icon} /></span>
            {mod.label}
          </NavLink>
        ),
      )}

      {(() => {
        const visible = recent.filter((it) => it.path !== location.pathname).slice(0, 3)
        if (visible.length === 0) return null
        return (
          <>
            <div className="nav-group">最近打开</div>
            {visible.map((it) => (
              <NavLink key={it.path} to={it.path} className="nav-item nav-recent">
                <span className="ico" aria-hidden><Icon name="clock" size={14} /></span>
                {it.label}
              </NavLink>
            ))}
          </>
        )
      })()}

      <div className="spacer" />
      <NavLink to="/help" className={({ isActive }) => `nav-item mark-workspace${isActive ? ' active' : ''}`}>
        <span className="ico" aria-hidden><Icon name="helpCircle" /></span>
        帮助
      </NavLink>
      <NavLink to="/settings" className={({ isActive }) => `nav-item mark-workspace${isActive ? ' active' : ''}`}>
        <span className="ico" aria-hidden><Icon name="settings" /></span>
        设置
      </NavLink>
      <div className="theme-seg" role="group" aria-label="视觉主题">
        {THEMES.map((t) => (
          <button
            key={t.pref}
            type="button"
            className={theme === t.pref ? 'on' : ''}
            aria-pressed={theme === t.pref}
            title={`主题：${t.label}`}
            aria-label={`主题：${t.label}`}
            onClick={() => setTheme(t.pref)}
          >
            <Icon name={t.icon} size={15} />
          </button>
        ))}
      </div>
      <div className="foot">
        <AnnounceCard />
        <div className="foot-row">
          <span>v{__APP_VERSION__} · 内测中</span>
          <a
            className="gh-foot"
            href="https://github.com/LoganLink0/pwork"
            target="_blank"
            rel="noreferrer noopener"
            title="GitHub 开源仓库"
            aria-label="GitHub 开源仓库"
          >
            <Icon name="github" size={14} />
          </a>
        </div>
      </div>
    </aside>
  )
}
