import { useMemo, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Icon } from '../components/shell/icons'
import { useNotes } from '../store/notes'
import { localDateOf, relTime, todayLocal } from '../engine/datetime'

/** 日期分组头：今天/昨天用自然语言，更早用「10月24日 · 周六」 */
function dayLabel(dateKey: string): string {
  const today = todayLocal()
  const yesterday = todayLocal(new Date(Date.now() - 86_400_000))
  if (dateKey === today) return '今天'
  if (dateKey === yesterday) return '昨天'
  const d = new Date(dateKey + 'T12:00:00')
  const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日 · 周${wd}`
}

/** 速记列表页（PRD §4.3）：搜索 + 标签筛选 + 按日分组的时间线 + 回收站；右栏 Outlet 渲染编辑器 */
export function Notes() {
  const notes = useNotes((s) => s.notes)
  const trash = useNotes((s) => s.trash)
  const restore = useNotes((s) => s.restore)
  const purge = useNotes((s) => s.purge)
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [showTrash, setShowTrash] = useState(false)
  const { pathname } = useLocation()
  const activeId = pathname.split('/')[3] ?? ''

  const allTags = useMemo(
    () => Array.from(new Set(notes.flatMap((n) => n.tags))).sort((a, b) => a.localeCompare(b)),
    [notes],
  )

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (showTrash ? trash : notes).filter((n) => {
      if (tag && !n.tags.includes(tag)) return false
      if (!q) return true
      return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)
    })
  }, [showTrash, trash, notes, query, tag])

  /** 活动视图按自然日分组（memos 式时间线）；回收站保持删除时间平铺 */
  const groups = useMemo(() => {
    if (showTrash) return []
    const byDay = new Map<string, typeof list>()
    for (const n of list) {
      const key = localDateOf(n.updatedAt)
      const arr = byDay.get(key) ?? []
      arr.push(n)
      byDay.set(key, arr)
    }
    return [...byDay.entries()]
  }, [list, showTrash])

  return (
    <section>
      <div className="page-head">
        <h1>速记</h1>
        <span className="sub">
          {notes.length} 条 · 捕获 ≤3 次交互（N 键随时唤起）
        </span>
        <div className="right">
          <Link to="/input/notes/new" className="btn-primary">＋ 新速记</Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input"
          style={{ maxWidth: 240 }}
          placeholder="搜索标题或正文…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="搜索速记"
        />
        {allTags.map((t) => (
          <button
            key={t}
            type="button"
            className={`chip${tag === t ? ' on' : ''}`}
            onClick={() => setTag(tag === t ? null : t)}
          >
            #{t}
          </button>
        ))}
        <button
          type="button"
          className={`chip${showTrash ? ' on' : ''}`}
          style={{ marginLeft: 'auto' }}
          onClick={() => setShowTrash((v) => !v)}
        >
          回收站（{trash.length}）
        </button>
      </div>

      <div className="notes-wrap">
        <div>
          <div className="note-list" data-testid="note-list">
            {list.length === 0 && (
              <div style={{ padding: 'var(--sp-5)', textAlign: 'center', color: 'var(--ink-faint)', fontSize: 'var(--fs-sm)' }}>
                {showTrash ? '回收站是空的' : query || tag ? '没有匹配的速记' : '第一条速记会在这里。按 N 随时开始。'}
              </div>
            )}
            {showTrash ? (
              list.map((n) => (
                <div key={n.id} style={{ position: 'relative' }}>
                  <Link
                    to={`/input/notes/${n.id}`}
                    className={`note-item${n.id === activeId && !showTrash ? ' on' : ''}`}
                  >
                    <div className="n-time">{relTime(n.updatedAt)}{n.source === 'quick' ? ' · 速记浮层' : ''}</div>
                    <div className="n-title">{n.title || '（无标题）'}</div>
                    <div className="n-meta">
                      {n.tags.length ? n.tags.map((t) => `#${t}`).join(' ') : '无标签'}
                    </div>
                  </Link>
                  <div style={{ position: 'absolute', right: 'var(--sp-2)', bottom: 'var(--sp-2)', display: 'flex', gap: 'var(--sp-1)' }}>
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ padding: '2px 10px' }}
                      onClick={() => void restore(n.id)}
                    >
                      恢复
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ padding: '2px 10px', color: 'var(--danger)' }}
                      title="从库里彻底删除，不可恢复"
                      onClick={() => {
                        if (window.confirm(`彻底删除「${n.title || n.id}」？此操作不可恢复。`)) void purge(n.id)
                      }}
                    >
                      彻底删除
                    </button>
                  </div>
                </div>
              ))
            ) : (
              groups.map(([day, items]) => (
                <div key={day} className="note-day">
                  <div className="note-day-head">
                    {dayLabel(day)}
                    <span className="note-day-cnt tnum">{items.length} 条</span>
                  </div>
                  {items.map((n) => (
                    <Link
                      key={n.id}
                      to={`/input/notes/${n.id}`}
                      className={`note-item${n.id === activeId ? ' on' : ''}`}
                    >
                      <div className="n-time">{relTime(n.updatedAt)}{n.source === 'quick' ? ' · 速记浮层' : ''}</div>
                      <div className="n-title">{n.title || '（无标题）'}</div>
                      <div className="n-meta">
                        {n.tags.length ? n.tags.map((t) => `#${t}`).join(' ') : '无标签'}
                      </div>
                    </Link>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <Outlet />
        </div>
      </div>
    </section>
  )
}

/** 右栏无选中时的占位（编辑器在 /input/notes/:id 子路由渲染） */
export function NotesEmptyPane() {
  return (
    <div className="empty">
      <div className="e-ico" aria-hidden><Icon name="pen" size={32} /></div>
      <p>选择左侧一条速记，或新建一条。</p>
      <Link to="/input/notes/new" className="btn-primary">＋ 新速记</Link>
    </div>
  )
}
