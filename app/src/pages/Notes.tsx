import { useMemo, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useNotes } from '../store/notes'
import { relTime } from '../engine/datetime'

/** 速记列表页（PRD §4.3）：搜索 + 标签筛选 + 回收站；右栏 Outlet 渲染编辑器 */
export function Notes() {
  const notes = useNotes((s) => s.notes)
  const trash = useNotes((s) => s.trash)
  const restore = useNotes((s) => s.restore)
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
            {list.map((n) => (
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
                {showTrash && (
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ position: 'absolute', right: 'var(--sp-2)', bottom: 'var(--sp-2)', padding: '2px 10px' }}
                    onClick={() => void restore(n.id)}
                  >
                    恢复
                  </button>
                )}
              </div>
            ))}
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
      <div className="e-ico" aria-hidden>✎</div>
      <p>选择左侧一条速记，或新建一条。</p>
      <Link to="/input/notes/new" className="btn-primary">＋ 新速记</Link>
    </div>
  )
}
