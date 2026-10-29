import { CONTROL_LABEL, WIZARD, CLD } from '../../content/copy'
import { useDraft } from '../../store/draft'
import type { CauseItem, GapItem } from '../../types/models'
import { KnowledgeCapsule } from '../ui/KnowledgeCapsule'
import { DebiasField } from '../ui/DebiasField'
import { stickyStraight } from '../ui/sticky'
import { CldBuilder } from '../cld/CldBuilder'
import { CoachAskButton } from '../coach/CoachAskButton'
import { SwotGrid } from '../tools/SwotGrid'
import { LogicTree } from '../tools/LogicTree'
import { getPack, DECISION_BIAS_CHECKS } from '../../content/scenario-packs'
import { useState } from 'react'

const emptyCause = (gapRef: number): CauseItem => ({
  text: '',
  gapRef,
  controllability: 'half',
  tool: 'none',
  depth: [],
})

/** 第二步 · 逻辑（CLAP·L）：原因卡 + 可控性三色 + 5Why 深挖。 */
export function StepLogic({ quick }: { quick: boolean }) {
  const draft = useDraft((s) => s.draft)
  const updateClap = useDraft((s) => s.updateClap)
  // Hook 纪律（开发复盘 1.1）：置于 !draft 早退之前
  const [habit, setHabit] = useState({ cue: '', routine: '', reward: '' })
  if (!draft) return null

  const comp = draft.clap.comparison
  const causes = draft.clap.logic.causes
  const pack = getPack(draft.scenario)

  // 决策检查单：勾选即生成一张原因卡（再点取消）；以 biasId 识别归属，
  // 旧档案（无 biasId、只有文案）继续按文案匹配兼容取消
  function toggleBias(item: { id: string; label: string }) {
    const text = `可能的偏差｜${item.label}`
    const exists = causes.some((x) => x.biasId === item.id || (!x.biasId && x.text === text))
    if (exists) {
      setCauses((cs) => cs.filter((x) => x.biasId !== item.id && x.text !== text))
    } else {
      setCauses((cs) => [...cs, { text, gapRef: comp.gaps.indexOf(comp.gaps[0]), controllability: 'half', tool: 'none', depth: [], biasId: item.id }])
    }
  }
  const biasChecked = (item: { id: string; label: string }) =>
    causes.some((x) => x.biasId === item.id || x.text === `可能的偏差｜${item.label}`)

  function addHabitCause() {
    if (!habit.cue.trim() && !habit.routine.trim() && !habit.reward.trim()) return
    const text = `习惯回路——提示：${habit.cue.trim() || '？'}；行为：${habit.routine.trim() || '？'}；奖赏：${habit.reward.trim() || '？'}`
    setCauses((cs) => [...cs, { text, gapRef: comp.gaps.indexOf(comp.gaps[0]), controllability: 'full', tool: 'none', depth: [] }])
    setHabit({ cue: '', routine: '', reward: '' })
  }
  const gaps: GapItem[] = quick ? comp.gaps.slice(0, 1) : comp.gaps

  function setCauses(fn: (causes: CauseItem[]) => CauseItem[]) {
    void updateClap((clap) => ({ ...clap, logic: { ...clap.logic, causes: fn(clap.logic.causes) } }))
  }

  function updateCause(i: number, patch: Partial<CauseItem>, ensureGapRef = 0) {
    setCauses((cs) => {
      const list = [...cs]
      while (list.length <= i) list.push(emptyCause(ensureGapRef))
      list[i] = { ...list[i], ...patch }
      return list
    })
  }

  function gapLabel(gap: GapItem, gi: number): string {
    // 会议收集的独立便利贴直接展示文本；个人模式的差距展示"目标 → 结果"配对
    if (gap.text?.trim()) return `便利贴 ${gi + 1}：${gap.text}`
    const goal = comp.goals[gap.goalRef]?.text ?? ''
    const result = comp.results[gap.resultRef]?.text ?? ''
    const mark = gap.good ? '做得好' : '待提升'
    return `差异 ${gi + 1}（${mark}）：${goal || '目标未填写'} → ${result || '结果未填写'}`
  }

  return (
    <div>
      <h2>
        {WIZARD.sectionL} <KnowledgeCapsule id="controllability" />
      </h2>
      <p className="coach-say">
        先标记，再往下想：这件事，你能控制多少？<KnowledgeCapsule id="self-serving" />
      </p>

      {pack?.decisionChecklist && (
        <div className="cause-card" aria-label="决策偏差检查单">
          <div className="field-label">
            <span>决策偏差检查单</span>
            <KnowledgeCapsule id="outcome-bias" />
          </div>
          <p className="coach-say">逐条自问"当时是不是这样"？是就勾上——它会生成一条原因卡供你深挖。</p>
          {DECISION_BIAS_CHECKS.map((item) => (
            <label key={item.id} className="dc-item">
              <input type="checkbox" checked={biasChecked(item)} onChange={() => toggleBias(item)} />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      )}

      {pack?.habitLoop && (
        <div className="cause-card" aria-label="习惯回路三问">
          <div className="field-label">
            <span>习惯回路三问</span>
            <KnowledgeCapsule id="habit-loop" />
          </div>
          <input
            className="input"
            value={habit.cue}
            placeholder="提示：什么时间/地点/情绪触发了它？"
            aria-label="习惯提示"
            onChange={(e) => setHabit((h) => ({ ...h, cue: e.target.value }))}
          />
          <input
            className="input"
            value={habit.routine}
            placeholder="行为：实际做了什么？"
            aria-label="习惯行为"
            onChange={(e) => setHabit((h) => ({ ...h, routine: e.target.value }))}
          />
          <input
            className="input"
            value={habit.reward}
            placeholder="奖赏：它给了你什么好处（哪怕不正当）？"
            aria-label="习惯奖赏"
            onChange={(e) => setHabit((h) => ({ ...h, reward: e.target.value }))}
          />
          <button className="btn-small" onClick={addHabitCause}>
            生成原因卡
          </button>
        </div>
      )}

      {gaps.map((gap, gi) => {
        const gapRef = comp.gaps.indexOf(gap)
        const mine = causes.map((c, i) => ({ c, i })).filter(({ c }) => c.gapRef === gapRef)
        // 快答模式：没有原因时显示一行"虚拟行"，输入即刻落库
        const rows = quick && mine.length === 0 && gapRef === 0 ? [{ c: emptyCause(0), i: 0 }] : mine
        const limit = quick ? 1 : Infinity
        return (
          <section
            className={`sticky sticky--${gap.good ? 'good' : 'need'} note`}
            key={gapRef}
            style={{ ...stickyStraight, marginTop: 'var(--sp-4)' }}
          >
            <h3 className="sticky-title">{gapLabel(gap, gi)}</h3>
            {rows.map(({ c, i }) => (
              <div className="cause-card" key={i}>
                <DebiasField
                  value={c.text}
                  onChange={(v) => updateCause(i, { text: v })}
                  placeholder={WIZARD.causePlaceholder}
                  multiline
                  ariaLabel={WIZARD.causePlaceholder}
                />
                <div className="field-label">
                  <span>可控性</span>
                </div>
                <div className="seg" role="radiogroup" aria-label="可控性标记">
                  {(Object.keys(CONTROL_LABEL) as (keyof typeof CONTROL_LABEL)[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={c.controllability === k}
                      className={`seg-item ${c.controllability === k ? 'seg-item--on' : ''}`}
                      aria-label={`${CONTROL_LABEL[k].mark} ${CONTROL_LABEL[k].name}`}
                      onClick={() => updateCause(i, { controllability: k })}
                    >
                      <span aria-hidden>{CONTROL_LABEL[k].mark}</span> {CONTROL_LABEL[k].name}
                    </button>
                  ))}
                </div>

                {c.depth.map((why, di) => (
                  <input
                    key={di}
                    className="input"
                    value={why}
                    placeholder={WIZARD.whyPlaceholder}
                    aria-label={`第 ${di + 1} 层追问`}
                    onChange={(e) =>
                      updateCause(i, { depth: c.depth.map((w, dj) => (dj === di ? e.target.value : w)) })
                    }
                  />
                ))}
                {c.depth.length < 5 && (
                  <button
                    className="btn-small"
                    onClick={() => updateCause(i, { depth: [...c.depth, ''] })}
                  >
                    {WIZARD.whyMore}
                  </button>
                )}

                {!quick && (
                  <input
                    className="input"
                    value={c.counterExample ?? ''}
                    placeholder={WIZARD.counterPlaceholder}
                    aria-label={WIZARD.counterLabel}
                    onChange={(e) => updateCause(i, { counterExample: e.target.value })}
                  />
                )}

                {!quick && (
                  <button
                    className="btn-small"
                    onClick={() => setCauses((cs) => cs.filter((_, j) => j !== i))}
                  >
                    {WIZARD.remove}
                  </button>
                )}

                {c.text.trim() && (
                  <CoachAskButton
                    ctx={{
                      scenario: draft.scenario,
                      goal: comp.goals[0]?.text,
                      result: comp.results[0]?.text,
                      causes: causes.filter((x) => x.text.trim()).map((x) => x.text),
                    }}
                    onPick={(q) => updateCause(i, { depth: [...c.depth, q] })}
                  />
                )}

                {c.text.trim() && (
                  <button
                    className="btn-small"
                    onClick={() =>
                      void updateClap((clap) => {
                        const base = clap.logic.cld ?? { nodes: [], edges: [], loops: [] }
                        if (base.nodes.some((nd) => nd.label === c.text.trim())) return clap
                        return {
                          ...clap,
                          logic: {
                            ...clap.logic,
                            cld: { ...base, nodes: [...base.nodes, { id: `n_${Date.now().toString(36)}_${i}`, label: c.text.trim() }] },
                          },
                        }
                      })
                    }
                  >
                    {CLD.promote}
                  </button>
                )}
              </div>
            ))}
            {rows.length < limit && (
              <button className="btn-small" onClick={() => setCauses((cs) => [...cs, emptyCause(gapRef)])}>
                {WIZARD.addCause}
              </button>
            )}
          </section>
        )
      })}

      {gaps.length === 0 && <p className="coach-say">回到上一步，先把差异标注出来，才知道往哪里问为什么。</p>}

      {!quick && (
        <>
          <SwotGrid />
          <LogicTree />
        </>
      )}

      <CldBuilder />
    </div>
  )
}
