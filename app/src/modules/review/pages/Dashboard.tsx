import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DASHBOARD_STATS, DETAIL, GREETING } from '../content/copy'
import { isDue } from '../engine/revisit'
import { fmtLocal, todayLocal } from '../engine/datetime'
import { actionStats, closeAction, listInsights, listOpenActions, listReviews, updateAction, type ActionStats } from '../db/repo'
import type { ActionItem, ReviewRecord } from '../types/models'
import { KnowledgeCapsule } from '../components/ui/KnowledgeCapsule'

const KIND_MARK = { stop: '⛔', continue: '✅', start: '🚀' } as const

/** ① 仪表盘：Hero + 统计卡阵 + 双栏（档案 / 行动待办） */
export function Dashboard() {
  const navigate = useNavigate()
  const [reviews, setReviews] = useState<ReviewRecord[] | null>(null)
  const [open, setOpen] = useState<ActionItem[]>([])
  const [stats, setStats] = useState<ActionStats | null>(null)
  const [insightCount, setInsightCount] = useState(0)
  const [dueCount, setDueCount] = useState(0)
  const [searchQ, setSearchQ] = useState('')
  const [editingActionId, setEditingActionId] = useState<string | null>(null)
  const [actionDraft, setActionDraft] = useState({ text: '', due: '' })

  const reload = useCallback(async () => {
    const [rs, acts, st, ins] = await Promise.all([
      listReviews(),
      listOpenActions(),
      actionStats(),
      listInsights(),
    ])
    setReviews(rs)
    setOpen(acts)
    setStats(st)
    setInsightCount(ins.length)
    setDueCount(ins.filter((i) => isDue(i)).length)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  async function close(id: string, status: 'done' | 'dropped') {
    await closeAction(id, status)
    await reload()
  }

  function startEditAction(a: ActionItem) {
    setEditingActionId(a.id)
    setActionDraft({ text: a.text, due: a.due ?? '' })
  }

  async function saveAction(id: string) {
    if (!actionDraft.text.trim()) return
    await updateAction(id, { text: actionDraft.text.trim(), due: actionDraft.due || undefined })
    setEditingActionId(null)
    await reload()
  }

  const closurePct = stats ? `${Math.round(stats.closureRate * 100)}%` : '—'

  return (
    <div className="container">
      {/* Hero */}
      <section className="hero">
        <div>
          <h1>把经历，变成实力。</h1>
          <p className="hero-sub">{GREETING.welcome}</p>
          <div className="hero-cta">
            <button className="btn-primary" onClick={() => navigate('/review/wizard?template=personal-daily&mode=quick')}>
              3 分钟快速复盘
            </button>
            <Link
              className="btn-ghost"
              to="/review/new"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            >
              浏览全部场景 →
            </Link>
          </div>
        </div>
      </section>

      {/* 统计卡阵 */}
      <section className="stats-grid" aria-label="复盘节奏">
        <div className="stat-card">
          <div className="stat-num tnum">{reviews?.length ?? '…'}</div>
          <div className="stat-label">{DASHBOARD_STATS.reviews}</div>
        </div>
        <div className="stat-card">
          <div className="stat-num tnum">{insightCount}</div>
          <div className="stat-label">{DASHBOARD_STATS.insights}</div>
        </div>
        <Link className="stat-card" to="/review/assets">
          <div className="stat-num tnum">{closurePct}</div>
          <div className="stat-label">{DASHBOARD_STATS.closure}</div>
        </Link>
        <Link className={`stat-card ${dueCount > 0 ? 'stat--warn' : ''}`} to="/review/assets">
          <div className="stat-num tnum">{dueCount}</div>
          <div className="stat-label">{DASHBOARD_STATS.revisitDue}</div>
        </Link>
      </section>

      {/* 双栏：档案 / 待办 */}
      <div className="home-grid">
        <section className="panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>最近档案</h2>
            {reviews !== null && reviews.length > 0 && (
              <input
                className="input"
                style={{ width: 'min(220px, 60%)', marginBottom: 0 }}
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder={DASHBOARD_STATS.searchPlaceholder}
                aria-label={DASHBOARD_STATS.searchPlaceholder}
              />
            )}
          </div>
        {reviews === null ? (
          <p className="coach-say">正在打开档案柜……</p>
        ) : reviews.length === 0 ? (
          <p className="coach-say">
            {GREETING.emptyReviews}{' '}
            <Link to="/review/help">不确定怎么开始？看看 3 分钟新手引导 →</Link>
          </p>
        ) : (
            <ul className="review-list">
              {reviews.filter((r) => r.title.toLowerCase().includes(searchQ.trim().toLowerCase())).length === 0 &&
              searchQ.trim() !== '' ? (
                <li className="coach-say">{DASHBOARD_STATS.noMatch}</li>
              ) : null}
              {reviews
                .filter((r) => r.title.toLowerCase().includes(searchQ.trim().toLowerCase()))
                .map((r) => (
                <li key={r.id} className="review-row">
                  <div>
                    <strong>{r.title}</strong>
                    <div className="coach-say tnum">
                      {fmtLocal(r.updatedAt)} ·{' '}
                      {r.status === 'archived' ? DETAIL.archived : <span className="status-badge">进行中</span>}
                    </div>
                  </div>
                  <Link
                    className="btn-ghost"
                    to={
                      r.status === 'archived'
                        ? `/review/archive/${r.id}`
                        : r.type === 'team'
                          ? `/review/meeting?resume=${r.id}`
                          : `/review/wizard?resume=${r.id}`
                    }
                  >
                    {r.status === 'archived' ? DETAIL.open : DETAIL.resume}
                  </Link>
                </li>
                ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>
            行动项待办 <KnowledgeCapsule id="action-card" />
          </h2>
          {open.length === 0 ? (
            <p className="coach-say">
              {stats && stats.total > 0 ? DASHBOARD_STATS.allClear(closurePct) : GREETING.emptyActions}
            </p>
          ) : (
            <ul className="review-list">
              {open.map((a) => {
                const overdue = !!a.due && a.due < todayLocal()
                const editing = editingActionId === a.id
                return (
                  <li key={a.id} className="review-row action-row">
                    {editing ? (
                      <div style={{ flex: 1, display: 'grid', gap: 'var(--sp-2)' }}>
                        <input
                          className="input"
                          style={{ marginBottom: 0 }}
                          value={actionDraft.text}
                          aria-label="编辑行动项内容"
                          onChange={(e) => setActionDraft((d) => ({ ...d, text: e.target.value }))}
                        />
                        <input
                          className="input"
                          style={{ marginBottom: 0, width: 180 }}
                          type="date"
                          value={actionDraft.due}
                          aria-label="编辑行动项期限"
                          onChange={(e) => setActionDraft((d) => ({ ...d, due: e.target.value }))}
                        />
                        <div className="action-ops">
                          <button className="btn-small" onClick={() => saveAction(a.id)}>
                            {DASHBOARD_STATS.save}
                          </button>
                          <button className="btn-small" onClick={() => setEditingActionId(null)}>
                            {DASHBOARD_STATS.cancel}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <strong>
                            {KIND_MARK[a.kind]} {a.text}
                          </strong>
                          {a.ifThen?.trim() && <div className="coach-say">执行意图：{a.ifThen}</div>}
                          {a.due && (
                            <div className={`coach-say tnum ${overdue ? 'overdue' : ''}`}>
                              {overdue ? `${DASHBOARD_STATS.overdue} · ${a.due}` : a.due}
                            </div>
                          )}
                        </div>
                        <div className="action-ops">
                          <button className="btn-small" onClick={() => close(a.id, 'done')}>
                            {DASHBOARD_STATS.close}
                          </button>
                          <button className="btn-small" onClick={() => close(a.id, 'dropped')}>
                            {DASHBOARD_STATS.drop}
                          </button>
                          <button className="btn-small" onClick={() => startEditAction(a)}>
                            {DASHBOARD_STATS.edit}
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
