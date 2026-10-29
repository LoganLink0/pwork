import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ARCHIVE, DETAIL, GREETING, MEETING, SCENARIO_LABEL } from '../content/copy'
import { reviewToMarkdown } from '../engine/markdown'
import { fmtLocal } from '../engine/datetime'
import { deleteReview, getReview, listActionsByReview } from '../db/repo'
import { getNote } from '../../../db/repo'
import type { ActionItem, ReviewRecord } from '../types/models'
import { DeltaBadge } from '../components/ui/DeltaBadge'
import { CONTROL_LABEL, CONFIDENCE_LABEL } from '../content/copy'
import { DoubleCheckPanel } from '../components/doublecheck/DoubleCheckPanel'
import { Icon } from '../../../components/shell/icons'

/** 挂载速记条：档案页回看这次复盘带着哪条速记来 */
function AttachedNotes({ ids }: { ids: string[] }) {
  const [titles, setTitles] = useState<Record<string, string>>({})
  // ids 是调用方每次渲染重建的数组，用内容键驱动拉取（内容不变不重拉）
  const idsKey = ids.join(',')
  useEffect(() => {
    const list = idsKey === '' ? [] : idsKey.split(',')
    void Promise.all(list.map((id) => getNote(id).then((n) => [id, n?.title || '（已删除的速记）'] as const))).then((pairs) => {
      setTitles(Object.fromEntries(pairs))
    })
  }, [idsKey])
  return (
    <div className="seg" aria-label="挂载的速记">
      {ids.map((id) => (
        <Link key={id} className="seg-item seg-item--on" to={`/input/notes/${id}`} style={{ textDecoration: 'none' }}>
          <Icon name="pen" size={12} /> {titles[id] ?? id}
        </Link>
      ))}
    </div>
  )
}

