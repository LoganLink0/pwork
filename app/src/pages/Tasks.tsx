import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTasks } from '../store/tasks'
import { todayLocal } from '../engine/datetime'
import type { TaskItem, TaskOriginKind } from '../types/models'

const ORIGIN_LABEL: Record<TaskOriginKind, string> = {
  review: '来源:复盘',
  note: '来源:速记',
  item: '来源:信息',
  manual: '来源:手动',
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

type Group = 'today' | 'week' | 'all' | 'done'

/** 待办 · 任务库（PRD §4.5）：行动项唯一存在地；来源标记让闭环回流可见 */
export function Tasks() {
  const { tasks, stats, create, setStatus, load } = useTasks()
  const [group, setGroup] = useState<Group>('today')
  const [draft, setDraft] = useState('')
  const today = todayLocal()

  // 进入任务页即重载：归档/导入发生在其他模块，进场拿最新（跨模块无推送的兜底）
  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const weekEnd = (() => {
      const now = new Date()
      const day = now.getDay() === 0 ? 7 : now.getDay()
      const end = new Date(now)
      end.setDate(now.getDate() + (7 - day))
      return todayLocal(end)
    })()
    return tasks.filter((t) => {
      const done = t.status === 'done' || t.status === 'dropped'
      if (group === 'done') return done
      if (done) return false
      const due = t.due ?? '9999'
      if (group === 'today') return due <= today
      if (group === 'week') return due <= weekEnd
      return true
    })
  }, [tasks, group, today])

  const counts = useMemo(() => {
    const done = tasks.filter((t) => t.status === 'done' || t.status === 'dropped').length
    const open = tasks.length - done
    return { today: stats.today, week: stats.today + stats.week, all: open, done }
  }, [tasks, stats])

  const submit = async () => {
    if (!draft.trim()) return
    await create({ title: draft, origin: { kind: 'manual', refId: null } })
    setDraft('')
  }

  const closedRate = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0

  return (
    <section>
      <div className="page-head">
        <h1>待办</h1>
        <span className="sub">行动项唯一存在地（SSOT）· 其他模块仅 ID 引用</span>
        <div className="right">
          <input
            className="input"
            style={{ maxWidth: 220 }}
            placeholder="新任务标题，回车添加"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            aria-label="新任务标题"
          />
        </div>
      </div>

      <div className="tabs" role="tablist">
        {(['today', 'week', 'all', 'done'] as Group[]).map((g) => (
          <button key={g} type="button" className={`chip${group === g ? ' on' : ''}`} onClick={() => setGroup(g)}>
            {{ today: `今天 ${counts.today}`, week: `本周 ${counts.week}`, all: `全部 ${counts.all}`, done: `已完成 ${counts.done}` }[g]}
          </button>
        ))}
      </div>

      <div className="task-card">
        {filtered.length === 0 ? (
          <div style={{ padding: 'var(--sp-5)', textAlign: 'center', color: 'var(--ink-faint)', fontSize: 'var(--fs-sm)' }}>
            {group === 'today' ? '今天没有到期任务。' : group === 'done' ? '还没有闭环记录。' : '没有任务——做一次复盘，行动项会自动出现在这里。'}
          </div>
        ) : (
          filtered.map((t) => {
            const done = t.status === 'done' || t.status === 'dropped'
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
              </div>
            )
          })
        )}
      </div>

      <div className="stats-line">
        总闭环率 <b>{closedRate}%</b>（{stats.done}/{stats.total}）· 复盘产出的行动项自动出现在这里（任务库是 SSOT，复盘侧仅持 taskId 引用）
      </div>
    </section>
  )
}
