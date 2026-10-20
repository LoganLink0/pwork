import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCollect } from '../store/collect'
import { useTasks } from '../store/tasks'
import { ItemCard } from '../components/collect/ItemCard'
import { todayLocal } from '../engine/datetime'
import { alignmentStats } from '../engine/itemTier'
import { obsidianDaily } from '../engine/obsidian'
import { downloadFile } from '../db/repo'
import { cloudConfigured, syncFromCloud } from '../db/cloudSync'
import { recordError } from '../engine/errorLog'

// 进页拉云端：进本页时若配置了云端同步就拉一轮增量——应用开着不动也能在日报页看到云端新抓的
// 条目（打开应用自动同步只覆盖"刚打开"的场景）。5 分钟内不重复拉，往返切换不成反复请求。
let lastDigestPullAt = 0

/** 信息日报页（04 §4 ⑤ 分发的 UI；Top N 硬顶、两分钟扫完、无未读数） */
export function Digest() {
  const {
    digest,
    digestDate,
    digestDateOptions,
    config,
    items,
    fetch: fetchState,
    setDigestDate,
    runFetchAll,
    setVote,
    setNotes,
    toggleKeep,
    cycleOt,
    deleteItem,
  } = useCollect()
  const createTask = useTasks((s) => s.create)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [converted, setConverted] = useState<Set<string>>(new Set())

  // 对齐可见性：你标「想要」的条目当时被分层的情况——可略占比越低，分层越贴近你的标准
  const align = useMemo(() => alignmentStats(items), [items])

  const convert = (id: string, title: string) => {
    void createTask({ title, origin: { kind: 'item', refId: id } })
    setConverted((prev) => new Set(prev).add(id))
  }

  const todayIdx = digestDateOptions.indexOf(digestDate)
  const prevDate = digestDateOptions[todayIdx + 1] // 列表倒序：+1 是更早一天
  const nextDate = todayIdx > 0 ? digestDateOptions[todayIdx - 1] : undefined
  const isToday = digestDate === todayLocal()

  useEffect(() => {
    if (!cloudConfigured()) return
    if (Date.now() - lastDigestPullAt < 5 * 60_000) return
    lastDigestPullAt = Date.now()
    void syncFromCloud().then(async (r) => {
      if (!r.ok) {
        // 与"打开应用自动同步"同一纪律：云端偶发不可达不打扰，只入错误日志
        void recordError({ where: '信息日报.进页拉云端', kind: 'app', message: r.error ?? '未知失败' }, { silent: true })
        return
      }
      if (r.newCount > 0) await useCollect.getState().load()
    })
  }, [])

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
            title="导出为 Obsidian 日报文件"
          >
            ⬇ 导出 Obsidian 日报
          </button>
        </div>
      </div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-soft)', marginBottom: 'var(--sp-4)' }}>
        每天最多精选 {config.topN} 条 ｜ 约 2 分钟扫完 ｜ <span style={{ color: 'var(--ink-faint)' }}>没有未读数和红点提醒——看完就处理或归档，不积攒</span>
      </div>

      {fetchState.summary && (
        <div className="run-banner" data-testid="run-summary">
          上次抓取（{(fetchState.summary.elapsedMs / 1000).toFixed(1)} 秒）：新 <b className="tnum">{fetchState.summary.totalNew}</b> 条 · 筛除 <b className="tnum">{fetchState.summary.totalDiscarded}</b> 条 ·{' '}
          {fetchState.summary.results.filter((r) => r.ok).length}/{fetchState.summary.results.length} 源成功
          {fetchState.summary.results.filter((r) => !r.ok).length > 0 && (
            <>；失败：{fetchState.summary.results.filter((r) => !r.ok).map((r) => r.sourceName).join('、')}</>
          )}
        </div>
      )}
      {fetchState.error && (
        <div className="run-banner warn" data-testid="run-error" role="alert">
          抓取中断：{fetchState.error}。按钮已恢复，可重试；<Link to="/settings">错误日志</Link>里有详情。
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
          {digest.map((item, idx) => (
            <ItemCard
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onVote={(v) => void setVote(item.id, v)}
              tier={idx < 2 ? 'must' : idx < 8 ? 'may' : 'skip'}
              onNotes={(t) => void setNotes(item.id, t)}
              onKeep={() => void toggleKeep(item.id)}
              onCycleOt={() => void cycleOt(item.id)}
              onConvert={() => convert(item.id, item.title)}
              converted={converted.has(item.id)}
              onDelete={() => {
                if (window.confirm(`删除「${item.title.slice(0, 24)}」？（软删除，从日报/条目库移除，备份中 14 天内可找回）`)) void deleteItem(item.id)
              }}
            />
          ))}
          {align && (
            <div className="notice" style={{ marginTop: 'var(--sp-2)' }}>
              徽章准不准，看这行：最近 30 天你标「想要」的 {align.want} 条，当时分层为 必看 {align.must} · 可看 {align.may} · 可略 {align.skip}——落在「可略」里的就是系统还没学会的主题，你的投票会让它们越来越少。
            </div>
          )}
          <div style={{ textAlign: 'center', marginTop: 'var(--sp-4)' }}>
            <Link to="/input/items" className="btn-ghost">查看条目库（全部状态）→</Link>
          </div>
        </>
      )}
    </section>
  )
}
