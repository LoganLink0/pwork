import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCollect } from '../store/collect'
import { useTasks } from '../store/tasks'
import { ItemCard } from '../components/collect/ItemCard'
import { itemTiers } from '../engine/itemTier'
import { rejectionStats } from '../engine/rejectionStats'
import type { Item } from '../types/models'

type StageFilter = 'all' | 'must' | 'kept' | 'discarded'

/** 条目库页（PRD §4.4）：分层/状态筛选 + 搜索 + 展开详情与标注 */
export function Items() {
  const { items, loaded, setVote, setNotes, toggleKeep, cycleOt, deleteItem } = useCollect()
  const [stage, setStage] = useState<StageFilter>('all')
  const [query, setQuery] = useState('')
  const [otOnly, setOtOnly] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const createTask = useTasks((s) => s.create)
  const [converted, setConverted] = useState<Set<string>>(new Set())
  // 挂载时定一次"今天"基准（30 天窗口用；render 期读时钟违反纯函数约束）
  const [mountedAt] = useState(() => Date.now())

  // store 载 60 天（信源多推率与页面口径共用），本页展示近 30 天
  const recent = useMemo(() => {
    const since = new Date(mountedAt - 30 * 86_400_000).toISOString()
    return items.filter((i) => i.fetchedAt >= since)
  }, [items, mountedAt])

  // 分层按同日排名得出（必看=当天前 2 名）：徽章与「必看」筛选共用
  const tiers = useMemo(() => itemTiers(items), [items])

  const convert = (id: string, title: string) => {
    void createTask({ title, origin: { kind: 'item', refId: id } })
    setConverted((prev) => new Set(prev).add(id))
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return recent.filter((i) => {
      if (stage === 'must' && tiers.get(i.id) !== 'must') return false
      if (stage === 'kept' && i.stage !== 'kept') return false
      if (stage === 'discarded' && i.stage !== 'discarded') return false
      if (otOnly && !i.otFlag) return false
      if (q && !(i.title.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q) || i.sourceName.toLowerCase().includes(q))) return false
      return true
    })
  }, [recent, stage, tiers, query, otOnly])

  const counts = useMemo(() => {
    let must = 0
    let kept = 0
    let discarded = 0
    for (const i of recent) {
      if (tiers.get(i.id) === 'must') must += 1
      if (i.stage === 'kept') kept += 1
      if (i.stage === 'discarded') discarded += 1
    }
    return { all: recent.length, must, kept, discarded }
  }, [recent, tiers])

  const stageChips: { key: StageFilter; label: string }[] = [
    { key: 'all', label: `全部 ${counts.all}` },
    { key: 'must', label: `必看 ${counts.must}` },
    { key: 'kept', label: `我标注的 ${counts.kept}` },
    { key: 'discarded', label: `已筛除 ${counts.discarded}` },
  ]

  // 筛除原因聚合（控制论"系统辨识"落地）：只在本视图有数据时出现——
  // 哪类原因最多、哪个屏蔽词杀得最狠、哪个源独占垃圾产量，调源/调词有依据
  const rejects = useMemo(() => rejectionStats(recent), [recent])

  return (
    <section>
      <div className="page-head">
        <h1>条目库</h1>
        <span className="sub">近 30 天 {items.length} 条 · 已筛除的条目保留 14 天后自动清除（有标注的除外）</span>
      </div>

      <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap', alignItems: 'center' }}>
        {stageChips.map((c) => (
          <button key={c.key} type="button" className={`chip${stage === c.key ? ' on' : ''}`} onClick={() => setStage(c.key)}>
            {c.label}
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

      {stage === 'discarded' && rejects && (
        <div className="notice" style={{ marginBottom: 'var(--sp-3)' }}>
          近 30 天筛除 {rejects.total} 条：
          {rejects.byReason
            .map((b) => `${b.reason} ${b.count} 条${b.topWord ? `（最多的是「${b.topWord.word}」${b.topWord.count} 次）` : ''}`)
            .join(' · ')}
          {rejects.topSource && rejects.topSource.share >= 0.4
            ? `。「${rejects.topSource.name}」独占 ${Math.round(rejects.topSource.share * 100)}%——可去信源管理停用它，或检查是不是该源的抓取解析出了问题。`
            : '。屏蔽词误杀多就去 设置 → 采集偏好 调整词表。'}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="e-ico" aria-hidden>🗂</div>
          <p>{!loaded ? '正在读取条目…' : recent.length === 0 ? '还没有条目。去信息日报抓取，或先在信源管理添加源。' : '没有匹配的条目。'}</p>
          {loaded && recent.length === 0 && (
            <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'center' }}>
              <Link to="/input/digest" className="btn-ghost">去信息日报 →</Link>
              <Link to="/input/sources?catalog=1" className="btn-ghost">去推荐信源目录挑几个 →</Link>
            </div>
          )}
        </div>
      ) : (
        filtered.map((item: Item) => (
          <ItemCard
            key={item.id}
            item={item}
            showStage
            expanded={expandedId === item.id}
            onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
            onVote={(v) => void setVote(item.id, v)}
            tier={tiers.get(item.id)}
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
