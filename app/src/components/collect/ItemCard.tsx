import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Item } from '../../types/models'
import { fmtLocal } from '../../engine/datetime'
import { useNotes } from '../../store/notes'

const OT_LABEL: Record<NonNullable<Item['otFlag']>, { text: string; cls: string; icon: string }> = {
  opportunity: { text: '机会', cls: 'ot-opp', icon: '🎯' },
  threat: { text: '威胁', cls: 'ot-threat', icon: '⚠' },
  trend: { text: '趋势', cls: 'ot-trend', icon: '📈' },
}

function scoreCls(total: number): string {
  return total >= 80 ? 'hi' : total >= 60 ? 'mid' : 'lo'
}

export interface ItemCardProps {
  item: Item
  /** 展开详情（批注/评分理由/字段） */
  expanded: boolean
  onToggle: () => void
  onStars: (n: number) => void
  onNotes: (text: string) => void
  onKeep: () => void
  onCycleOt: () => void
  /** 转行动卡 → 任务库（W3 起可用；不传则按钮禁用） */
  onConvert?: () => void
  /** 已转待办状态（按钮显示"已转待办"） */
  converted?: boolean
  /** 显示 stage 徽章与 TTL 标注（条目库视图） */
  showStage?: boolean
  /** 软删除（不传则按钮不显示）；删除后所有列表/日报/报告即刻过滤 */
  onDelete?: () => void
}

/** 条目卡（PRD §4.4）：评分徽章 + 标题外链 + 摘要 + 元信息 + 我的星级 + 展开标注 */
export function ItemCard({ item, expanded, onToggle, onStars, onNotes, onKeep, onCycleOt, onConvert, converted, showStage, onDelete }: ItemCardProps) {
  const [draftNotes, setDraftNotes] = useState<string | null>(null)
  const a = item.annotation
  const ot = item.otFlag ? OT_LABEL[item.otFlag] : null
  const navigate = useNavigate()
  const createNote = useNotes((s) => s.create)

  /** 条目 → 速记（写入 links.itemIds，双向挂接的另一半） */
  const writeNote = async () => {
    const note = await createNote({
      body: `【${item.title}】(${item.url})

`,
      tags: [],
      source: 'manual',
      links: { itemIds: [item.id], reviewIds: [], taskIds: [] },
    })
    navigate(`/input/notes/${note.id}`)
  }

  return (
    <div className="digest-item" data-testid="item-card">
      <div className={`score ${scoreCls(item.score.total)}`} title={`评分理由：${item.scoreReason || '—'}`}>
        <div className="s-num tnum">{item.score.total}</div>
        <div className="s-cap">评分</div>
      </div>
      <div className="d-main">
        <div className="d-title">
          <a href={item.url} target="_blank" rel="noreferrer noopener">{item.title}</a>
          <span className="ext" aria-hidden>↗</span>
        </div>
        {item.summary && <div className="d-summary">{item.summary}</div>}
        <div className="d-meta">
          <span>{item.sourceName}</span>
          {item.tags.map((t) => (
            <span className="tagchip" key={t}>#{t}</span>
          ))}
          {ot && <span className={`otflag ${ot.cls}`}>{ot.icon} {ot.text}</span>}
          {showStage && (
            <span className={`stage-badge stage-${item.stage}`}>
              {item.stage === 'discarded' ? '已筛除' : item.stage === 'kept' ? '已保留' : '已评分'}
            </span>
          )}
          {showStage && item.stage === 'discarded' && item.expiresAt && (
            <span className="ttl-note">{fmtLocal(item.expiresAt).slice(0, 10)} 过期清理</span>
          )}
          <button type="button" className="mini-btn" onClick={onToggle} aria-expanded={expanded}>
            {expanded ? '收起' : '详情'}
          </button>
        </div>
        {expanded && (
          <div className="item-expand">
            <div className="why">评分理由：{item.scoreReason || '—'}（规则评分 · 四维：源 {item.score.source.toFixed(2)} / 新 {item.score.novelty.toFixed(2)} / 相关 {item.score.relevance.toFixed(2)} / 工具 {item.score.utility.toFixed(2)}）</div>
            <div className="kv">
              {fmtLocal(item.fetchedAt)} 抓取{item.publishedAt ? ` · 发布 ${fmtLocal(item.publishedAt)}` : ''}<br />
              fingerprint {item.fingerprint}
            </div>
            <textarea
              value={draftNotes ?? a.notes}
              placeholder="我的批注（永久保留，随备份）"
              onChange={(e) => setDraftNotes(e.target.value)}
              onBlur={() => {
                if (draftNotes !== null && draftNotes !== a.notes) onNotes(draftNotes)
                setDraftNotes(null)
              }}
              aria-label={`批注：${item.title}`}
            />
            <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="mini-btn"
                title="在 机会 → 威胁 → 趋势 → 取消 之间切换；标记后进入复盘 SWOT 候选池"
                onClick={onCycleOt}
              >
                {item.otFlag ? `${OT_LABEL[item.otFlag].icon} ${OT_LABEL[item.otFlag].text}（点击换/取消）` : '标记机会/威胁/趋势'}
              </button>
              <button type="button" className="mini-btn" onClick={onKeep}>
                {a.keepForever ? '★ 永久保留（点击取消）' : '永久保留'}
              </button>
              <button type="button" className="mini-btn" title="以这条条目为引写速记，速记自动挂回本条目" onClick={() => void writeNote()}>
                写速记
              </button>
              <span className="ttl-note">标记后进入复盘 SWOT 候选池</span>
            </div>
          </div>
        )}
      </div>
      <div className="d-ops">
        <div className="stars-cap">我的星级</div>
        <button
          type="button"
          className="stars"
          title="星级是你的评分，反馈回流权重（04 §4.1）"
          onClick={() => onStars((a.stars % 5) + 1)}
          aria-label={`星级：${a.stars} 星，点击加一星`}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className={n <= a.stars ? 'on' : ''}>★</span>
          ))}
        </button>
        <button type="button" className="mini-btn" disabled={!onConvert} onClick={onConvert}>
          {converted ? '已转待办 ✓' : '转行动卡'}
        </button>
        {onDelete && (
          <button
            type="button"
            className="mini-btn"
            title="从日报/条目库移除（软删除，14 天内可从备份找回）"
            onClick={onDelete}
          >
            删除
          </button>
        )}
      </div>
    </div>
  )
}
