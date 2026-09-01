import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTasks } from '../store/tasks'
import { todayLocal } from '../engine/datetime'
import { resolveLane } from '../engine/taskLane'
import type { TaskItem, TaskLane, TaskOriginKind } from '../types/models'

const ORIGIN_LABEL: Record<TaskOriginKind, string> = {
  review: '来源:复盘',
  note: '来源:速记',
  item: '来源:信息',
  manual: '来源:手动',
  bid: '来源:投标',
}

/** 任务三分类（客观事实取代主观重要/紧急），命名沿用用户原话：一类/二类/三类 */
const LANE_META: Record<TaskLane, { name: string; rule: string; action: string }> = {
  1: { name: '一类 · 今天必须做', rule: '今天不完成，这件事的时间窗口直接消失（不可逆损失）', action: '今日必须优先处理' },
  2: { name: '二类 · 卡住别人的', rule: '缺我的输出，整件事卡住推进不了（非我不可）', action: '尽快解除，不要长期搁置' },
  3: { name: '三类 · 可以绕开我', rule: '就算我不做，事情也能继续（可交人/可推迟/可删除）', action: '碎片时间处理，或干脆删掉' },
}

/** 本地日期展示：今天 / 明天 / M月D日 */
function dueLabel(due: string | undefined, today: string): { text: string; over: boolean } {
  if (!due) return { text: '无期限', over: false }
  const diff = Math.round((new Date(due + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86_400_000)
  if (diff === 0) return { text: '今天', over: true }
  if (diff === 1) return { text: '明天', over: false }
  if (diff < 0) return { text: `逾期 ${-diff} 天`, over: true }
  const d = new Date(due + 'T12:00:00')
  return { text: `${d.getMonth() + 1}月${d.getDate()}日`, over: false }
}

/** 来源徽章 → 溯源跳转 */
function OriginBadge({ task }: { task: TaskItem }) {
  const kind = task.origin?.kind ?? 'manual'
  const label = ORIGIN_LABEL[kind]
  if (kind === 'manual' || !task.origin?.refId) {
    return <span className="origin" data-k={kind}>{label}</span>
  }
  const to =
    kind === 'review' ? `/review/archive/${task.origin.refId}` : kind === 'note' ? `/input/notes/${task.origin.refId}` : '/input/items'
  return (
    <Link className="origin" data-k={kind} to={to} title="溯源">
      {label}
    </Link>
  )
}

export function Tasks() {
  const { tasks, stats, create, setStatus, setLane, postpone, remove, load } = useTasks()
  const [draft, setDraft] = useState('')
  const today = todayLocal()

  // 进入任务页即重载：归档/导入发生在其他模块，进场拿最新（跨模块无推送的兜底）
  useEffect(() => {
    void load()
  }, [load])

  const laneLists = useMemo(() => {
    const byLane: Record<TaskLane, TaskItem[]> = { 1: [], 2: [], 3: [] }
    const done: TaskItem[] = []
    for (const t of tasks) {
      const isDone = t.status === 'done' || t.status === 'dropped'
      if (isDone) {
        done.push(t)
        continue
      }
      byLane[resolveLane(t, today)]!.push(t)
    }
    return { byLane, done }
  }, [tasks])

  const submit = async () => {
    if (!draft.trim()) return
    await create({ title: draft, origin: { kind: 'manual', refId: null } })
    setDraft('')
  }

  const closedRate = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0

  const cycleLane = (t: TaskItem) => {
    const cur = resolveLane(t, today)
    const next: TaskLane = cur === 1 ? 2 : cur === 2 ? 3 : 1
    void setLane(t.id, next)
  }

  const renderRow = (t: TaskItem, done: boolean) => {
    const d = dueLabel(t.due, today)
    return (
      <div key={t.id} className={`task-row${done ? ' done' : ''}`} data-testid="task-row">
        <div
          className="checkbox"
          role="checkbox"
          aria-checked={t.status === 'done'}
          aria-label={`完成：${t.title}`}
          onClick={() => void setStatus(t.id, done ? 'todo' : 'done')}
        >
          ✓
        </div>
        <div className="t-name" title={t.ifThen ? `执行意图：${t.ifThen}` : t.title}>
          {t.title}
        </div>
        <OriginBadge task={t} />
        <span className={`t-due${d.over && !done ? ' over' : ''}`}>{done ? (t.status === 'dropped' ? '已放弃' : '已闭环') : d.text}</span>
        {!done && (
          <>
            <button
              type="button"
              className="mini-btn"
              title={`挪到${resolveLane(t, today) === 1 ? '二类' : resolveLane(t, today) === 2 ? '三类' : '一类'}`}
              onClick={() => cycleLane(t)}
            >
              挪一下
            </button>
            <button type="button" className="mini-btn" title="推迟 7 天" onClick={() => void postpone(t.id, 7)}>+7天</button>
            <button
              type="button"
              className="mini-btn"
              title="删除（软删除）"
              onClick={() => {
                if (window.confirm(`删除「${t.title}」？（软删除，导出备份中仍可找回）`)) void remove(t.id)
              }}
            >
              删
            </button>
          </>
        )}
      </div>
    )
  }

  const renderLaneSection = (lane: TaskLane) => {
    const meta = LANE_META[lane]
    const list = laneLists.byLane[lane]
    return (
      <div className="lane-col">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)', marginBottom: 'var(--sp-2)' }}>
          <h3 style={{ fontSize: 'var(--fs-md)', margin: 0 }}>{meta.name}</h3>
        </div>
        <div className="task-card">
          {list.length === 0 ? (
            <div style={{ padding: 'var(--sp-3) var(--sp-5)', color: 'var(--ink-faint)', fontSize: 'var(--fs-sm)' }}>（无）</div>
          ) : (
            list.map((t) => renderRow(t, false))
          )}
        </div>
      </div>
    )
  }

  return (
    <section>
      <div className="page-head">
        <h1>待办</h1>
        <span className="sub">三个问题定顺序：① 今天不做就过期？② 卡住别人等我的？③ 都不是？——按一类＞二类＞三类执行</span>
      </div>

      <div className="quick-add" data-testid="quick-add">
        <span className="qa-plus" aria-hidden>＋</span>
        <input
          placeholder="想到什么要做的，一句话记下，回车添加"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          aria-label="新任务标题"
        />
        <span className="qa-hint">↵ 添加</span>
      </div>

      <div className="lanes-grid">
        {renderLaneSection(1)}
        {renderLaneSection(2)}
        {renderLaneSection(3)}
      </div>

      {laneLists.done.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)', margin: 'var(--sp-4) 0 var(--sp-2)' }}>
            <h3 style={{ fontSize: 'var(--fs-md)', margin: 0 }}>已闭环</h3>
          </div>
          <div className="task-card">
            {laneLists.done.map((t) => renderRow(t, true))}
          </div>
        </>
      )}

      <div className="stats-line">
        总闭环率 <b>{closedRate}%</b>（{stats.done}/{stats.total}）
      </div>
    </section>
  )
}
