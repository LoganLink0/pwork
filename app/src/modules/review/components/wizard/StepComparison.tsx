import { ORDER_GUIDE, WIZARD, DELTA_LABEL } from '../../content/copy'
import { checkSmart } from '../../engine/smart'
import { removeGapAt, removeGoalAt, removeResultAt } from '../../engine/cascade'
import { useDraft } from '../../store/draft'
import { useGoals } from '../../../../store/goals'
import type { ClapSections } from '../../types/models'
import type { Delta, GapItem, GoalItem, ResultItem } from '../../types/models'
import { KnowledgeCapsule } from '../ui/KnowledgeCapsule'
import { DebiasField } from '../ui/DebiasField'
import { stickyStraight } from '../ui/sticky'
import { getPack } from '../../content/scenario-packs'
import { EmotionPicker } from '../scenario/EmotionPicker'

const now = () => new Date().toISOString()
const emptyGoal = (): GoalItem => ({ text: '', lockedAt: '', source: 'manual' })
const emptyResult = (): ResultItem => ({ text: '' })
const deltaToGood = (d: Delta) => d === 'up' || d === 'zero' || d === 'new'

function padded<T>(arr: T[], i: number, make: () => T): T[] {
  const copy = [...arr]
  while (copy.length <= i) copy.push(make())
  return copy
}

