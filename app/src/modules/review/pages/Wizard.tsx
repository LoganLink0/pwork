import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { getTemplate } from '../content/templates'
import { getPack } from '../content/scenario-packs'
import { CLAP_STEPS, DETAIL, MODE_LABEL, WIZARD } from '../content/copy'
import { useDraft } from '../store/draft'
import { deleteReview } from '../db/repo'
import { getNote } from '../../../db/repo'
import { Link } from 'react-router-dom'
import type { ReviewRecord } from '../types/models'
import { StepComparison } from '../components/wizard/StepComparison'
import { StepLogic } from '../components/wizard/StepLogic'
import { StepAcknowledge } from '../components/wizard/StepAcknowledge'
import { StepProject } from '../components/wizard/StepProject'
import { GuideAside, type GuideItem } from '../components/wizard/GuideAside'

const STEP_TIPS = ['hindsight', 'controllability', 'insight-card', 'action-card']

/** 侧栏进度清单：每一步的"带到了没有" */
function stepGuideItems(step: number, d: ReviewRecord): GuideItem[] {
  const c = d.clap
  switch (step) {
    case 0:
      return [
        { label: `目标已锁定（${c.comparison.goals.filter((g) => g.text.trim()).length}）`, done: c.comparison.goals.some((g) => g.text.trim()) },
        { label: `结果已记录（${c.comparison.results.filter((r) => r.text.trim()).length}）`, done: c.comparison.results.some((r) => r.text.trim()) },
        { label: `差异已标注（${c.comparison.gaps.length}）`, done: c.comparison.gaps.length > 0 },
      ]
    case 1: {
      const cldCount = c.logic.cld?.nodes.length ?? 0
      const causeCount = c.logic.causes.filter((x) => x.text.trim()).length
      return [
        { label: `原因 / 图节点已列出（${causeCount + cldCount}）`, done: causeCount > 0 || cldCount > 0 },
        { label: '可控性已标记', done: c.logic.causes.length > 0 || cldCount > 0 },
        { label: '深挖过至少一层', done: c.logic.causes.some((x) => x.depth.some((w) => w.trim())) },
      ]
    }
    case 2:
      return [
        { label: `洞察已记录（${c.acknowledge.insights.filter((i) => i.text.trim()).length}）`, done: c.acknowledge.insights.some((i) => i.text.trim()) },
        { label: '双环检视已回答', done: c.acknowledge.goalValid || c.acknowledge.doubleLoopNote.trim() !== '' },
      ]
    case 3:
      return [
        { label: `行动卡（${c.project.actions.filter((a) => a.text.trim()).length}）`, done: c.project.actions.some((a) => a.text.trim()) },
        { label: '都有执行意图（如果…就…）', done: c.project.actions.length > 0 && c.project.actions.every((a) => (a.ifThen ?? '').trim() !== '') },
      ]
    default:
      return []
  }
}

/** 每步的放行条件：内容必须真实存在，防止"走过场"（PRD 2.3 反刍防护） */
function stepValid(step: number, d: ReviewRecord): boolean {
  const c = d.clap
  switch (step) {
    case 0:
      return (
        c.comparison.goals.some((g) => g.text.trim()) &&
        c.comparison.results.some((r) => r.text.trim()) &&
        c.comparison.gaps.length > 0
      )
    case 1:
      return (
        c.logic.causes.some((x) => x.text.trim()) || (c.logic.cld?.nodes.length ?? 0) > 0
      )
    case 2:
      return c.acknowledge.insights.some((i) => i.text.trim())
    case 3:
      return c.project.actions.some((a) => a.text.trim())
    default:
      return false
  }
}

function clapIsEmpty(d: ReviewRecord): boolean {
  const c = d.clap
  return (
    c.comparison.goals.length === 0 &&
    c.comparison.results.length === 0 &&
    c.comparison.gaps.length === 0 &&
    c.logic.causes.length === 0 &&
    c.acknowledge.insights.length === 0 &&
    c.project.actions.length === 0
  )
}

/** 3 分钟倒计时：只提示不强制（快答版是节奏，不是考试） */
function QuickTimer() {
  const [left, setLeft] = useState(180)
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [])
  if (left <= 0) return <span className="coach-say">{WIZARD.quickTimeUp}</span>
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  return (
    <span className="timer tnum" role="timer" aria-label="剩余时间">
      ⏱ {mm}:{ss}
    </span>
  )
}

/** 挂载速记条：向导内随时看到这次复盘带着哪条速记来 */
function AttachedNoteChips({ ids }: { ids: string[] }) {
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
    <div className="seg" style={{ marginTop: 'var(--sp-2)' }} aria-label="挂载的速记">
      {ids.map((id) => (
        <Link key={id} className="seg-item seg-item--on" to={`/input/notes/${id}`} style={{ textDecoration: 'none' }}>
          ✎ {titles[id] ?? id}
        </Link>
      ))}
    </div>
  )
}

