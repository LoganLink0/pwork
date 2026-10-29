import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LIBRARY, } from '../content/copy'
import { KnowledgeCapsule } from '../components/ui/KnowledgeCapsule'
import { currentIntervalDays, daysUntilDue, isDue, isRetired, lastRevisitPartial, type RevisitResult } from '../engine/revisit'
import { deleteInsight, listInsights, listReviews, updateInsight } from '../db/repo'
import { hashTheme } from '../engine/theme'
import type { InsightRecord, ReviewRecord } from '../types/models'
import { stickyStraight } from '../components/ui/sticky'

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** ⑤ 认知资产库：模式警示 + 洞察卡池（检索/回访） + 档案时间线 */
export function Library() {
  const [insights, setInsights] = useState<InsightRecord[] | null>(null)
  const [reviews, setReviews] = useState<ReviewRecord[]>([])
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [opsMsg, setOpsMsg] = useState('')

  useEffect(() => {
    let live = true
    void Promise.all([listInsights(), listReviews()]).then(([ins, rs]) => {
      if (!live) return
      setInsights(ins)
      setReviews(rs)
    })
    return () => {
      live = false
    }
  }, [])

  /** 模式警示：同一主题指纹出现 ≥3 次（PRD 5.3 F5） */
  const patternWarnings = useMemo(() => {
    if (!insights) return []
    const groups = new Map<string, InsightRecord[]>()
    for (const ins of insights) {
      if (ins.patternGroup === 'empty') continue
      const list = groups.get(ins.patternGroup) ?? []
      list.push(ins)
      groups.set(ins.patternGroup, list)
    }
    return [...groups.values()].filter((g) => g.length >= 3)
  }, [insights])

  const allTags = useMemo(
    () => Array.from(new Set((insights ?? []).flatMap((i) => i.tags))).sort((a, b) => a.localeCompare(b)),
    [insights],
  )

  const filtered = useMemo(() => {
    if (!insights) return []
    const kw = q.trim()
    return insights.filter((i) => {
      if (tag && !i.tags.includes(tag)) return false
      if (!kw) return true
      return i.text.includes(kw)
    })
  }, [insights, q, tag])

  function startEdit(ins: InsightRecord) {
    setEditingId(ins.id)
    setEditText(ins.text)
  }

  async function saveEdit(ins: InsightRecord) {
    const text = editText.trim()
    if (!text) return
    const next: InsightRecord = { ...ins, text, patternGroup: hashTheme(text) }
    setInsights((list) => (list ? list.map((i) => (i.id === ins.id ? next : i)) : list))
    setEditingId(null)
    await updateInsight(next)
    setOpsMsg(LIBRARY.editHint)
  }

  async function removeInsight(ins: InsightRecord) {
    if (!window.confirm(LIBRARY.confirmDel)) return
    setInsights((list) => (list ? list.filter((i) => i.id !== ins.id) : list))
    await deleteInsight(ins.id)
  }

  /** 回访三态：成立推高 verified、间隔翻倍；部分失效重置 30 天；需要修正则终结生命周期 */
  async function mark(ins: InsightRecord, result: RevisitResult) {
    const next: InsightRecord = {
      ...ins,
      verified: result === 'valid' ? true : result === 'invalid' ? false : ins.verified,
      revisit: [...ins.revisit, { at: new Date().toISOString(), stillValid: result !== 'invalid', result }],
    }
    setInsights((list) => (list ? list.map((i) => (i.id === ins.id ? next : i)) : list))
    await updateInsight(next)
  }

  const reviewTitle = (id: string) => reviews.find((r) => r.id === id)?.title

  return (
    <div className="container">
      <header className="page-head">
        <div className="kicker">认知资产库</div>
        <h1>你的大脑是一台预测机器。</h1>
        <p className="coach-say">这里是它的校准记录——每一条认知更新，都是一次贝叶斯升级。</p>
      </header>

      {patternWarnings.length > 0 && (
        <section aria-label={LIBRARY.patternTitle}>
          {patternWarnings.map((group, i) => (
            <div
              key={i}
              className="sticky sticky--action note"
              style={{ ...stickyStraight, marginBottom: 'var(--sp-3)' }}
              role="alert"
            >
              <p className="sticky-tagline">{LIBRARY.patternWarn(group.length, group[0].text)}</p>
            </div>
          ))}
        </section>
      )}

      <section className="detail-section">
        <h2>
          {LIBRARY.poolTitle} <KnowledgeCapsule id="insight-card" />
        </h2>
        {opsMsg && (
          <p className="coach-say" role="status">
            {opsMsg}
          </p>
        )}
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={LIBRARY.searchPlaceholder}
          aria-label={LIBRARY.searchPlaceholder}
        />
        {allTags.length > 0 && (
          <div style={{ display: 'flex', gap: 'var(--sp-1)', flexWrap: 'wrap', margin: 'var(--sp-2) 0' }}>
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
          </div>
        )}
        {insights === null ? (
          <p className="coach-say">正在打开资产库……</p>
        ) : filtered.length === 0 ? (
          <p className="coach-say">{q ? '没有匹配的洞察卡。' : LIBRARY.empty}</p>
        ) : (
          filtered.map((ins) => {
            const due = isDue(ins)
            const retired = isRetired(ins)
            const partial = lastRevisitPartial(ins)
            const days = daysUntilDue(ins)
            return (
              <div
                key={ins.id}
                className="cause-card sticky sticky--insight note"
                style={stickyStraight}
              >
                {editingId === ins.id ? (
                  <div>
                    <input
                      className="input"
                      value={editText}
                      aria-label="编辑洞察卡内容"
                      onChange={(e) => setEditText(e.target.value)}
                    />
                    <div className="action-ops">
                      <button className="btn-small" onClick={() => saveEdit(ins)}>
                        {LIBRARY.save}
                      </button>
                      <button className="btn-small" onClick={() => setEditingId(null)}>
                        {LIBRARY.cancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p style={{ margin: 0 }}>{ins.text}</p>
                )}
                <div className="action-ops" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn-small" onClick={() => startEdit(ins)}>
                    {LIBRARY.edit}
                  </button>
                  <button className="btn-small" onClick={() => removeInsight(ins)}>
                    {LIBRARY.del}
                  </button>
                </div>
                <p className="coach-say" style={{ margin: 0 }}>
                  【{ins.kind === 'inductive' ? '归纳·待验证' : '演绎·确定'}】{fmtDate(ins.createdAt)}
                  {retired && <span className="status-badge"> · {LIBRARY.revised}（回访已终结）</span>}
                  {partial && <span className="status-badge"> · {LIBRARY.partiallyRevised}</span>}
                  {ins.tags.length > 0 && <> · {ins.tags.map((t) => `#${t}`).join(' ')}</>}
                  {ins.reviewId && reviewTitle(ins.reviewId) && (
                    <>
                      {' · '}
                      <Link to={`/review/archive/${ins.reviewId}`}>{LIBRARY.viewReview}</Link>
                    </>
                  )}
                </p>
                {due && !retired ? (
                  <div>
                    <div className="field-label">
                      <span>{LIBRARY.dueAsk}</span>
                    </div>
                    <div className="seg" role="group" aria-label={LIBRARY.dueAsk}>
                      <button className="seg-item" onClick={() => mark(ins, 'valid')}>
                        {LIBRARY.stillValid}
                      </button>
                      <button className="seg-item" onClick={() => mark(ins, 'partial')}>
                        {LIBRARY.partial}
                      </button>
                      <button className="seg-item" onClick={() => mark(ins, 'invalid')}>
                        {LIBRARY.invalidated}
                      </button>
                    </div>
                  </div>
                ) : retired ? null : (
                  <p className="coach-say tnum" style={{ margin: 0 }}>
                    {ins.revisit.length > 0
                      ? `上次回访：${fmtDate(ins.revisit.reduce((a, b) => (a.at > b.at ? a : b)).at)}`
                      : '尚未回访'}
                    {days > 0 ? ` · ${LIBRARY.nextInDays(days)}` : ''}
                    {` · 每 ${currentIntervalDays(ins)} 天回访一次`}
                  </p>
                )}
              </div>
            )
          })
        )}
      </section>

      <section className="detail-section">
        <h2>{LIBRARY.timelineTitle}</h2>
        {reviews.length === 0 ? (
          <p className="coach-say">还没有档案。</p>
        ) : (
          <ul className="review-list">
            {[...reviews]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((r) => (
                <li key={r.id} className="review-row">
                  <div>
                    <strong>{r.title}</strong>
                    <div className="coach-say tnum">
                      {fmtDate(r.createdAt)} · {r.status === 'archived' ? '已归档' : '进行中'}
                    </div>
                  </div>
                  <Link className="btn-ghost" to={`/review/archive/${r.id}`}>
                    打开
                  </Link>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  )
}
