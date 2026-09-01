import { useEffect, useState } from 'react'
import { useGoals } from '../store/goals'
import { todayLocal } from '../engine/datetime'
import type { Goal } from '../types/models'

/**
 * 目标页（C-2 最小形态）：工作台目标模块拥有，复盘向导只读引用。
 * 状态流转与待办同一套规则：
 *  - 复选框是唯一状态开关：进行中 → 勾选达成；已关闭（含已放弃）→ 再点恢复为进行中
 *  - 放弃 = 不追了但留底（可恢复），入口在进行中行的操作区
 */
export function Goals() {
  const { goals, create, setStatus, updateProgress } = useGoals()
  const [draft, setDraft] = useState('')
  const today = todayLocal()

  useEffect(() => {
    void useGoals.getState().load()
  }, [])

  const submit = async () => {
    if (!draft.trim()) return
    await create({ title: draft })
    setDraft('')
  }

  const active = goals.filter((g) => g.status === 'active')
  const closed = goals.filter((g) => g.status !== 'active')
  const doneClosed = closed.filter((g) => g.status === 'done').length
  const droppedClosed = closed.length - doneClosed

  const renderRow = (g: Goal) => {
    const closed = g.status !== 'active'
    const over = !closed && !!g.due && g.due < today
    return (
      <div key={g.id} className="task-row" data-testid="goal-row" data-status={g.status}>
        <div
          className="checkbox"
          role="checkbox"
          tabIndex={0}
          aria-checked={g.status === 'done'}
          aria-label={closed ? `恢复为进行中：${g.title}` : `达成：${g.title}`}
          title={closed ? '恢复为进行中' : '标记达成'}
          onClick={() => void setStatus(g.id, closed ? 'active' : 'done')}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault()
              void setStatus(g.id, closed ? 'active' : 'done')
            }
          }}
        >
          ✓
        </div>
        <div className="task-row-body">
          <div className="task-row-top">
            <div className="t-name" title={g.progressNote ? `上次进度：${g.progressNote}` : g.title}>
              {g.title}
            </div>
            {closed ? (
              <span className={`status-badge${g.status === 'done' ? ' okb' : ' offb'}`}>
                {g.status === 'done' ? '已达成' : '已放弃'}
              </span>
            ) : (
              <span className={`t-due${over ? ' over' : ''}`} title={g.due ? `期限 ${g.due}` : undefined}>
                {g.due ? (over ? `已过期 ${g.due}` : g.due) : '无期限'}
              </span>
            )}
          </div>
          {!closed && (
            <div className="task-row-meta">
              {g.progressNote && (
                <span className="origin" title={g.progressNote}>
                  进度：{g.progressNote}
                </span>
              )}
              <span className="meta-spacer" />
              <button
                type="button"
                className="mini-btn"
                title="记录当前进展，周复盘时随目标带出"
                onClick={() => {
                  const note = window.prompt(`「${g.title}」的当前进度：`, g.progressNote ?? '')
                  if (note && note.trim()) void updateProgress(g.id, note.trim())
                }}
              >
                记进度
              </button>
              <button
                type="button"
                className="mini-btn"
                title="不追了但保留记录，可随时恢复"
                onClick={() => {
                  if (window.confirm(`放弃目标「${g.title}」？它会移入下方"已关闭"区，随时可恢复。`)) void setStatus(g.id, 'dropped')
                }}
              >
                放弃
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <section>
      <div className="page-head">
        <h1>目标</h1>
        <span className="sub">工作台拥有 · 复盘向导 C 步只读引用 · 勾选＝达成，再点＝恢复</span>
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
                    {doneClosed} 达成 · {droppedClosed} 放弃
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
