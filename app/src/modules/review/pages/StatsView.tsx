import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { STATS_VIEW } from '../content/copy'
import { insightTimeline, monthlyTrend, scenarioDistribution, topPatterns } from '../engine/stats'
import { actionStats, listInsights, listReviews, type ActionStats } from '../db/repo'
import type { InsightRecord, ReviewRecord } from '../types/models'

function Bar({ segments, label, value }: { segments: { width: number; cls: string; title: string }[]; label: string; value: string }) {
  return (
    <div className="bar-row">
      <span className="bar-label tnum">{label}</span>
      <div className="bar-track" aria-hidden>
        {segments.map((s, i) => (
          <div key={i} className={`bar-fill ${s.cls}`} style={{ width: `${s.width}%` }} title={s.title} />
        ))}
      </div>
      <span className="bar-value tnum">{value}</span>
    </div>
  )
}

/** ⑧ 聚合分析：全部数字从本地档案实时计算（M7） */
export function StatsView() {
  const [reviews, setReviews] = useState<ReviewRecord[] | null>(null)
  const [insights, setInsights] = useState<InsightRecord[]>([])
  const [actStats, setActStats] = useState<ActionStats | null>(null)

  useEffect(() => {
    let live = true
    void Promise.all([listReviews(), listInsights(), actionStats()]).then(([rs, ins, as]) => {
      if (!live) return
      setReviews(rs)
      setInsights(ins)
      setActStats(as)
    })
    return () => {
      live = false
    }
  }, [])

  const trend = monthlyTrend(reviews ?? [], insights, 6)
  const scenarios = scenarioDistribution(reviews ?? [])
  const patterns = topPatterns(insights, 5)
  const timeline = insightTimeline(insights, 6)
  const maxScenario = Math.max(1, ...scenarios.map((s) => s.count))
  const total = reviews?.length ?? 0

  return (
    <div className="container">
      <header className="page-head">
        <div className="kicker">{STATS_VIEW.kicker}</div>
        <h1>{STATS_VIEW.title}</h1>
        <p className="coach-say">{STATS_VIEW.sub}</p>
      </header>

      <section className="stats-grid" aria-label="总览">
        <div className="stat-card">
          <div className="stat-num tnum">{total}</div>
          <div className="stat-label">{STATS_VIEW.reviewsUnit}</div>
        </div>
        <div className="stat-card">
          <div className="stat-num tnum">{insights.length}</div>
          <div className="stat-label">{STATS_VIEW.insightsUnit}</div>
        </div>
        <div className="stat-card">
          <div className="stat-num tnum">{actStats ? `${Math.round(actStats.closureRate * 100)}%` : '…'}</div>
          <div className="stat-label">行动闭环率</div>
        </div>
      </section>

      <section className="detail-section" aria-label={STATS_VIEW.trendTitle}>
        <h2>{STATS_VIEW.trendTitle}</h2>
        <p className="coach-say">{STATS_VIEW.trendLegend}</p>
        {total === 0 ? (
          <p className="coach-say">{STATS_VIEW.empty}</p>
        ) : (
          <div className="bars">
            {trend.map((b) => {
              const gaps = b.met + b.missed
              const segments = gaps
                ? [
                    { width: (b.met / gaps) * 100, cls: 'bar-met', title: `达成方向 ${b.met}` },
                    { width: (b.missed / gaps) * 100, cls: 'bar-missed', title: `未达成 ${b.missed}` },
                  ]
                : b.reviews > 0
                  ? [{ width: 100, cls: 'bar-neutral', title: `${b.reviews} 份复盘` }]
                  : [{ width: 0, cls: 'bar-neutral', title: '' }]
              return (
                <Bar
                  key={b.month}
                  label={b.month.slice(2)}
                  value={`${b.reviews} 份 · ${b.insights} 认知`}
                  segments={segments}
                />
              )
            })}
          </div>
        )}
      </section>

      <section className="detail-section" aria-label={STATS_VIEW.scenarioTitle}>
        <h2>{STATS_VIEW.scenarioTitle}</h2>
        {scenarios.length === 0 ? (
          <p className="coach-say">{STATS_VIEW.empty}</p>
        ) : (
          <div className="bars">
            {scenarios.map((s) => (
              <Bar
                key={s.scenario}
                label={s.label}
                value={`${s.count}`}
                segments={[{ width: (s.count / maxScenario) * 100, cls: 'bar-scenario', title: `${s.label} ${s.count}` }]}
              />
            ))}
          </div>
        )}
      </section>

      <section className="detail-section" aria-label={STATS_VIEW.patternTitle}>
        <h2>{STATS_VIEW.patternTitle}</h2>
        <p className="coach-say">{STATS_VIEW.patternHint}</p>
        {patterns.length === 0 ? (
          <p className="coach-say">还没有反复出现的主题——这是好事，也说明样本还少。</p>
        ) : (
          patterns.map((p) => (
            <div key={p.group} className="review-row" style={{ alignItems: 'center' }}>
              <div>
                <strong>{p.sample}</strong>
              </div>
              <span className={`tnum ${p.count >= 3 ? 'overdue' : ''}`}>
                × {p.count}
                {STATS_VIEW.times}
              </span>
            </div>
          ))
        )}
      </section>

      <section className="detail-section" aria-label={STATS_VIEW.timelineTitle}>
        <h2>{STATS_VIEW.timelineTitle}</h2>
        <div className="bars">
          {timeline.map((t) => (
            <Bar
              key={t.month}
              label={t.month.slice(2)}
              value={`${t.count}`}
              segments={[{ width: (t.count / Math.max(1, ...timeline.map((x) => x.count))) * 100, cls: 'bar-insight', title: `${t.count}` }]}
            />
          ))}
        </div>
        <p className="coach-say" style={{ marginTop: 'var(--sp-3)' }}>
          <Link to="/settings">{STATS_VIEW.reportCta}</Link>
        </p>
      </section>
    </div>
  )
}