/** 档案详情：小结 3 条 + 思考题 + 四环节回看 + Markdown 导出（归档四件套的产品化） */
export function ArchiveDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [rec, setRec] = useState<ReviewRecord | null>(null)
  const [missing, setMissing] = useState(false)
  const [exported, setExported] = useState(false)
  const [actions, setActions] = useState<ActionItem[]>([])

  useEffect(() => {
    // 无 id 的渲染分支直接由下面的 missing 判定覆盖（!id && !rec 时显示"没有档案"），不进 effect
    let live = true
    if (!id) return
    void getReview(id).then((r) => {
      if (!live) return
      if (r) setRec(r)
      else setMissing(true)
    })
    void listActionsByReview(id).then((a) => {
      if (live) setActions(a)
    })
    return () => {
      live = false
    }
  }, [id])

  if (missing || (!id && !rec))
    return (
      <div className="container">
        <p className="coach-say">{GREETING.emptyReviews}</p>
        <Link to="/">{DETAIL.back}</Link>
      </div>
    )
  if (!rec) return <div className="container"><p className="coach-say">正在打开档案……</p></div>

  const c = rec.clap

  function onExport() {
    const md = reviewToMarkdown(rec!)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${rec!.title}.md`
    a.click()
    URL.revokeObjectURL(url)
    setExported(true)
  }

  async function onDelete() {
    if (!window.confirm(DETAIL.confirmDelete)) return
    await deleteReview(rec!.id)
    navigate('/review')
  }

  async function refresh() {
    if (!id) return
    const r = await getReview(id)
    if (r) setRec(r)
  }

  const summaryColors = ['good', 'need', 'insight'] as const

  return (
    <div className="container">
      <header className="page-head">
        <div className="kicker">
          复盘档案 · {SCENARIO_LABEL[rec.scenario]} · {fmtLocal(rec.createdAt)} ·{' '}
          {rec.quick ? '3分钟快答' : '完整版'} · {rec.status === 'archived' ? DETAIL.archived : DETAIL.inProgress}
        </div>
        <h1>{rec.title}</h1>
        <p className="coach-say">{ARCHIVE.done}</p>
        {rec.noteIds?.length ? <AttachedNotes ids={rec.noteIds} /> : null}
      </header>

      <section className="detail-section">
        <h2>小结</h2>
        {rec.summary.length ? (
          rec.summary.map((s, i) => (
            <div key={i} className={`sticky sticky--${summaryColors[i % 3]}`} style={{ '--tilt': '0deg' } as React.CSSProperties}>
              <div className="sticky-tagline">{s}</div>
            </div>
          ))
        ) : (
          <p className="coach-say">这份档案还没走到归档，小结会在归档时自动生成。</p>
        )}
      </section>

      {rec.thinkingQuestion && (
        <section className="detail-section">
          <h2>{DETAIL.thinking}</h2>
          <p className="coach-say">{rec.thinkingQuestion}</p>
        </section>
      )}

      {rec.meeting && (
        <section className="detail-section">
          <h2>会议记录</h2>
          <p className="coach-say">
            {MEETING.roles
              .map((r) => `${r.name}：${rec.meeting!.roles[r.key] || '—'}`)
              .join(' ｜ ')}
          </p>
          <p>{rec.meeting.minutes || '（记录人还没填）'}</p>
        </section>
      )}

      <section className="detail-section">
        <h2>一、对比</h2>
        <p>
          <strong>目标：</strong>
          {c.comparison.goals.map((g) => g.text || '（未填写）').join('；') || '（无）'}
        </p>
        <p>
          <strong>结果：</strong>
          {c.comparison.results.map((r) => r.text || '（未填写）').join('；') || '（无）'}
        </p>
        {c.comparison.gaps.map((gap, i) => (
          <p key={i} className="tnum">
            <DeltaBadge delta={gap.delta} /> {gap.good ? '做得好' : '待提升'}
          </p>
        ))}
      </section>

      <section className="detail-section">
        <h2>二、逻辑</h2>
        {c.logic.causes.length ? (
          c.logic.causes.map((cause, i) => (
            <p key={i}>
              {CONTROL_LABEL[cause.controllability].mark} {CONTROL_LABEL[cause.controllability].name}｜
              {cause.text || '（未填写）'}
              {cause.depth.filter((w) => w.trim()).length > 0 && (
                <span className="coach-say"> →追问 {cause.depth.filter((w) => w.trim()).length} 层</span>
              )}
            </p>
          ))
        ) : (
          <p className="coach-say">（未展开）</p>
        )}
      </section>

      <section className="detail-section">
        <h2>三、认知</h2>
        {c.acknowledge.insights.length ? (
          c.acknowledge.insights.map((ins, i) => (
            <p key={i}>
              【{ins.kind === 'inductive' ? '归纳·待验证' : '演绎·确定'}】{ins.text || '（未填写）'}
              {ins.confidence > 0 && (
                <span className="coach-say">（信心：{CONFIDENCE_LABEL[ins.confidence]}）</span>
              )}
            </p>
          ))
        ) : (
          <p className="coach-say">（无认知更新）</p>
        )}
        <p className="coach-say">
          双环检视：{c.acknowledge.goalValid ? '当初的目标本身成立' : '当初的目标本身需要调整'}
          {c.acknowledge.doubleLoopNote ? `——${c.acknowledge.doubleLoopNote}` : ''}
        </p>
      </section>

      <section className="detail-section">
        <h2>四、规划</h2>
        {c.project.actions.length ? (
          c.project.actions.map((a, i) => (
            <p key={i}>
              <span aria-hidden style={{ display: 'inline-flex', verticalAlign: '-3px', marginRight: 4, color: a.kind === 'stop' ? 'var(--cat-action)' : a.kind === 'continue' ? 'var(--cat-good)' : 'var(--accent-text)' }}>
                <Icon name={a.kind === 'stop' ? 'stop' : a.kind === 'continue' ? 'done' : 'play'} size={14} />
              </span>
              {a.text || '（未填写）'}
              {a.ifThen?.trim() && <span className="coach-say">（执行意图：{a.ifThen}）</span>}
              {a.due && <span className="tnum coach-say">（期限 {a.due}）</span>}
            </p>
          ))
        ) : (
          <p className="coach-say">（无行动卡）</p>
        )}
        {actions.length > 0 && (
          <p className="coach-say">
            {DETAIL.whereabouts}：
            {actions
              .map((a) => {
                const label =
                  a.status === 'done'
                    ? `${DETAIL.actionStatus.done}${a.closedAt ? `（${fmtLocal(a.closedAt)}）` : ''}`
                    : a.status === 'dropped'
                      ? DETAIL.actionStatus.dropped
                      : `${DETAIL.actionStatus.open}${a.due ? `（期限 ${a.due}）` : ''}`
                return `「${a.text}」${label}`
              })
              .join('；')}
            ——在仪表盘的待办里可以完成或改期它们。
          </p>
        )}
      </section>

      {rec.status === 'archived' && (
        <div className="DoubleCheck-hide-on-print">
          <DoubleCheckPanel rec={rec} onSaved={refresh} />
        </div>
      )}

      <div className="wizard-foot">
        <button className="btn-ghost" onClick={() => window.print()}>
          打印 / 存 PDF
        </button>
        <button className="btn-primary" onClick={onExport}>
          {DETAIL.export}
        </button>
        <button className="btn-ghost btn-danger" onClick={onDelete}>
          {DETAIL.delete}
        </button>
      </div>
      {exported && (
        <p className="coach-say" role="status">
          {DETAIL.exported}
        </p>
      )}
      <p style={{ marginTop: 'var(--sp-5)' }}>
        <Link to="/">{DETAIL.back}</Link>
      </p>
    </div>
  )
}