export function Wizard() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const templateId = params.get('template') ?? 'personal-daily'
  const resumeId = params.get('resume')
  const quick = params.get('mode') === 'quick'
  const noteParam = params.get('note') ?? ''
  const template = getTemplate(templateId)

  const draft = useDraft((s) => s.draft)
  const step = useDraft((s) => s.step)
  const setStep = useDraft((s) => s.setStep)
  const startDraft = useDraft((s) => s.startDraft)
  const loadDraft = useDraft((s) => s.loadDraft)
  const archive = useDraft((s) => s.archive)

  // 键盘 ←→ 切步（输入时不响应）
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      const cur = useDraft.getState()
      if (!cur.draft) return
      if (e.key === 'ArrowRight') {
        const d = cur.draft
        const step = cur.step
        if (step < 3 && stepValid(step, d)) {
          e.preventDefault()
          cur.setStep(step + 1)
        }
      } else if (e.key === 'ArrowLeft') {
        if (cur.step > 0) {
          e.preventDefault()
          cur.setStep(cur.step - 1)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const d = useDraft.getState().draft
    if (resumeId) {
      if (!d || d.id !== resumeId) void loadDraft(resumeId)
      return
    }
    if (!template) return
    if (!d || d.templateId !== template.id || d.status === 'archived' || d.quick !== quick) {
      void startDraft({
        templateId: template.id,
        type: template.type,
        scenario: template.scenario,
        title: `${template.name} · ${new Date().toLocaleDateString('zh-CN')}`,
        quick,
        noteIds: noteParam ? [noteParam] : undefined,
      })
    }
    // 刻意只依赖 URL 参数：草稿状态一律从 getState 读取，避免创建竞态
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, resumeId, quick, noteParam])

  // 归档后不再展示表单（防止向已归档档案继续写入）；resume 到已归档草稿直接进只读档案页
  const draftReady = draft !== null && (resumeId ? draft.id === resumeId : draft.templateId === templateId)
  const draftStatus = draft?.status
  useEffect(() => {
    if (resumeId && draftStatus === 'archived') navigate(`/review/archive/${resumeId}`, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在 resume 载入到已归档草稿时触发一次
  }, [resumeId, draftStatus])
  const stepNodes = draftReady ? (
    <>
      {step === 0 && <StepComparison quick={quick} />}
      {step === 1 && <StepLogic quick={quick} />}
      {step === 2 && <StepAcknowledge quick={quick} />}
      {step === 3 && <StepProject quick={quick} />}
    </>
  ) : (
    <p className="coach-say">正在铺开白板……</p>
  )

  const valid = draft && draftReady ? stepValid(step, draft) : false
  const canArchive = draft ? draft.clap.project.actions.some((a) => a.text.trim()) : false

  const modeSwitchable = template?.quick && draft && draftReady && clapIsEmpty(draft)

  // 会议模板必须走会议室（路由守卫）；无效模板直接告知而非永远"正在铺开白板"
  if (template && template.mode === 'meeting') {
    return <Navigate to={`/review/meeting?template=${templateId}`} replace />
  }
  if (!template) {
    return (
      <div className="container">
        <div className="empty">
          <p>没有找到这个复盘场景（链接可能已过期）。从「新建复盘」重新选一个场景开始。</p>
          <Link to="/review/new" className="btn-ghost">去新建复盘</Link>
        </div>
      </div>
    )
  }

  async function abandonDraft() {
    const d = useDraft.getState().draft
    if (!d || !window.confirm(DETAIL.confirmDelete)) return
    await deleteReview(d.id)
    useDraft.setState({ draft: null, step: 0 })
    navigate('/review')
  }

  return (
    <div className="container">
      <header className="page-head">
        <div className="kicker">
          复盘工作台 · {template ? MODE_LABEL[quick ? 'quick' : 'full'] : ''} {quick && <QuickTimer />}
        </div>
        <h1>{draftReady && draft ? draft.title : template?.name ?? '复盘'}</h1>
        {template && (
          <p className="coach-say">{getPack(draft?.scenario ?? template.scenario)?.intro ?? WIZARD.modeHint}</p>
        )}
        {draftReady && draft?.noteIds?.length ? <AttachedNoteChips ids={draft.noteIds} /> : null}
        {modeSwitchable && (
          <div className="seg" role="radiogroup" aria-label="模式切换">
            {([false, true] as const).map((q) => (
              <button
                key={String(q)}
                type="button"
                role="radio"
                aria-checked={quick === q}
                className={`seg-item ${quick === q ? 'seg-item--on' : ''}`}
                onClick={() =>
                  setParams(q ? { template: templateId, mode: 'quick' } : { template: templateId })
                }
              >
                {q ? MODE_LABEL.quick : MODE_LABEL.full}
              </button>
            ))}
          </div>
        )}
      </header>

      <ol className="stepper" aria-label="CLAP 四步进度">
        {CLAP_STEPS.map((s, i) => (
          <li key={s.key} className={i === step ? 'on' : i < step ? 'done' : ''}>
            <button type="button" disabled={i >= step} onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}>
              <span className="step-key tnum" aria-hidden>
                {i < step ? '✓' : s.key}
              </span>
              <span className="step-name">{s.name}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="wizard-grid">
        <div className="wizard-main">
          {stepNodes}

          <div className="wizard-foot">
            {draft && draft.status === 'in-progress' && (
              <button className="btn-ghost btn-danger" onClick={abandonDraft}>
                {DETAIL.abandon}
              </button>
            )}
            {step > 0 && (
              <button className="btn-ghost" onClick={() => setStep(step - 1)}>
                {WIZARD.prev}
              </button>
            )}
            {step < 3 ? (
              <button className="btn-primary" disabled={!valid} onClick={() => setStep(step + 1)}>
                {WIZARD.next}
              </button>
            ) : (
              <button
                className="btn-primary"
                disabled={!canArchive}
                title={!canArchive ? WIZARD.archiveHint : undefined}
                onClick={async () => {
                  const id = await archive()
                  if (id) navigate(`/review/archive/${id}`)
                }}
              >
                {WIZARD.archive}
              </button>
            )}
          </div>
          {step === 3 && !canArchive && <p className="hint-warn">{WIZARD.archiveHint}</p>}
        </div>

        {draft && (
          <GuideAside
            kicker={`第 ${step + 1} / 4 步`}
            title={CLAP_STEPS[step].name}
            purpose={CLAP_STEPS[step].goal}
            items={stepGuideItems(step, draft)}
            tipId={STEP_TIPS[step]}
          />
        )}
      </div>
    </div>
  )
}
