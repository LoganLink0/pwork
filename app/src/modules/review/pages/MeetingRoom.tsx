import { useEffect } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { getTemplate } from '../content/templates'
import { DETAIL, MEETING, WIZARD } from '../content/copy'
import { useDraft } from '../store/draft'
import { deleteReview } from '../db/repo'
import type { MeetingRoles, ReviewRecord } from '../types/models'
import { StepComparison } from '../components/wizard/StepComparison'
import { StepLogic } from '../components/wizard/StepLogic'
import { CldBuilder } from '../components/cld/CldBuilder'
import { StepAcknowledge } from '../components/wizard/StepAcknowledge'
import { StepProject } from '../components/wizard/StepProject'
import { PhaseTimer } from '../components/meeting/PhaseTimer'
import { CollectPanel } from '../components/meeting/CollectPanel'
import { MeetingWall } from '../components/meeting/MeetingWall'
import { GuideAside, type GuideItem } from '../components/wizard/GuideAside'

const PHASE_TIPS = [
  'psychological-safety',
  'loss-aversion',
  'conformity',
  'controllability',
  'insight-card',
  'action-card',
  'retrieval-practice',
]

const PHASE_PURPOSES = [
  '磨刀不误砍柴工：角色到人、资料备齐、守则上墙。',
  '先处理心情，再处理事情——破冰不可跳过。',
  '让事实替记忆说话：先各自写，再一起亮。',
  '每条原因都要过"可控性"这一关。',
  '追问最关键的因素，把原因升华为认知。',
  '停止/继续/开始，给每件事装上扳机。',
  '会议记录归档，四件套闭环。',
]

/** 会议各阶段的侧栏进度清单 */
function phaseGuideItems(phase: number, d: ReviewRecord): GuideItem[] {
  const m = d.meeting
  const c = d.clap
  const filledRoles = m ? Object.values(m.roles).filter((v) => v.trim() !== '').length : 0
  switch (phase) {
    case 0:
      return [
        { label: `角色已到人（${filledRoles}/6）`, done: filledRoles === 6 },
        { label: `资料清单已过（${m?.checklist.length ?? 0}/5）`, done: (m?.checklist.length ?? 0) > 0 },
      ]
    case 1:
      return [
        { label: '原则已宣读（客观/开放/中立）', done: true },
        { label: '议程已同步全员', done: true },
      ]
    case 2:
      return [
        { label: `目标已回顾（${c.comparison.goals.length}）`, done: c.comparison.goals.length > 0 },
        { label: `结果已上墙（${c.comparison.results.length}）`, done: c.comparison.results.length > 0 },
        { label: `便利贴已亮牌（${c.comparison.gaps.length} 张）`, done: !!m?.collected && c.comparison.gaps.length > 0 },
      ]
    case 3: {
      const cldCount = c.logic.cld?.nodes.length ?? 0
      const causeCount = c.logic.causes.filter((x) => x.text.trim()).length
      return [
        { label: `原因 / 图节点已列出（${causeCount + cldCount}）`, done: causeCount > 0 || cldCount > 0 },
        { label: '可控性已标记', done: c.logic.causes.length > 0 || cldCount > 0 },
      ]
    }
    case 4:
      return [
        { label: `洞察已记录（${c.acknowledge.insights.length}）`, done: c.acknowledge.insights.some((i) => i.text.trim()) },
        { label: '双环检视已回答', done: c.acknowledge.goalValid || c.acknowledge.doubleLoopNote.trim() !== '' },
      ]
    case 5:
      return [
        { label: `行动卡（${c.project.actions.length}）`, done: c.project.actions.some((a) => a.text.trim()) },
        { label: '都有执行意图', done: c.project.actions.length > 0 && c.project.actions.every((a) => (a.ifThen ?? '').trim() !== '') },
      ]
    case 6:
      return [{ label: `会议记录（${m?.minutes.trim() ? '已写' : '待记录人'}）`, done: !!m?.minutes.trim() }]
    default:
      return []
  }
}

/** 会议各阶段的放行条件（先僵化：内容不缺位才放行） */
export function meetingPhaseValid(phase: number, d: ReviewRecord): boolean {
  const m = d.meeting
  const c = d.clap
  switch (phase) {
    case 0:
      return !!m && Object.values(m.roles).every((v) => v.trim() !== '')
    case 1:
      return true
    case 2:
      return !!m?.collected && c.comparison.gaps.length > 0
    case 3:
      return (
        c.logic.causes.some((x) => x.text.trim()) || (c.logic.cld?.nodes.length ?? 0) > 0
      )
    case 4:
      return c.acknowledge.insights.some((i) => i.text.trim())
    case 5:
      return c.project.actions.some((a) => a.text.trim())
    case 6:
      return !!m && m.minutes.trim() !== ''
    default:
      return false
  }
}

