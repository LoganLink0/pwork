import { useState } from 'react'
import { MEETING } from '../../content/copy'
import { useDraft } from '../../store/draft'
import { KnowledgeCapsule } from '../ui/KnowledgeCapsule'
import type { Delta } from '../../types/models'

interface PileCard {
  side: 'good' | 'need'
  author: string
  text: string
}

/**
 * 书写式头脑风暴：先写后亮（课程 07 讲 / PRD 2.6 从众效应）。
 * 收集阶段卡片"扣着"（只见作者不见内容），亮牌后统一写入复盘墙的 gap 卡。
 */
export function CollectPanel() {
  const draft = useDraft((s) => s.draft)
  const updateClap = useDraft((s) => s.updateClap)
  const updateMeeting = useDraft((s) => s.updateMeeting)
  const [side, setSide] = useState<'good' | 'need'>('need')
  const [author, setAuthor] = useState('')
  const [text, setText] = useState('')
  const [pile, setPile] = useState<PileCard[]>([])

  if (!draft) return null
  const collected = draft.meeting?.collected ?? false

  function addCard() {
    if (!text.trim()) return
    setPile((p) => [...p, { side, author: author.trim(), text: text.trim() }])
    setText('')
  }

  async function reveal() {
    if (pile.length === 0) return
    const newGaps = pile.map((p) => ({
      goalRef: 0,
      resultRef: 0,
      delta: (p.side === 'good' ? 'up' : 'down') as Delta,
      good: p.side === 'good',
      note: p.author,
      text: p.text,
    }))
    await updateClap((clap) => ({
      ...clap,
      comparison: { ...clap.comparison, gaps: [...clap.comparison.gaps, ...newGaps] },
    }))
    await updateMeeting((m) => ({ ...m, collected: true }))
    setPile([])
  }

  return (
    <section className="detail-section" aria-label={MEETING.collectTitle}>
      <h2>
        {MEETING.collectTitle} <KnowledgeCapsule id="conformity" />
      </h2>
      <p className="coach-say">{MEETING.collectHint}</p>

      <div className="seg" role="radiogroup" aria-label="便利贴归类">
        <button
          type="button"
          role="radio"
          aria-checked={side === 'good'}
          className={`seg-item ${side === 'good' ? 'seg-item--on' : ''}`}
          onClick={() => setSide('good')}
        >
          🟡 {MEETING.sideGood}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={side === 'need'}
          className={`seg-item ${side === 'need' ? 'seg-item--on' : ''}`}
          onClick={() => setSide('need')}
        >
          🔵 {MEETING.sideNeed}
        </button>
      </div>

      <div className="list-row">
        <input
          className="input"
          style={{ flex: '0 0 120px' }}
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder={MEETING.authorPlaceholder}
          aria-label={MEETING.authorPlaceholder}
        />
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={MEETING.cardPlaceholder}
          aria-label={MEETING.cardPlaceholder}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addCard()
          }}
        />
        <button className="btn-ghost" style={{ flex: '0 0 auto' }} onClick={addCard}>
          {MEETING.collectBtn}
        </button>
      </div>

      {pile.length > 0 && (
        <div className="pile">
          {pile.map((p, i) => (
            <div key={i} className="pile-card">
              <span className="pile-card-title">
                #{i + 1} {p.side === 'good' ? MEETING.sideGood : MEETING.sideNeed} · {p.author || '匿名'}
              </span>
              <span className="coach-say">{MEETING.facedown} 🂠</span>
            </div>
          ))}
          <button className="btn-primary" onClick={reveal}>
            {MEETING.revealBtn}（{pile.length} 张）
          </button>
        </div>
      )}

      {collected && pile.length === 0 && (
        <p className="coach-say">已亮过牌。想到新的随时补扣，再亮一次即可。</p>
      )}
    </section>
  )
}
