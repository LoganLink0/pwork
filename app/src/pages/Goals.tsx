import { useEffect, useState } from 'react'
import { useGoals } from '../store/goals'
import { todayLocal } from '../engine/datetime'
import type { Goal } from '../types/models'

/**
 * 目标页：期限（Time-bound）+ 时间条 + 进度轨迹 + 状态流转。
 * 状态流转与待办同一套规则：复选框是唯一状态开关（勾选＝达成，再点＝恢复）；搁置留底可恢复。
 * 时间条回答三个问题：要多久（创建→期限的整条）、现在怎样（已走过部分）、还有多久（剩 N 天）。
 */

const DAY = 86_400_000

function diffDays(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / DAY)
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** 期限徽章文案：未定期限 / 今天到期 / 已过期 N 天 / M月D日（剩 N 天） */
function dueBadge(g: Goal, today: string): { text: string; over: boolean } {
  if (!g.due) return { text: '未定期限', over: false }
  const left = diffDays(today, g.due)
  const d = new Date(g.due + 'T12:00:00')
  const date = `${d.getMonth() + 1}月${d.getDate()}日`
  if (left < 0) return { text: `逾期 ${-left} 天 · ${date}`, over: true }
  if (left === 0) return { text: `今天到期 · ${date}`, over: true }
  return { text: `${date} · 剩 ${left} 天`, over: false }
}

/** 时间条：创建→期限 的已走过比例；无期限不显示 */
function timelinePct(g: Goal, today: string): { pct: number; over: boolean } | null {
  if (!g.due) return null
  const startDay = g.createdAt.slice(0, 10)
  const total = Math.max(1, diffDays(startDay, g.due))
  const elapsed = Math.min(total, Math.max(0, diffDays(startDay, today)))
  return { pct: Math.round((elapsed / total) * 100), over: diffDays(today, g.due) < 0 }
}

