import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCollect } from '../store/collect'
import { useTasks } from '../store/tasks'
import { ItemCard } from '../components/collect/ItemCard'
import { todayLocal } from '../engine/datetime'
import { obsidianDaily } from '../engine/obsidian'
import { downloadFile } from '../db/repo'

/** 信息日报页（04 §4 ⑤ 分发的 UI；Top N 硬顶、两分钟扫完、无未读数） */
export function Digest() {
  const {
    digest,
    digestDate,
    digestDateOptions,
    config,
    fetch: fetchState,
    setDigestDate,
    runFetchAll,
    setStars,
    setNotes,
    toggleKeep,
    cycleOt,
  } = useCollect()
  const createTask = useTasks((s) => s.create)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [converted, setConverted] = useState<Set<string>>(new Set())

  const convert = (id: string, title: string) => {
    void createTask({ title, origin: { kind: 'item', refId: id } })
    setConverted((prev) => new Set(prev).add(id))
  }

  const todayIdx = digestDateOptions.indexOf(digestDate)
  const prevDate = digestDateOptions[todayIdx + 1] // 列表倒序：+1 是更早一天
  const nextDate = todayIdx > 0 ? digestDateOptions[todayIdx - 1] : undefined
  const isToday = digestDate === todayLocal()

  return (
    <section>
      <div className="page-head">
        <h1>信息日报</h1>
        <div className="right">
          <div className="date-nav" data-testid="date-nav">
            <button type="button" disabled={!prevDate} onClick={() => prevDate && void setDigestDate(prevDate)} aria-label="前一天">◀</button>
            <span className="cur">{digestDate}</span>
            <button type="button" disabled={!nextDate} onClick={() => nextDate && void setDigestDate(nextDate)} aria-label="后一天">▶</button>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={fetchState.running}
            onClick={() => void runFetchAll()}
            data-testid="fetch-all"
          >
            {fetchState.running ? '⟳ 抓取中…' : '⟳ 立即抓取'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={digest.length === 0}
            onClick={() =>
              downloadFile(`信息日报-${digestDate}.md`, obsidianDaily(digest, digestDate), 'text/markdown')
            }
            title="导出为 Obsidian vault 日报格式（04 §6.2）"
          >
            ⬇ 导出 Obsidian 日报
          </button>
        </div>
      </div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-soft)', marginBottom: 'var(--sp-4)' }}>
        每日精选 {config.topN} 条硬顶 ｜ 约 2 分钟扫完 ｜ <span style={{ color: 'var(--ink-faint)' }}>设计红线：无未读数——已处理/已归档，不做红点心理债（04 §8）</span>
      </div>

      {fetchState.summary && (
        <div className="run-banner" data-testid="run-summary">
          上次抓取：新 <b className="tnum">{fetchState.summary.totalNew}</b> 条 · 筛除 <b className="tnum">{fetchState.summary.totalDiscarded}</b> 条 ·{' '}
          {fetchState.summary.results.filter((r) => r.ok).length}/{fetchState.summary.results.length} 源成功
          {fetchState.summary.results.filter((r) => !r.ok).length > 0 && (
            <>；失败：{fetchState.summary.results.filter((r) => !r.ok).map((r) => r.sourceName).join('、')}</>
          )}
        </div>
      )}

      {digest.length === 0 ? (
        <div className="empty">
          <div className="e-ico" aria-hidden>📰</div>
          <p>
            {isToday ? '今日还没有条目。' : `${digestDate} 没有条目。`}
          </p>
          <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'center' }}>
            <button type="button" className="btn-primary" disabled={fetchState.running} onClick={() => void runFetchAll()}>
              {fetchState.running ? '⟳ 抓取中…' : '立即抓取'}
            </button>
            <Link to="/input/sources" className="btn-ghost">先去信源管理 →</Link>
          </div>
        </div>
      ) : (
        <>
          {digest.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onStars={(n) => void setStars(item.id, n)}
              onNotes={(t) => void setNotes(item.id, t)}
              onKeep={() => void toggleKeep(item.id)}
              onCycleOt={() => void cycleOt(item.id)}
              onConvert={() => convert(item.id, item.title)}
              converted={converted.has(item.id)}
            />
          ))}
          <div style={{ textAlign: 'center', marginTop: 'var(--sp-4)' }}>
            <Link to="/input/items" className="btn-ghost">查看条目库（全部状态）→</Link>
          </div>
        </>
      )}
    </section>
  )
}
