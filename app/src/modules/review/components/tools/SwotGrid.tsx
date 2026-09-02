import { useMemo } from 'react'
import { useDraft } from '../../store/draft'
import { emptySwot, type SwotQuadrants } from '../../types/models'
import { KnowledgeCapsule } from '../ui/KnowledgeCapsule'
import { useCollect } from '../../../../store/collect'
import type { Item } from '../../../../types/models'

const QUADRANTS: { key: keyof SwotQuadrants; title: string; desc: string; cls: string }[] = [
  { key: 's', title: 'S · 优势', desc: '内部 · 做得好的', cls: 'swot-s' },
  { key: 'w', title: 'W · 劣势', desc: '内部 · 待改进', cls: 'swot-w' },
  { key: 'o', title: 'O · 机会', desc: '外部 · 可借力', cls: 'swot-o' },
  { key: 't', title: 'T · 威胁', desc: '外部 · 要防的', cls: 'swot-t' },
]

/** O/T 候选池选择器（04 §7，W4）：把标记了 otFlag 的信息条目引用进 SWOT 相应格 */
function OtPicker({ flag, onPick }: { flag: 'opportunity' | 'threat'; onPick: (line: string) => void }) {
  // zustand 纪律（开发复盘 1.2）：selector 只取稳定引用，派生用 useMemo——
  // filter/slice 内联在 selector 里会每次返回新数组，导致无限重渲染
  const items = useCollect((s) => s.items)
  const candidates = useMemo(() => items.filter((i) => i.otFlag === flag).slice(0, 8), [items, flag])
  const label = flag === 'opportunity' ? '机会' : '威胁'
  if (candidates.length === 0) {
    return (
      <details className="ot-picker">
        <summary>从信息库引用</summary>
        <p className="coach-say">暂无标记 {label} 的条目——信息日报的条目「详情」里可标记机会/威胁。</p>
      </details>
    )
  }
  return (
    <details className="ot-picker">
      <summary>从信息库引用（{candidates.length}）</summary>
      {candidates.map((item: Item) => (
        <button
          key={item.id}
          type="button"
          className="btn-ghost"
          style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4, padding: '4px 8px', fontSize: 'var(--fs-xs)' }}
          onClick={() =>
            onPick(`[${item.title}](${item.url})（评分 ${item.score.total} · ${item.sourceName}）`)
          }
        >
          {item.title}（{item.score.total}）
        </button>
      ))}
    </details>
  )
}

/** SWOT 2×2 编辑网格（课程 09/14 讲）：每格一行一条；SO 交叉策略提示在底部。 */
export function SwotGrid() {
  const draft = useDraft((s) => s.draft)
  const updateClap = useDraft((s) => s.updateClap)
  if (!draft) return null
  const swot = draft.clap.logic.swot ?? emptySwot()

  function setText(key: keyof SwotQuadrants, text: string) {
    const items = text.split('\n').map((l) => l.trim()).filter(Boolean)
    void updateClap((clap) => ({
      ...clap,
      logic: { ...clap.logic, swot: { ...(clap.logic.swot ?? emptySwot()), [key]: items } },
    }))
  }

  const text = (key: keyof SwotQuadrants) => (swot[key] ?? []).join('\n')
  const hasSO = swot.s.length > 0 && swot.o.length > 0

  return (
    <div className="detail-section" aria-label="SWOT 分析">
      <div className="field-label">
        <h3>SWOT 分析</h3>
        <KnowledgeCapsule id="swot" />
      </div>
      <p className="coach-say">每格一行一条。S/W 向内看自己，O/T 向外看环境——机会 × 优势的交集，往往就是发力点。</p>
      <div className="swot-grid">
        {QUADRANTS.map((q) => (
          <div key={q.key} className={`swot-cell ${q.cls}`}>
            <div className="swot-cell-title">
              <strong>{q.title}</strong>
              <span className="coach-say">{q.desc}</span>
            </div>
            <textarea
              className="input"
              rows={4}
              value={text(q.key)}
              aria-label={`${q.title}（每行一条）`}
              placeholder={'每行一条…'}
              onChange={(e) => setText(q.key, e.target.value)}
            />
            {(q.key === 'o' || q.key === 't') && (
              <OtPicker
                flag={q.key === 'o' ? 'opportunity' : 'threat'}
                onPick={(line) => setText(q.key, text(q.key) ? `${text(q.key)}\n${line}` : line)}
              />
            )}
          </div>
        ))}
      </div>
      {hasSO && (
        <p className="coach-say" role="status">
          SO 策略提示：把「{swot.s[0]}」用在「{swot.o[0]}」上——优势与机会的交集是增长型战略的起点（课程 14 讲）。
        </p>
      )}
    </div>
  )
}
