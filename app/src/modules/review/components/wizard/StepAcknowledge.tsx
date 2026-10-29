import { WIZARD } from '../../content/copy'
import { getPack } from '../../content/scenario-packs'
import { useDraft } from '../../store/draft'
import type { InsightItem } from '../../types/models'
import { KnowledgeCapsule } from '../ui/KnowledgeCapsule'
import { DebiasField } from '../ui/DebiasField'
import { stickyStraight } from '../ui/sticky'
import { ConfidenceMeter } from '../ui/ConfidenceMeter'

const emptyInsight = (): InsightItem => ({
  text: '',
  kind: 'inductive',
  verified: false,
  confidence: 1,
})

/** 第三步 · 认知（CLAP·A）：洞察卡（归纳/演绎）+ 双环检视。 */
export function StepAcknowledge({ quick }: { quick: boolean }) {
  const draft = useDraft((s) => s.draft)
  const updateClap = useDraft((s) => s.updateClap)
  if (!draft) return null
  const ack = draft.clap.acknowledge
  const pack = getPack(draft.scenario)

  function setAck(fn: (a: typeof ack) => typeof ack) {
    void updateClap((clap) => ({ ...clap, acknowledge: fn(clap.acknowledge) }))
  }

  function updateInsight(i: number, patch: Partial<InsightItem>) {
    setAck((a) => {
      const list = [...a.insights]
      while (list.length <= i) list.push(emptyInsight())
      list[i] = { ...list[i], ...patch }
      return { ...a, insights: list }
    })
  }

  const stored = ack.insights.map((ins, i) => ({ ins, i }))
  // 快答模式：显示一行"虚拟行"，输入即刻落库
  const rows = quick && stored.length === 0 ? [{ ins: emptyInsight(), i: 0 }] : stored

  return (
    <div>
      <h2>
        {WIZARD.sectionA} <KnowledgeCapsule id="insight-card" />
      </h2>
      <p className="coach-say">{pack?.aPrompt ?? '把原因升华为一张洞察卡——它回答"这次我学到了什么，下次该怎么看"，并被存进你的资产库，成为下次决策的输入。'}</p>

      {rows.map(({ ins, i }) => (
        <div className="cause-card sticky sticky--insight note" key={i} style={stickyStraight}>
          <DebiasField
            value={ins.text}
            onChange={(v) => updateInsight(i, { text: v })}
            placeholder={WIZARD.insightPlaceholder}
            multiline
            ariaLabel={WIZARD.insightPlaceholder}
          />
          <div className="field-label">
            <span>这条结论从哪来？</span>
            <KnowledgeCapsule id="black-swan" />
          </div>
          <div className="seg" role="radiogroup" aria-label="结论来源">
            <button
              type="button"
              role="radio"
              aria-checked={ins.kind === 'inductive'}
              className={`seg-item ${ins.kind === 'inductive' ? 'seg-item--on' : ''}`}
              onClick={() => updateInsight(i, { kind: 'inductive', verified: false })}
            >
              {WIZARD.kindInductive}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={ins.kind === 'deductive'}
              className={`seg-item ${ins.kind === 'deductive' ? 'seg-item--on' : ''}`}
              onClick={() => updateInsight(i, { kind: 'deductive', verified: true })}
            >
              {WIZARD.kindDeductive}
            </button>
          </div>
          {ins.kind === 'inductive' && !quick && (
            <input
              className="input"
              value={ins.checkPlan ?? ''}
              placeholder={WIZARD.checkPlanPlaceholder}
              aria-label={WIZARD.checkPlanLabel}
              onChange={(e) => updateInsight(i, { checkPlan: e.target.value })}
            />
          )}
          {!quick && (
            <ConfidenceMeter
              value={ins.confidence}
              onChange={(v) => updateInsight(i, { confidence: v })}
              ariaLabel="对这条认知的信心"
            />
          )}
          {!quick && (
            <button
              className="btn-small"
              onClick={() => setAck((a) => ({ ...a, insights: a.insights.filter((_, j) => j !== i) }))}
            >
              {WIZARD.remove}
            </button>
          )}
        </div>
      ))}
      {!quick && (
        <button className="btn-small" onClick={() => setAck((a) => ({ ...a, insights: [...a.insights, emptyInsight()] }))}>
          {WIZARD.addInsight}
        </button>
      )}

      <section className="sticky sticky--insight note" style={{ ...stickyStraight, marginTop: 'var(--sp-4)' }}>
        <h3 className="sticky-title">
          {WIZARD.doubleLoopQ} <KnowledgeCapsule id="double-loop" />
        </h3>
        <div className="seg" role="radiogroup" aria-label={WIZARD.doubleLoopQ}>
          <button
            type="button"
            role="radio"
            aria-checked={ack.goalValid}
            className={`seg-item ${ack.goalValid ? 'seg-item--on' : ''}`}
            onClick={() => setAck((a) => ({ ...a, goalValid: true }))}
          >
            {WIZARD.goalValidYes}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!ack.goalValid}
            className={`seg-item ${!ack.goalValid ? 'seg-item--on' : ''}`}
            onClick={() => setAck((a) => ({ ...a, goalValid: false }))}
          >
            {WIZARD.goalValidNo}
          </button>
        </div>
        {!quick && ack.goalValid === false && (
          <textarea
            className="input"
            rows={2}
            value={ack.doubleLoopNote}
            placeholder={WIZARD.doubleLoopPlaceholder}
            aria-label={WIZARD.doubleLoopPlaceholder}
            onChange={(e) => setAck((a) => ({ ...a, doubleLoopNote: e.target.value }))}
          />
        )}
      </section>
    </div>
  )
}