export function MeetingRoom() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const templateId = params.get('template') ?? 'team-project'
  const resumeId = params.get('resume')
  const template = getTemplate(templateId)

  const draft = useDraft((s) => s.draft)
  const startDraft = useDraft((s) => s.startDraft)
  const loadDraft = useDraft((s) => s.loadDraft)
  const updateMeeting = useDraft((s) => s.updateMeeting)
  const archive = useDraft((s) => s.archive)

  useEffect(() => {
    const d = useDraft.getState().draft
    if (resumeId) {
      if (!d || d.id !== resumeId) void loadDraft(resumeId)
      return
    }
    if (!template) return
    if (!d || d.templateId !== template.id || d.status === 'archived') {
      void startDraft({
        templateId: template.id,
        type: template.type,
        scenario: template.scenario,
        title: `${template.name} · ${new Date().toLocaleDateString('zh-CN')}`,
        quick: false,
      })
    }
    // 刻意只依赖 URL 参数（同 Wizard）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, resumeId])

  const phase = draft?.meeting?.phase ?? 0
  const draftReady = draft !== null && (resumeId ? draft.id === resumeId : draft.templateId === templateId)
  const valid = draft && draftReady ? meetingPhaseValid(phase, draft) : false

  function setPhase(p: number) {
    void updateMeeting((m) => ({ ...m, phase: p }))
  }

  const m = draft?.meeting
  const goodCount = draft ? draft.clap.comparison.gaps.filter((g) => g.good).length : 0
  const needCount = draft ? draft.clap.comparison.gaps.filter((g) => !g.good).length : 0

  // 个人模板必须走个人向导（路由守卫）
  if (template && template.mode !== 'meeting') {
    return <Navigate to={`/review/wizard?template=${templateId}`} replace />
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
        <div className="kicker">复盘会议室 · 单设备投屏模式</div>
        <h1>{template?.name ?? '复盘会'}</h1>
        {template && <p className="coach-say">{template.tagline}</p>}
      </header>

      {/* 阶段导航：已走过的阶段可回跳 */}
      <ol className="stepper" aria-label="会议阶段">
        {MEETING.phases.map((name, i) => (
          <li key={name} className={i === phase ? 'on' : i < phase ? 'done' : ''}>
            <button type="button" disabled={i >= phase} onClick={() => setPhase(i)} aria-current={i === phase ? 'step' : undefined}>
              <span className="step-key tnum" aria-hidden>
                {i < phase ? '✓' : i + 1}
              </span>
              <span className="step-name">{name}</span>
            </button>
          </li>
        ))}
      </ol>

      {!draftReady && <p className="coach-say">正在布置会议室……</p>}

      {draftReady && (
        <div className="wizard-grid">
          <div className="wizard-main">
            {/* ---------- 0 会前准备 ---------- */}
            {phase === 0 && m && (
        <div>
          <section className="detail-section">
            <h2>{MEETING.rolesTitle}</h2>
            {MEETING.roles.map((role) => (
              <div key={role.key} className="role-row">
                <label className="field-label" htmlFor={`role-${role.key}`}>
                  <span>{role.name}</span>
                </label>
                <input
                  id={`role-${role.key}`}
                  className="input"
                  value={m.roles[role.key as keyof MeetingRoles]}
                  placeholder={`${role.name}是谁？`}
                  aria-label={`${role.name}是谁？`}
                  onChange={(e) =>
                    void updateMeeting((meta) => ({
                      ...meta,
                      roles: { ...meta.roles, [role.key]: e.target.value },
                    }))
                  }
                />
                <p className="coach-say">{role.hint}</p>
              </div>
            ))}
            {!meetingPhaseValid(0, draft!) && <p className="hint-warn">{MEETING.rolesMissing}</p>}
          </section>

          <section className="detail-section">
            <h2>{MEETING.checklistTitle}</h2>
            {MEETING.checklist.map((item) => (
              <label key={item} className="dc-item">
                <input
                  type="checkbox"
                  checked={m.checklist.includes(item)}
                  onChange={() =>
                    void updateMeeting((meta) => ({
                      ...meta,
                      checklist: meta.checklist.includes(item)
                        ? meta.checklist.filter((x) => x !== item)
                        : [...meta.checklist, item],
                    }))
                  }
                />
                <span>{item}</span>
              </label>
            ))}
          </section>

          <section className="detail-section">
            <h2>{MEETING.rulesTitle}</h2>
            <div className="seg">
              {MEETING.principles.map((p) => (
                <span key={p} className="seg-item seg-item--on">
                  {p}
                </span>
              ))}
            </div>
            <p className="coach-say">手机静音、发言举手、不迟到不超时——纪律官今天说了算。</p>
          </section>
        </div>
      )}

      {/* ---------- 1 破冰 ---------- */}
      {draftReady && phase === 1 && (
        <div>
          <section className="detail-section">
            <h2>
              破冰 <PhaseTimer minutes={10} label="破冰" />
            </h2>
            <p>{MEETING.icebreak}</p>
            <div className="seg">
              {MEETING.principles.map((p) => (
                <span key={p} className="seg-item seg-item--on">
                  {p}
                </span>
              ))}
            </div>
            <p className="coach-say">引导者宣读会议目的与意义；主持人告知日程；破冰不可跳过，但可以缩短。</p>
          </section>

          <section className="detail-section">
            <h2>{MEETING.agendaTitle}</h2>
            <ol className="agenda-list">
              {MEETING.agenda.map((a) => (
                <li key={a.name}>
                  <strong>{a.name}</strong>
                  <span className="tnum coach-say">（约 {a.minutes} 分钟）</span>
                  <span className="coach-say">—— {a.desc}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      {/* ---------- 2 事实比较 ---------- */}
      {draftReady && phase === 2 && (
        <div>
          <section className="detail-section">
            <h2>
              回顾目标与结果 <PhaseTimer minutes={MEETING.agenda[1].minutes} label="事实比较" />
            </h2>
            <p className="coach-say">
              引导者先问："我们做这件事的初心是什么？原定目标是什么？"先两两交流，再由负责人归纳上墙。
            </p>
            <StepComparison quick={false} showGaps={false} />
          </section>
          <CollectPanel />
          <MeetingWall />
        </div>
      )}

      {/* ---------- 3 分析原因 ---------- */}
      {draftReady && phase === 3 && (
        <div>
          <section className="detail-section">
            <h2>
              分析原因：可控性分析 <PhaseTimer minutes={MEETING.agenda[2].minutes} label="分析原因" />
            </h2>
            <div className="hint-warn">{MEETING.causeRule(needCount, goodCount)}</div>
            {(goodCount > 6 || needCount > 6) && <p className="hint-warn">{MEETING.voteHint}</p>}
            <StepLogic quick={false} />
            <CldBuilder />
          </section>
        </div>
      )}

      {/* ---------- 4 洞察规律 ---------- */}
      {draftReady && phase === 4 && (
        <div>
          <section className="detail-section">
            <h2>
              洞察规律：什么才是最关键的？ <PhaseTimer minutes={MEETING.agenda[3].minutes} label="洞察规律" />
            </h2>
            <div className="hint-warn">{MEETING.insightHint}</div>
            <StepAcknowledge quick={false} />
          </section>
        </div>
      )}

      {/* ---------- 5 制定计划 ---------- */}
      {draftReady && phase === 5 && (
        <div>
          <section className="detail-section">
            <h2>
              制定计划 <PhaseTimer minutes={MEETING.agenda[4].minutes} label="制定计划" />
            </h2>
            <p className="coach-say">错误的事停下来，正确的事继续做，有利的事开始做——行动计划尽量用 3W（何时/谁/何事）。</p>
            <StepProject quick={false} />
          </section>
        </div>
      )}

      {/* ---------- 6 归档 ---------- */}
      {draftReady && phase === 6 && m && (
        <div>
          <section className="detail-section">
            <h2>{MEETING.minutesLabel}</h2>
            <textarea
              className="input"
              rows={6}
              value={m.minutes}
              placeholder={MEETING.minutesPlaceholder}
              aria-label={MEETING.minutesLabel}
              onChange={(e) => void updateMeeting((meta) => ({ ...meta, minutes: e.target.value }))}
            />
            <p className="coach-say">
              归档四件套：会议记录（上面）、目标与结果比较、新的认知、下一步行动——全部自动进入这份档案。
            </p>
          </section>
        </div>
      )}

          </div>

          {draft && (
            <GuideAside
              kicker={`第 ${phase + 1} / 7 阶段`}
              title={MEETING.phases[phase]}
              purpose={PHASE_PURPOSES[phase]}
              items={phaseGuideItems(phase, draft)}
              tipId={PHASE_TIPS[phase]}
            />
          )}
        </div>
      )}

      {/* ---------- 底部导航 ---------- */}
      {draftReady && (
        <div className="wizard-foot">
          {draft && draft.status === 'in-progress' && (
            <button className="btn-ghost btn-danger" onClick={abandonDraft}>
              {DETAIL.abandon}
            </button>
          )}
          {phase > 0 && (
            <button className="btn-ghost" onClick={() => setPhase(phase - 1)}>
              {WIZARD.prev}
            </button>
          )}
          {phase < 6 ? (
            <button
              className="btn-primary"
              disabled={phase === 1 ? false : !valid}
              onClick={() => setPhase(phase + 1)}
            >
              {phase === 0 ? MEETING.prepNext : phase === 1 ? MEETING.icebreakDone : WIZARD.next}
            </button>
          ) : (
            <button
              className="btn-primary"
              disabled={!valid}
              title={valid ? undefined : '会议记录是归档四件套之一，先请记录人填好。'}
              onClick={async () => {
                const id = await archive()
                if (id) navigate(`/review/archive/${id}`)
              }}
            >
              {MEETING.archiveBtn}
            </button>
          )}
        </div>
      )}
      {draftReady && phase === 6 && !valid && <p className="hint-warn">会议记录还没填——记录人，该你了。</p>}
    </div>
  )
}