export function Goals() {
  const { goals, create, setStatus, updateProgress, updateDue, updateTitle } = useGoals()
  const [draft, setDraft] = useState('')
  const [draftDue, setDraftDue] = useState('')
  const [progressFor, setProgressFor] = useState<string | null>(null)
  const [progressDraft, setProgressDraft] = useState('')
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ title: '', due: '' })
  const today = todayLocal()

  const saveGoalEdit = async (id: string) => {
    if (editDraft.title.trim()) await updateTitle(id, editDraft.title)
    await updateDue(id, editDraft.due || undefined)
    setEditingGoalId(null)
  }

  useEffect(() => {
    void useGoals.getState().load()
  }, [])

  const submit = async () => {
    if (!draft.trim()) return
    await create({ title: draft, due: draftDue || undefined })
    setDraft('')
    setDraftDue('')
  }

  const active = goals.filter((g) => g.status === 'active')
  const closed = goals.filter((g) => g.status !== 'active')
  const doneClosed = closed.filter((g) => g.status === 'done').length
  const droppedClosed = closed.length - doneClosed

  const renderRow = (g: Goal) => {
    const closed = g.status !== 'active'
    const badge = dueBadge(g, today)
    const strip = closed ? null : timelinePct(g, today)
    const log = g.progressLog ?? []

    /** 行内编辑态：标题 + 期限一次改全（期限不再用行内小框——那玩意用户根本看不见） */
    if (editingGoalId === g.id) {
      return (
        <div key={g.id} className="task-row" data-testid="goal-edit">
          <div className="task-row-body">
            <div className="task-row-top">
              <input
                className="input"
                style={{ flex: 1, minWidth: 0 }}
                value={editDraft.title}
                aria-label="目标标题"
                onChange={(e) => setEditDraft((s) => ({ ...s, title: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && void saveGoalEdit(g.id)}
              />
              <input
                className="input"
                type="date"
                style={{ flex: 'none', width: 150 }}
                value={editDraft.due}
                aria-label="目标期限"
                title="清空日期＝不定期限"
                onChange={(e) => setEditDraft((s) => ({ ...s, due: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && void saveGoalEdit(g.id)}
              />
            </div>
            <div className="task-row-meta">
              <button type="button" className="mini-btn" onClick={() => void saveGoalEdit(g.id)}>保存</button>
              <button type="button" className="mini-btn" onClick={() => setEditingGoalId(null)}>取消</button>
              <span className="sub" style={{ margin: 0 }}>清空日期＝不定期限</span>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div
        key={g.id}
        className="task-row task-row--editable"
        data-testid="goal-row"
        data-status={g.status}
        role="button"
        tabIndex={0}
        aria-label={`编辑：${g.title}`}
        title="点击编辑标题与期限"
        onClick={() => {
          setEditingGoalId(g.id)
          setEditDraft({ title: g.title, due: g.due ?? '' })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            setEditingGoalId(g.id)
            setEditDraft({ title: g.title, due: g.due ?? '' })
          }
        }}
      >
        <div
          className="checkbox"
          role="checkbox"
          tabIndex={0}
          aria-checked={g.status === 'done'}
          aria-label={closed ? `恢复为进行中：${g.title}` : `达成：${g.title}`}
          title={closed ? '恢复为进行中' : '标记达成'}
          onClick={(e) => {
            e.stopPropagation()
            void setStatus(g.id, closed ? 'active' : 'done')
          }}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault()
              e.stopPropagation()
              void setStatus(g.id, closed ? 'active' : 'done')
            }
          }}
        >
          ✓
        </div>
        <div className="task-row-body">
          <div className="task-row-top">
            <div className="t-name">{g.title}</div>
            {closed ? (
              <span className={`status-badge${g.status === 'done' ? ' okb' : ' offb'}`}>
                {g.status === 'done' ? '已达成' : '已搁置'}
              </span>
            ) : (
              <span className={`t-due${badge.over ? ' over' : ''}`}>{badge.text}</span>
            )}
          </div>
          {strip && (
            <div
              className="goal-timeline"
              role="img"
              aria-label={`从 ${shortDate(g.createdAt)} 起，已进行 ${strip.pct}%`}
              title={`${shortDate(g.createdAt)} 开始 → ${g.due} 期限`}
            >
              <div className="goal-timeline-fill" style={{ width: `${strip.pct}%` }} data-over={strip.over || undefined} />
            </div>
          )}
          {!closed && (
            <div className="task-row-meta">
              {g.progressNote && (
                <span className="origin" title={g.progressNote}>
                  进度：{g.progressNote}
                </span>
              )}
              {/* 处置按钮一行；编辑入口=点击标题进入（与待办行同构） */}
              <span className="ops-left" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="mini-btn"
                  title="记录当前进展，自动带上日期，周复盘时随目标带出"
                  onClick={() => {
                    setProgressFor(g.id)
                    setProgressDraft(g.progressNote ?? '')
                  }}
                >
                  记进度
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  title="这个目标不追了——留底可恢复"
                  onClick={() => void setStatus(g.id, 'dropped')}
                >
                  搁置
                </button>
              </span>
            </div>
          )}
          {!closed && progressFor === g.id && (
            <div className="progress-editor">
              <input
                className="input"
                autoFocus
                value={progressDraft}
                placeholder="现在的进展，一句话；回车保存，自动带上今天的日期"
                aria-label={`进度内容：${g.title}`}
                onChange={(e) => setProgressDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && progressDraft.trim()) {
                    void updateProgress(g.id, progressDraft.trim())
                    setProgressFor(null)
                  }
                  if (e.key === 'Escape') setProgressFor(null)
                }}
              />
              <button
                type="button"
                className="mini-btn"
                onClick={() => {
                  if (progressDraft.trim()) void updateProgress(g.id, progressDraft.trim())
                  setProgressFor(null)
                }}
              >
                保存
              </button>
              <button type="button" className="mini-btn" onClick={() => setProgressFor(null)}>
                取消
              </button>
            </div>
          )}
          {!closed && log.length > 0 && (
            <details className="goal-progress">
              <summary>进度记录（{log.length}）</summary>
              <ul>
                {[...log].reverse().map((e, i) => (
                  <li key={i}>
                    {shortDate(e.at)}：{e.note}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    )
  }

  return (
    <section>
      <div className="page-head">
        <h1>目标</h1>
        <span className="sub">定期限 · 记进度 · 周复盘时只读引用 · 勾选＝达成，再点＝恢复</span>
      </div>

      <div className="quick-add" data-testid="goal-quick-add">
        <span className="qa-plus" aria-hidden>＋</span>
        <input
          placeholder="新目标：一句话说清要到达的地方，回车添加"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          aria-label="新目标"
        />
        <input
          type="date"
          style={{ flex: 'none', width: 140 }}
          value={draftDue}
          aria-label="新目标期限（可选）"
          title="期限（可选）——目标的时间条按它计算"
          onChange={(e) => setDraftDue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
        <span className="qa-hint">↵ 添加</span>
      </div>

      {active.length === 0 && closed.length === 0 ? (
        <div className="empty">
          <div className="e-ico" aria-hidden>◎</div>
          <p>还没有目标。定一个，周复盘时会以进展的形式被带出来。</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)', margin: 'var(--sp-4) 0 var(--sp-2)' }}>
                <h3 style={{ fontSize: 'var(--fs-md)', margin: 0 }}>
                  进行中
                  <span className="lane-count">{active.length}</span>
                </h3>
              </div>
              <div className="task-card">
                {active.map((g) => renderRow(g))}
              </div>
            </>
          )}
          {closed.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)', margin: 'var(--sp-4) 0 var(--sp-2)' }}>
                <h3 style={{ fontSize: 'var(--fs-md)', margin: 0 }}>
                  已关闭
                  <span className="lane-count">
                    {doneClosed} 达成 · {droppedClosed} 搁置
                  </span>
                </h3>
                <span className="sub">点复选框可恢复为进行中</span>
              </div>
              <div className="task-card">
                {closed.map((g) => renderRow(g))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
