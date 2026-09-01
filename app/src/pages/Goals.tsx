import { useEffect, useState } from 'react'
import { useGoals } from '../store/goals'
import { todayLocal } from '../engine/datetime'

/** 目标页（C-2 最小形态）：工作台目标模块拥有，复盘向导只读引用 */
export function Goals() {
  const { goals, create, setStatus } = useGoals()
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

  const renderRow = (g: (typeof goals)[0], done: boolean) => {
    const over = !done && g.due && g.due < today
    return (
      <div key={g.id} className={`task-row${done ? ' done' : ''}`} data-testid="goal-row">
        <div
          className="checkbox"
          role="checkbox"
          aria-checked={done}
          aria-label={`达成：${g.title}`}
          onClick={() => void setStatus(g.id, done ? 'active' : 'done')}
        >
          ✓
        </div>
        <div className="t-name" title={g.progressNote ? `上次进度：${g.progressNote}` : g.title}>
          {g.title}
        </div>
        <span className={`t-due${over && !done ? ' over' : ''}`}>
          {g.status === 'dropped' ? '已放弃' : done ? '已达成' : g.due ? (over ? `已过期 ${g.due}` : g.due) : '无期限'}
        </span>
        {!done && (
          <button type="button" className="mini-btn" onClick={() => void setStatus(g.id, 'dropped')}>
            放弃
          </button>
        )}
      </div>
    )
  }

  return (
    <section>
      <div className="page-head">
        <h1>目标</h1>
        <span className="sub">工作台拥有 · 复盘向导 C 步只读引用 · 进展随预填带出</span>
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
                <h3 style={{ fontSize: 'var(--fs-md)', margin: 0 }}>进行中（{active.length}）</h3>
              </div>
              <div className="task-card">
                {active.map((g) => renderRow(g, false))}
              </div>
            </>
          )}
          {closed.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)', margin: 'var(--sp-4) 0 var(--sp-2)' }}>
                <h3 style={{ fontSize: 'var(--fs-md)', margin: 0 }}>已关闭</h3>
              </div>
              <div className="task-card">
                {closed.map((g) => renderRow(g, true))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
