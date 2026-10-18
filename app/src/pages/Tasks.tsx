import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTasks } from '../store/tasks'
import { todayLocal } from '../engine/datetime'
import { resolveLane } from '../engine/taskLane'
import { toast } from '../engine/toast'
import type { TaskItem, TaskLane, TaskOriginKind } from '../types/models'

const ORIGIN_LABEL: Record<TaskOriginKind, string> = {
  review: '来源:复盘',
  note: '来源:速记',
  item: '来源:信息',
  manual: '来源:手动',
  bid: '来源:投标',
  'todo-file': '来源:项目',
}

/** 任务三分类（客观事实取代主观重要/紧急），命名沿用用户原话：一类/二类/三类 */
const LANE_META: Record<TaskLane, { name: string; rule: string }> = {
  1: { name: '一类 · 今天必须做', rule: '今天不完成，这件事的时间窗口直接消失（不可逆损失）' },
  2: { name: '二类 · 卡住别人的', rule: '缺我的输出，整件事卡住推进不了（非我不可）' },
  3: { name: '三类 · 可以绕开我', rule: '就算我不做，事情也能继续（可交人/可推迟/可删除）' },
}

/** 本地日期展示：今天（红）/ 明天（橙）/ M月D日 */
function dueLabel(due: string | undefined, today: string): { text: string; over: boolean; soon: boolean } {
  if (!due) return { text: '无期限', over: false, soon: false }
  const diff = Math.round((new Date(due + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86_400_000)
  if (diff === 0) return { text: '今天', over: true, soon: false }
  if (diff === 1) return { text: '明天', over: false, soon: true }
  if (diff < 0) return { text: `逾期 ${-diff} 天`, over: true, soon: false }
  const d = new Date(due + 'T12:00:00')
  return { text: `${d.getMonth() + 1}月${d.getDate()}日`, over: false, soon: false }
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
  const { tasks, stats, create, setStatus, postpone, remove, setLane, load, scanProjectTodos } = useTasks()
  const [draft, setDraft] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  const today = todayLocal()

  // 手动扫描（首次会弹目录选择器——选你的项目根目录，如 E:\AIPROJECT-GLM）
  const runScan = async () => {
    if (scanBusy) return
    setScanBusy(true)
    try {
      const r = await scanProjectTodos('manual')
      if (r.ok) {
        if (r.added > 0) {
          toast('ok', `扫描完成：从 ${r.projects} 个项目新进 ${r.added} 条待办${r.skipped ? `（跳过已存在的 ${r.skipped} 条）` : ''}`)
        } else {
          toast('info', `扫描完成：${r.projects} 个项目没有新的未完成项`)
        }
      } else if (r.reason === 'not-supported') {
        toast('error', '当前浏览器不支持目录授权——请用 Chrome/Edge 打开 http://127.0.0.1:5273 操作（局域网 IP 页面无此能力）')
      } else if (r.reason === 'no-root') {
        toast('info', '已取消选择目录')
      } else if (r.reason === 'invalid') {
        toast('error', '已保存的项目目录失效（被删除或浏览器收回授权）——再点一次重新选择')
      } else if (r.reason === 'denied') {
        toast('error', '目录授权被拒绝——浏览器地址栏左侧可重新允许，或再点一次重选')
      }
    } finally {
      setScanBusy(false)
    }
  }

  // 进入任务页即重载：归档/导入发生在其他模块，进场拿最新（跨模块无推送的兜底）
  useEffect(() => {
    void load()
  }, [load])

  const laneLists = useMemo(() => {
    const byLane: Record<TaskLane, TaskItem[]> = { 1: [], 2: [], 3: [] }
    const closed: TaskItem[] = []
    for (const t of tasks) {
      const isClosed = t.status === 'done' || t.status === 'dropped'
      if (isClosed) {
        closed.push(t)
        continue
      }
      byLane[resolveLane(t, today)]!.push(t)
    }
    return { byLane, closed }
  }, [tasks, today])

  const submit = async () => {
    if (!draft.trim()) return
    await create({ title: draft, origin: { kind: 'manual', refId: null } })
    setDraft('')
  }

  const closedRate = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0

  /**
   * 状态流转矩阵（待办/目标同一套规则）：
   *  - 复选框是唯一状态开关：进行中 → 勾选闭环；已结束（含已放弃）→ 再点恢复为进行中
   *  - 分类下拉：手动选择后以手动为准，自动分诊不再覆盖
   *  - 放弃 = 不做了但留底（可恢复）；删除 = 移出列表（软删除，备份可找回）
   */
  const renderRow = (t: TaskItem) => {
    const closed = t.status === 'done' || t.status === 'dropped'
    const d = dueLabel(t.due, today)
    const lane = resolveLane(t, today)
    return (
      <div key={t.id} className="task-row" data-testid="task-row" data-status={t.status}>
        <div
          className="checkbox"
          role="checkbox"
          tabIndex={0}
          aria-checked={t.status === 'done'}
          aria-label={closed ? `恢复为进行中：${t.title}` : `完成：${t.title}`}
          title={closed ? '恢复为进行中' : '标记完成'}
          onClick={() => void setStatus(t.id, closed ? 'todo' : 'done')}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault()
              void setStatus(t.id, closed ? 'todo' : 'done')
            }
          }}
        >
          ✓
        </div>
        <div className="task-row-body">
          <div className="task-row-top">
            <div className="t-name" title={t.ifThen ? `执行意图：${t.ifThen}` : t.title}>
              {t.title}
            </div>
            {closed ? (
              <span className={`status-badge${t.status === 'done' ? ' okb' : ' offb'}`}>
                {t.status === 'done' ? '已闭环' : '已放弃'}
              </span>
            ) : (
              <span className={`t-due${d.over ? ' over' : d.soon ? ' soon' : ''}`} title={t.due ? `期限 ${t.due}` : undefined}>
                {d.text}
              </span>
            )}
          </div>
          <div className="task-row-meta">
            {closed ? (
              <>
                <OriginBadge task={t} />
                <span className="meta-spacer" />
                <button
                  type="button"
                  className="mini-btn"
                  title="从列表移除（软删除，导出备份中仍可找回）"
                  onClick={() => {
                    if (window.confirm(`删除「${t.title}」？（软删除，导出备份中仍可找回）`)) void remove(t.id)
                  }}
                >
                  删除
                </button>
              </>
            ) : (
              <>
                <select
                  className="lane-select"
                  data-testid="lane-select"
                  data-lane={lane}
                  value={lane}
                  aria-label={`调整分类：${t.title}`}
                  title="调整分类（选定后以手动为准）"
                  onChange={(e) => void setLane(t.id, Number(e.target.value) as TaskLane)}
                >
                  <option value={1}>一类 · 今天必须做</option>
                  <option value={2}>二类 · 卡住别人的</option>
                  <option value={3}>三类 · 可以绕开我</option>
                </select>
                <OriginBadge task={t} />
                <span className="meta-spacer" />
                <button type="button" className="mini-btn" title="期限顺延 7 天" onClick={() => void postpone(t.id, 7)}>
                  推迟
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  title="不做了但保留记录，可随时恢复"
                  onClick={() => {
                    if (window.confirm(`放弃「${t.title}」？它会移入下方"已结束"区，随时可恢复。`)) void setStatus(t.id, 'dropped')
                  }}
                >
                  放弃
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  title="从列表移除（软删除，导出备份中仍可找回）"
                  onClick={() => {
                    if (window.confirm(`删除「${t.title}」？（软删除，导出备份中仍可找回）`)) void remove(t.id)
                  }}
                >
                  删除
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderLaneSection = (lane: TaskLane) => {
    const meta = LANE_META[lane]
    const list = laneLists.byLane[lane]
    return (
      <div className="lane-col" data-lane={lane}>
        <h3 style={{ fontSize: 'var(--fs-md)', margin: '0 0 var(--sp-2)' }} title={meta.rule}>
          <span className="lane-dot" aria-hidden />
          {meta.name}
          <span className="lane-count">{list.length}</span>
        </h3>
        <div className="task-card">
          {list.length === 0 ? (
            <div style={{ padding: 'var(--sp-3) var(--sp-4)', color: 'var(--ink-faint)', fontSize: 'var(--fs-sm)' }}>（无）</div>
          ) : (
            list.map((t) => renderRow(t))
          )}
        </div>
      </div>
    )
  }

  const doneClosed = laneLists.closed.filter((t) => t.status === 'done').length
  const droppedClosed = laneLists.closed.length - doneClosed

  return (
    <section>
      <div className="page-head">
        <h1>待办</h1>
        <span className="sub">勾选＝闭环，再点＝恢复 · 分类在行内下拉里改 · 不做了点「放弃」留底</span>
        <div className="right">
          <button type="button" className="btn-ghost" disabled={scanBusy} onClick={() => void runScan()} data-testid="scan-todos">
            {scanBusy ? '⟳ 扫描中…' : '⭳ 从项目扫描待办'}
          </button>
        </div>
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

      {laneLists.closed.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)', margin: 'var(--sp-4) 0 var(--sp-2)' }}>
            <h3 style={{ fontSize: 'var(--fs-md)', margin: 0 }}>
              已结束
              <span className="lane-count">
                {doneClosed} 闭环 · {droppedClosed} 放弃
              </span>
            </h3>
            <span className="sub">点复选框可恢复为进行中</span>
          </div>
          <div className="task-card">
            {laneLists.closed.map((t) => renderRow(t))}
          </div>
        </>
      )}

      <div className="stats-line">
        总闭环率 <b>{closedRate}%</b>（{stats.done}/{stats.total}）
      </div>
    </section>
  )
}
