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

export interface ItemCardProps {
  item: Item
  /** 展开详情（批注/筛选理由/字段） */
  expanded: boolean
  onToggle: () => void
  onVote: (vote: 'want' | 'meh' | 'no' | null) => void
  onNotes: (text: string) => void
  onKeep: () => void
  onCycleOt: () => void
  /** 转行动卡 → 任务库（W3 起可用；不传则按钮禁用） */
  onConvert?: () => void
  /** 已转待办状态（按钮显示"已转待办"） */
  converted?: boolean
  /** 显示状态徽章与保留期标注（条目库视图） */
  showStage?: boolean
  /** 软删除（不传则按钮不显示）；删除后所有列表/日报/报告即刻过滤 */
  onDelete?: () => void
}

/** 条目卡：标题外链 + 摘要 + 元信息 + 三档投票 + 展开标注。分数已取消——不显示任何分数衍生标记 */
export function ItemCard({ item, expanded, onToggle, onVote, onNotes, onKeep, onCycleOt, onConvert, converted, showStage, onDelete }: ItemCardProps) {
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
              {item.stage === 'discarded' ? '已筛除' : item.stage === 'kept' ? '我标注的' : '上过日报'}
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
            <div className="why">筛选理由：{item.scoreReason || '—'}（依据信源分级、新鲜度、兴趣词命中）</div>
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
                title="在 机会 → 威胁 → 趋势 → 取消 之间切换；标记后可在复盘的 SWOT 里直接引用"
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
              <span className="ttl-note">标记后可在复盘的 SWOT 里直接引用</span>
            </div>
          </div>
        )}
      </div>
      <div className="d-ops">
        <div className="stars-cap">我的判断</div>
        <div className="vote-group" role="group" aria-label={`判断：${item.title}`}>
          <button
            type="button"
            className={`vote-btn vote-want ${a.vote === 'want' ? 'on' : ''}`}
            title="这条是我想要更多的——驱动信源信用与兴趣画像"
            onClick={() => onVote(a.vote === 'want' ? null : 'want')}
            aria-pressed={a.vote === 'want'}
          >
            ✦ 想要
          </button>
          <button
            type="button"
            className={`vote-btn vote-meh ${a.vote === 'meh' ? 'on' : ''}`}
            title="可看可不看"
            onClick={() => onVote(a.vote === 'meh' ? null : 'meh')}
            aria-pressed={a.vote === 'meh'}
          >
            一般
          </button>
          <button
            type="button"
            className={`vote-btn vote-no ${a.vote === 'no' ? 'on' : ''}`}
            title="浪费注意力——同类内容会被降权"
            onClick={() => onVote(a.vote === 'no' ? null : 'no')}
            aria-pressed={a.vote === 'no'}
          >
            ✗ 不要
          </button>
        </div>
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
