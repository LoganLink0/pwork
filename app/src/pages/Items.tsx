import { useMemo, useState } from 'react'
import { useCollect } from '../store/collect'
import { useTasks } from '../store/tasks'
import { ItemCard } from '../components/collect/ItemCard'
import type { Item } from '../types/models'

type StageFilter = 'all' | 'scored' | 'kept' | 'discarded'

/** 条目库页（PRD §4.4）：stage/分数筛选 + 搜索 + 展开详情与标注 */
export function Items() {
  const { items, setStars, setNotes, toggleKeep, cycleOt, deleteItem } = useCollect()
  const [stage, setStage] = useState<StageFilter>('all')
  const [minScore, setMinScore] = useState(0)
  const [query, setQuery] = useState('')
  const [otOnly, setOtOnly] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const createTask = useTasks((s) => s.create)
  const [converted, setConverted] = useState<Set<string>>(new Set())

  const convert = (id: string, title: string) => {
    void createTask({ title, origin: { kind: 'item', refId: id } })
    setConverted((prev) => new Set(prev).add(id))
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => {
      if (stage !== 'all' && i.stage !== stage) return false
      if (i.score.total < minScore) return false
      if (otOnly && !i.otFlag) return false
      if (q && !(i.title.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q) || i.sourceName.toLowerCase().includes(q))) return false
      return true
    })
  }, [items, stage, minScore, query, otOnly])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length, scored: 0, kept: 0, discarded: 0 }
    for (const i of items) c[i.stage] = (c[i.stage] ?? 0) + 1
    return c
  }, [items])

  const stageChips: { key: StageFilter; label: string }[] = [
    { key: 'all', label: `全部 ${counts.all}` },
    { key: 'scored', label: `已评分 ${counts.scored}` },
    { key: 'kept', label: `已保留 ${counts.kept}` },
    { key: 'discarded', label: `已筛除 ${counts.discarded}` },
  ]

  return (
    <section>
      <div className="page-head">
        <h1>条目库</h1>
        <span className="sub">近 30 天 {items.length} 条 · 已筛除层 14 天 TTL 后物理清理（有标注豁免）</span>
      </div>

      <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap', alignItems: 'center' }}>
        {stageChips.map((c) => (
          <button key={c.key} type="button" className={`chip${stage === c.key ? ' on' : ''}`} onClick={() => setStage(c.key)}>
            {c.label}
          </button>
        ))}
        {[60, 80].map((n) => (
          <button key={n} type="button" className={`chip${minScore === n ? ' on' : ''}`} onClick={() => setMinScore(minScore === n ? 0 : n)}>
            ≥{n} 分
          </button>
        ))}
        <button type="button" className={`chip${otOnly ? ' on' : ''}`} onClick={() => setOtOnly(!otOnly)}>🎯 机会/威胁/趋势</button>
        <input
          className="input"
          style={{ maxWidth: 220, marginLeft: 'auto' }}
          placeholder="搜索标题/摘要/来源…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="搜索条目"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="e-ico" aria-hidden>🗂</div>
          <p>{items.length === 0 ? '还没有条目。去 Digest 页抓取，或先在信源管理添加源。' : '没有匹配的条目。'}</p>
        </div>
      ) : (
        filtered.map((item: Item) => (
          <ItemCard
            key={item.id}
            item={item}
            showStage
            expanded={expandedId === item.id}
            onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
            onStars={(n) => void setStars(item.id, n)}
            onNotes={(t) => void setNotes(item.id, t)}
            onKeep={() => void toggleKeep(item.id)}
            onCycleOt={() => void cycleOt(item.id)}
            onConvert={() => convert(item.id, item.title)}
              onDelete={() => {
                if (window.confirm(`删除「${item.title.slice(0, 24)}」？（软删除，从日报/条目库移除，备份中 14 天内可找回）`)) void deleteItem(item.id)
              }}
            converted={converted.has(item.id)}
          />
        ))
      )}
    </section>
  )
}