/** 第一步 · 对比（CLAP·C）：目标锁定 → 结果 → 差异标注。顺序强制：没写目标之前，结果区不解锁。 */
export function StepComparison({ quick, showGaps = true }: { quick: boolean; showGaps?: boolean }) {
  const draft = useDraft((s) => s.draft)
  const updateClap = useDraft((s) => s.updateClap)
  if (!draft) return null
  const comp = draft.clap.comparison
  const pack = getPack(draft.scenario)
  const goalLabel = pack?.goalLabel ?? WIZARD.goalLabel
  const goalPlaceholder = pack?.goalPlaceholder ?? WIZARD.goalPlaceholder
  const resultLabel = pack?.resultLabel ?? WIZARD.resultLabel
  const resultPlaceholder = pack?.resultPlaceholder ?? WIZARD.resultPlaceholder
  const hasGoalText = comp.goals.some((g) => g.text.trim())
  const resultsLocked = !hasGoalText

  function setComp(fn: (c: ClapSections['comparison']) => ClapSections['comparison']) {
    void updateClap((clap) => ({ ...clap, comparison: fn(clap.comparison) }))
  }

  /** 删目标/结果：comparison 的 gaps 索引级联，同时联动 logic.causes 的 gapRef（同一份 clap 一次写回） */
  function setCompWithCauses(
    fn: (c: ClapSections['comparison'], causes: ClapSections['logic']['causes']) => { comp: ClapSections['comparison']; causes: ClapSections['logic']['causes'] },
  ) {
    void updateClap((clap) => {
      const { comp, causes } = fn(clap.comparison, clap.logic.causes)
      return { ...clap, comparison: comp, logic: { ...clap.logic, causes } }
    })
  }

  function updateGoal(i: number, patch: Partial<GoalItem>) {
    setComp((comp) => {
      const goals = padded(comp.goals, i, emptyGoal)
      const item = { ...goals[i], ...patch }
      if (item.text.trim() && !item.lockedAt) item.lockedAt = now()
      goals[i] = item
      return { ...comp, goals }
    })
  }

  function updateResult(i: number, patch: Partial<ResultItem>) {
    setComp((comp) => {
      const results = padded(comp.results, i, emptyResult)
      results[i] = { ...results[i], ...patch }
      return { ...comp, results }
    })
  }

  const smartHints = comp.goals[0]?.text ? checkSmart(comp.goals[0].text).hints : []

  /* ------------------------------ 快答版 ------------------------------ */
  if (quick) {
    const goal = comp.goals[0] ?? emptyGoal()
    const result = comp.results[0] ?? emptyResult()
    const gap = comp.gaps[0]
    return (
      <div>
        <h2>
          {WIZARD.sectionC} <KnowledgeCapsule id="hindsight" />
        </h2>
        <div className="field-label">
          <span>{goalLabel}</span>
        </div>
        <DebiasField
          value={goal.text}
          onChange={(v) => updateGoal(0, { text: v })}
          placeholder={goalPlaceholder}
          ariaLabel={goalPlaceholder}
        />
        {smartHints.length > 0 && (
          <div className="hint-warn" role="status">
            {smartHints[0]}
          </div>
        )}

        <p className="coach-say">{ORDER_GUIDE}</p>

        <div className="field-label">
          <span>{resultLabel}</span>
          <KnowledgeCapsule id="memory-reconstruction" />
        </div>
        <DebiasField
          value={result.text}
          onChange={(v) => updateResult(0, { text: v })}
          placeholder={resultPlaceholder}
          multiline
          disabled={resultsLocked}
          ariaLabel={resultPlaceholder}
        />
        {resultsLocked && <p className="coach-say">{WIZARD.needResultFirst}</p>}

        {pack?.emotionPicker && (result.text.trim() || !resultsLocked) && (
          <EmotionPicker value={comp.emotion} />
        )}

        {!resultsLocked && result.text.trim() && (
          <div style={{ marginTop: 'var(--sp-4)' }}>
            <div className="field-label">
              <span>这个结果，比目标怎么样？</span>
            </div>
            <div className="seg" role="radiogroup" aria-label="差异标注">
              {(Object.keys(DELTA_LABEL) as Delta[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={gap?.delta === d}
                  className={`seg-item ${gap?.delta === d ? 'seg-item--on' : ''}`}
                  aria-label={DELTA_LABEL[d].name}
                  onClick={() =>
                    setComp((c) => ({
                      ...c,
                      gaps: [{ goalRef: 0, resultRef: 0, delta: d, good: deltaToGood(d) }],
                    }))
                  }
                >
                  <span className="tnum" aria-hidden>
                    {DELTA_LABEL[d].mark}
                  </span>{' '}
                  {DELTA_LABEL[d].name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ------------------------------ 完整版 ------------------------------ */
  return (
    <div>
      <h2>
        {WIZARD.sectionC} <KnowledgeCapsule id="hindsight" />
      </h2>

      <section className="detail-section">
        <div className="field-label">
          <h3>{goalLabel}</h3>
        </div>
        <GoalRefPicker onPick={(title) => setComp((c) => ({ ...c, goals: [...c.goals, { ...emptyGoal(), text: title }] }))} />
        {comp.goals.map((g, i) => (
          <div className="list-row" key={i}>
            <DebiasField
              value={g.text}
              onChange={(v) => updateGoal(i, { text: v })}
              placeholder={goalPlaceholder}
            />
            {pack?.smartCheck && g.text.trim() && checkSmart(g.text).hints.length > 0 && (
              <div className="hint-warn" role="status">
                SMART：{checkSmart(g.text).hints.join(' ')}
              </div>
            )}
            {comp.goals.length > 1 && (
              <button
                className="btn-small"
                onClick={() =>
                  setCompWithCauses((c, causes) => {
                    const r = removeGoalAt(c.goals, c.gaps, causes, i)
                    return { comp: { ...c, goals: r.goals, gaps: r.gaps }, causes: r.causes }
                  })
                }
              >
                {WIZARD.remove}
              </button>
            )}
          </div>
        ))}
        <button className="btn-small" onClick={() => setComp((c) => ({ ...c, goals: [...c.goals, emptyGoal()] }))}>
          {WIZARD.addGoal}
        </button>
      </section>

      <section className="detail-section">
        <div className="field-label">
          <h3>
            {resultLabel} <KnowledgeCapsule id="memory-reconstruction" />
          </h3>
        </div>
        <p className="coach-say">{ORDER_GUIDE}</p>
        {resultsLocked && <p className="hint-warn">{WIZARD.needResultFirst}</p>}
        {comp.results.map((r, i) => (
          <div className="list-row" key={i}>
            <div style={{ flex: 1, display: 'grid', gap: 'var(--sp-2)' }}>
              <DebiasField
                value={r.text}
                onChange={(v) => updateResult(i, { text: v })}
                placeholder={resultPlaceholder}
                multiline
                disabled={resultsLocked}
              />
              <input
                className="input"
                value={r.evidence ?? ''}
                placeholder={WIZARD.evidencePlaceholder}
                disabled={resultsLocked}
                aria-label={WIZARD.evidencePlaceholder}
                onChange={(e) => updateResult(i, { evidence: e.target.value })}
              />
            </div>
            {comp.results.length > 1 && !resultsLocked && (
              <button
                className="btn-small"
                onClick={() =>
                  setCompWithCauses((c, causes) => {
                    const r = removeResultAt(c.results, c.gaps, causes, i)
                    return { comp: { ...c, results: r.results, gaps: r.gaps }, causes: r.causes }
                  })
                }
              >
                {WIZARD.remove}
              </button>
            )}
          </div>
        ))}
        {!resultsLocked && (
          <button className="btn-small" onClick={() => setComp((c) => ({ ...c, results: [...c.results, emptyResult()] }))}>
            {WIZARD.addResult}
          </button>
        )}
      </section>

      {pack?.emotionPicker && hasGoalText && (
        <EmotionPicker value={comp.emotion} />
      )}

      {showGaps && !resultsLocked && comp.results.some((r) => r.text.trim()) && (
        <section className="detail-section">
          <div className="field-label">
            <h3>差异标注</h3>
          </div>
          {comp.gaps.map((gap, i) => (
            <div
              className={`gap-row sticky sticky--${gap.good ? 'good' : 'need'} note`}
              key={i}
              style={stickyStraight}
            >
              <select
                className="input"
                aria-label={`差异 ${i + 1} 的目标`}
                value={gap.goalRef}
                onChange={(e) =>
                  setComp((c) => {
                    const gaps = [...c.gaps]
                    gaps[i] = { ...gap, goalRef: Number(e.target.value) }
                    return { ...c, gaps }
                  })
                }
              >
                {comp.goals.map((g, gi) => (
                  <option key={gi} value={gi}>
                    {goalLabel}：{g.text || '（未填写）'}
                  </option>
                ))}
              </select>
              <select
                className="input"
                aria-label={`差异 ${i + 1} 的结果`}
                value={gap.resultRef}
                onChange={(e) =>
                  setComp((c) => {
                    const gaps = [...c.gaps]
                    gaps[i] = { ...gap, resultRef: Number(e.target.value) }
                    return { ...c, gaps }
                  })
                }
              >
                {comp.results.map((r, ri) => (
                  <option key={ri} value={ri}>
                    {resultLabel}：{r.text || '（未填写）'}
                  </option>
                ))}
              </select>
              <div className="seg" role="radiogroup" aria-label={`差异 ${i + 1} 的标注`}>
                {(Object.keys(DELTA_LABEL) as Delta[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={gap.delta === d}
                    className={`seg-item ${gap.delta === d ? 'seg-item--on' : ''}`}
                    aria-label={DELTA_LABEL[d].name}
                    onClick={() =>
                      setComp((c) => {
                        const gaps = [...c.gaps]
                        gaps[i] = { ...gap, delta: d, good: deltaToGood(d) }
                        return { ...c, gaps }
                      })
                    }
                  >
                    <span className="tnum" aria-hidden>
                      {DELTA_LABEL[d].mark}
                    </span>
                  </button>
                ))}
              </div>
              <div className="seg" role="radiogroup" aria-label={`差异 ${i + 1} 的归类`}>
                {([true, false] as const).map((good) => (
                  <button
                    key={String(good)}
                    type="button"
                    role="radio"
                    aria-checked={gap.good === good}
                    className={`seg-item ${gap.good === good ? 'seg-item--on' : ''}`}
                    onClick={() =>
                      setComp((c) => {
                        const gaps = [...c.gaps]
                        gaps[i] = { ...gap, good }
                        return { ...c, gaps }
                      })
                    }
                  >
                    {good ? WIZARD.gapGood : WIZARD.gapNeed}
                  </button>
                ))}
              </div>
              <button
                className="btn-small"
                onClick={() =>
                  // 差距删除需级联原因（gapRef 悬空会让原因在界面上消失）
                  void updateClap((clap) => {
                    const { gaps, causes } = removeGapAt(clap.comparison.gaps, clap.logic.causes, i)
                    return {
                      ...clap,
                      comparison: { ...clap.comparison, gaps },
                      logic: { ...clap.logic, causes },
                    }
                  })
                }
              >
                {WIZARD.remove}
              </button>
            </div>
          ))}
          <button
            className="btn-small"
            onClick={() =>
              setComp((c) => {
                const gap: GapItem = { goalRef: 0, resultRef: 0, delta: 'zero', good: true }
                return { ...c, gaps: [...c.gaps, gap] }
              })
            }
          >
            {WIZARD.addGap}
          </button>
        </section>
      )}
    </div>
  )
}

/** 目标只读引用（03 §4 第 2 项，W5/C-2）：从工作台目标库带入 C 步，替代手动输入。
 *  zustand 纪律：selector 只取稳定引用，派生在渲染体内完成。 */
function GoalRefPicker({ onPick }: { onPick: (title: string) => void }) {
  const goals = useGoals((s) => s.goals)
  const active = goals.filter((g) => g.status === 'active')
  if (active.length === 0) return null
  return (
    <details className="ot-picker">
      <summary>从目标库引用（{active.length}）</summary>
      {active.map((g) => (
        <button
          key={g.id}
          type="button"
          className="btn-small"
          style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4 }}
          onClick={() => onPick(g.title)}
        >
          ◎ {g.title}
        </button>
      ))}
    </details>
  )
}
