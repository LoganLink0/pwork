import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CONTROL_LABEL, DELTA_LABEL, CONFIDENCE_LABEL, HELP } from '../content/copy'
import { EXAMPLE_META, EXAMPLE_UBER_CLD, buildExampleClap } from '../content/example'
import { Icon } from '../../../components/shell/icons'
import { useDraft } from '../../store/draft'
import { CldCanvas } from '../components/cld/CldCanvas'
import { DeltaBadge } from '../components/ui/DeltaBadge'
import { KnowledgeCapsule } from '../components/ui/KnowledgeCapsule'

const KIND_MARK = {
  stop: { icon: 'stop', color: 'var(--cat-action)' },
  continue: { icon: 'done', color: 'var(--cat-good)' },
  start: { icon: 'play', color: 'var(--accent-text)' },
} as const

function KindMark({ kind }: { kind: keyof typeof KIND_MARK }) {
  return (
    <span aria-hidden style={{ display: 'inline-flex', verticalAlign: '-3px', marginRight: 4, color: KIND_MARK[kind].color }}>
      <Icon name={KIND_MARK[kind].icon} size={14} />
    </span>
  )
}

/** 帮助页：以「小林的周复盘」完整示例引导新用户走一遍 CLAP */
export function Help() {
  const navigate = useNavigate()
  const startDraft = useDraft((s) => s.startDraft)
  const update = useDraft((s) => s.update)
  const updateClap = useDraft((s) => s.updateClap)
  const [loading, setLoading] = useState(false)

  async function loadExample() {
    setLoading(true)
    await startDraft({
      templateId: 'personal-weekly',
      type: 'personal',
      scenario: 'weekly',
      title: EXAMPLE_META.title,
      quick: false,
    })
    const draft = useDraft.getState().draft
    if (!draft) return
    const clap = buildExampleClap()
    // 目标的锁定时间以加载时刻为准
    clap.comparison.goals = clap.comparison.goals.map((g) => ({ ...g, lockedAt: new Date().toISOString() }))
    await updateClap(() => clap)
    await update({ thinkingQuestion: EXAMPLE_META.thinkingQuestion, summary: [...EXAMPLE_META.summary] })
    navigate(`/review/wizard?resume=${draft.id}`)
  }

  return (
    <div className="container help">
      <header className="page-head">
        <div className="kicker">{HELP.kicker}</div>
        <h1>{HELP.title}</h1>
        <p className="coach-say">{HELP.sub}</p>
      </header>

      {/* CLAP 四步速览 */}
      <section className="detail-section" aria-label={HELP.clpTitle}>
        <h2>{HELP.clpTitle}</h2>
        <div className="help-clp">
          {HELP.clpItems.map((item) => (
            <div key={item.key} className="help-clp-item">
              <div className="help-clp-key tnum">{item.key}</div>
              <div>
                <strong>{item.name}</strong>
                <p className="help-clp-desc">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 完整示例 */}
      <section className="detail-section" aria-label={HELP.exampleTitle}>
        <h2>{HELP.exampleTitle}</h2>
        <p className="coach-say">{EXAMPLE_META.background}</p>

        {/* 第 1 步 · 对比 */}
        <div className="help-step">
          <div className="help-step-head">
            <span className="help-step-kicker">{HELP.exampleSteps[0].kicker} · {HELP.exampleSteps[0].name}</span>
            <p>{HELP.exampleSteps[0].desc}</p>
          </div>
          <div className="cause-card">
            <div className="field-label">
              <span>{HELP.labels.goal}</span>
              <KnowledgeCapsule id="hindsight" />
            </div>
            <p className="help-filled">6 月前完成架构师学习，并约上考试</p>
            <div className="field-label">
              <span>{HELP.labels.result}</span>
              <KnowledgeCapsule id="memory-reconstruction" />
            </div>
            <p className="help-filled">学习进度约 60%，考试没有约 <small className="coach-say">（佐证：学习 App 的进度页截图）</small></p>
            <p className="help-gap tnum">
              <DeltaBadge delta="down" /> {DELTA_LABEL.down.name}——差距摆上桌面，它不是审判书
            </p>
          </div>
        </div>

        {/* 第 2 步 · 逻辑 */}
        <div className="help-step">
          <div className="help-step-head">
            <span className="help-step-kicker">{HELP.exampleSteps[1].kicker} · {HELP.exampleSteps[1].name}</span>
            <p>{HELP.exampleSteps[1].desc}</p>
          </div>
          <div className="cause-card">
            <p className="help-filled">
              {HELP.labels.cause}：学习计划太粗：只列了书单，没有拆到周
              <span className="coach-say">　{CONTROL_LABEL.half.mark} {CONTROL_LABEL.half.name}</span>
            </p>
            <p className="help-why">
              {HELP.labels.why}① 没有每周检查点，拖延无法被发现<br />
              {HELP.labels.why}② 拖延积累后，学习变成了"下次再说"
            </p>
            <p className="help-why">{HELP.labels.counter}：同样忙的项目周反而完成了任务——不是时间问题，是计划切得粗细的问题</p>
          </div>
        </div>

        {/* 第 3 步 · 认知 */}
        <div className="help-step">
          <div className="help-step-head">
            <span className="help-step-kicker">{HELP.exampleSteps[2].kicker} · {HELP.exampleSteps[2].name}</span>
            <p>{HELP.exampleSteps[2].desc}</p>
          </div>
          <div className="cause-card">
            <p className="help-filled">
              计划要拆到"每周都能验收的一小步"，并配固定检查点
              <span className="coach-say">　【归纳·待验证】{HELP.labels.confidence}：{CONFIDENCE_LABEL[2]}</span>
            </p>
            <p className="help-why">验证方式：连续两周执行周日核对，看是否兑现</p>
            <p className="help-why">{HELP.doubleLoopText}</p>
          </div>
        </div>

        {/* 第 4 步 · 规划 */}
        <div className="help-step">
          <div className="help-step-head">
            <span className="help-step-kicker">{HELP.exampleSteps[3].kicker} · {HELP.exampleSteps[3].name}</span>
            <p>{HELP.exampleSteps[3].desc}</p>
          </div>
          <div className="cause-card">
            <p className="help-filled"><KindMark kind="start" /> 每周日晚核对下周学习清单</p>
            <p className="help-why">执行意图：如果周日晚上 8 点，就花 15 分钟核对并调整学习计划</p>
            <p className="help-filled"><KindMark kind="continue" /> 保持工作日的晨间学习时段</p>
          </div>
        </div>

        {/* 小结 */}
        <div className="help-step">
          <div className="help-step-head">
            <span className="help-step-kicker">归档</span>
            <p>系统自动生成 3 条小结和 1 道思考题。</p>
          </div>
          <div className="sticky sticky--insight">
            {EXAMPLE_META.summary.map((s, i) => (
              <p key={i} className="help-filled">{i + 1}. {s}</p>
            ))}
          </div>
        </div>
      </section>

      {/* 进阶：CLD */}
      <section className="detail-section" aria-label={HELP.cldTitle}>
        <h2>
          {HELP.cldTitle} <KnowledgeCapsule id="cld" />
        </h2>
        <p className="coach-say">{HELP.cldDesc}</p>
        <CldCanvas graph={EXAMPLE_UBER_CLD} />
        <p className="coach-say">{HELP.cldTryHint}</p>
      </section>

      {/* Double Check + 资产库 */}
      <section className="detail-section" aria-label={HELP.dcTitle}>
        <h2>{HELP.dcTitle}</h2>
        <p className="coach-say">{HELP.dcDesc}</p>
      </section>

      {/* 试一试 */}
      <section className="detail-section help-try" aria-label={HELP.tryTitle}>
        <h2>{HELP.tryTitle}</h2>
        <p className="coach-say">{HELP.tryHint}</p>
        <div className="hero-cta">
          <button className="btn-primary" onClick={loadExample} disabled={loading}>
            {loading ? '正在加载…' : HELP.tryBtn}
          </button>
          <button className="btn-ghost" onClick={() => navigate('/review/wizard?template=personal-daily&mode=quick')}>
            {HELP.startBtn}
          </button>
        </div>
      </section>

      {/* 常见问题 */}
      <section className="detail-section" aria-label={HELP.faqTitle}>
        <h2>{HELP.faqTitle}</h2>
        {HELP.faq.map((f) => (
          <div key={f.q} className="cause-card">
            <p className="help-filled"><strong>{f.q}</strong></p>
            <p className="help-why">{f.a}</p>
          </div>
        ))}
      </section>

      <section className="detail-section help-cta-final" aria-label={HELP.ctaTitle}>
        <h2>{HELP.ctaTitle}</h2>
        <p className="coach-say">{HELP.ctaDesc}</p>
        <button className="btn-primary" onClick={() => navigate('/new')}>
          新建你的第一份复盘 →
        </button>
      </section>
    </div>
  )
}
