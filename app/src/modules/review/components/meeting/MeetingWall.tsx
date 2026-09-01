import { useState } from 'react'
import { MEETING } from '../../content/copy'
import { removeGapAt } from '../../engine/cascade'
import { useDraft } from '../../store/draft'
import { stickyStraight } from '../ui/DebiasField'

/**
 * 复盘墙（课程 07 讲）：GOOD/NEED 两列，卡片可拖拽换边（开放空间）。
 * PC 用 HTML5 拖拽，触屏设备用"换边"按钮——两条路径调用同一个 reclassify。
 */
export function MeetingWall() {
  const draft = useDraft((s) => s.draft)
  const updateClap = useDraft((s) => s.updateClap)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  if (!draft) return null
  const gaps = draft.clap.comparison.gaps

  function reclassify(index: number, good: boolean) {
    void updateClap((clap) => ({
      ...clap,
      comparison: {
        ...clap.comparison,
        gaps: clap.comparison.gaps.map((g, i) => (i === index ? { ...g, good } : g)),
      },
    }))
  }

  function remove(index: number) {
    void updateClap((clap) => {
      const { gaps, causes } = removeGapAt(clap.comparison.gaps, clap.logic.causes, index)
      return {
        ...clap,
        comparison: { ...clap.comparison, gaps },
        logic: { ...clap.logic, causes },
      }
    })
  }

  function renderCard(gapIndex: number) {
    const gap = gaps[gapIndex]
    const title = gap.text?.trim() || `目标：${draft!.clap.comparison.goals[gap.goalRef]?.text ?? ''} → 结果：${draft!.clap.comparison.results[gap.resultRef]?.text ?? ''}`
    return (
      <div
        key={gapIndex}
        className={`sticky sticky--${gap.good ? 'good' : 'need'}`}
        style={stickyStraight}
        draggable
        onDragStart={() => setDragIndex(gapIndex)}
        onDragEnd={() => setDragIndex(null)}
      >
        <div className="sticky-title">{title}</div>
        {gap.note?.trim() && <div className="coach-say">—— {gap.note}</div>}
        <div className="wall-ops">
          <button className="btn-small" onClick={() => reclassify(gapIndex, !gap.good)}>
            {MEETING.moveSide}
          </button>
          <button className="btn-small" onClick={() => remove(gapIndex)}>
            移除
          </button>
        </div>
      </div>
    )
  }

  const goodIdx = gaps.map((g, i) => ({ g, i })).filter(({ g }) => g.good)
  const needIdx = gaps.map((g, i) => ({ g, i })).filter(({ g }) => !g.good)

  const columnProps = (good: boolean) => ({
    className: `wall-col wall-col--${good ? 'good' : 'need'}`,
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: () => {
      if (dragIndex !== null) reclassify(dragIndex, good)
      setDragIndex(null)
    },
  })

  return (
    <section className="detail-section" aria-label={MEETING.wallTitle}>
      <h2>
        {MEETING.wallTitle} <span className="kicker">GOOD {goodIdx.length} · NEED {needIdx.length}</span>
      </h2>
      <p className="coach-say">{MEETING.wallHint}</p>
      {gaps.length === 0 ? (
        <p className="coach-say">{MEETING.wallEmpty}</p>
      ) : (
        <div className="wall">
          <div {...columnProps(true)}>
            <h3 className="wall-col-title">🟡 {MEETING.sideGood}</h3>
            {goodIdx.map(({ i }) => renderCard(i))}
          </div>
          <div {...columnProps(false)}>
            <h3 className="wall-col-title">🔵 {MEETING.sideNeed}</h3>
            {needIdx.map(({ i }) => renderCard(i))}
          </div>
        </div>
      )}
    </section>
  )
}
