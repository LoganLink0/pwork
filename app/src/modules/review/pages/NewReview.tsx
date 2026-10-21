import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { TEMPLATES } from '../content/templates'
import { StickyCard } from '../components/ui/StickyCard'
import { useTasks } from '../../../store/tasks'
import { useGoals } from '../../../store/goals'
import { useCollect } from '../../../store/collect'
import { gatherSignals, type Signal } from '../../../engine/signals'

const KIND_BY_TYPE = { personal: 'good', team: 'need', org: 'insight' } as const

/** 本周素材卡（复盘预填，05 W5 / 03 §4 第 4 项）：任务闭环/逾期、目标、高分条目、信号——
 *  自动汇总呈现在创建时刻；CLAP 字段级回填随 C-4 统一接口演进。数据全部来自各模块 store，零拷贝。 */
function MaterialCard() {
  const tasks = useTasks((s) => s.tasks)
  const stats = useTasks((s) => s.stats)
  const goals = useGoals((s) => s.goals)
  const items = useCollect((s) => s.items)
  const digest = useCollect((s) => s.digest)
  const [signals, setSignals] = useState<Signal[]>([])
  useEffect(() => {
    void gatherSignals().then(setSignals)
  }, [])
  const activeGoals = goals.filter((g) => g.status === 'active')
  const topItems = (digest.length ? digest : items).slice(0, 3)
  if (tasks.length === 0 && activeGoals.length === 0 && items.length === 0) return null
  return (
    <div className="set-card" style={{ marginBottom: 'var(--sp-5)' }} data-testid="material-card">
      <h2>本周素材（自动汇总）</h2>
      <div className="desc">复盘预填：数据来自任务库 / 目标库 / 信息日报，ID 引用零拷贝</div>
      <div className="set-body">
        <div className="set-row">
          <label>任务</label>
          <span className="val tnum">已闭环 {stats.done} · 未闭环 {stats.open} · 今天到期 {stats.today}</span>
        </div>
        {activeGoals.length > 0 && (
          <div className="set-row">
            <label>进行中目标</label>
            <span className="val">{activeGoals.map((g) => g.title).join('；')}</span>
          </div>
        )}
        {topItems.length > 0 && (
          <div className="set-row" style={{ alignItems: 'flex-start' }}>
            <label>高分条目（外部环境）</label>
            <span className="val" style={{ color: 'var(--ink-soft)' }}>
              {topItems.map((i) => `· ${i.title.slice(0, 24)}（${i.score.total} 分）`).join('；')}
            </span>
          </div>
        )}
        {signals.length > 0 && (
          <div className="notice" style={{ marginTop: 'var(--sp-2)' }} role="status">
            <b>⚡ 信号</b>：{signals.map((x) => x.message).join('；')}
          </div>
        )}
      </div>
    </div>
  )
}

/** ② 新建复盘：模板选择（M2 增加症状问诊路由器） */
export function NewReview() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  return (
    <div className="container">
      <header className="page-head">
        <div className="kicker">新建复盘</div>
        <h1>从哪一个场景开始？</h1>
        <p className="coach-say">
          选一张便利贴。个人模板现在就能用，团队与组织模板按里程碑逐步开放。
        </p>
      </header>

      <MaterialCard />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
          gap: 'var(--sp-4)',
        }}
      >
        {TEMPLATES.map((t) => (
          <StickyCard
            key={t.id}
            kind={KIND_BY_TYPE[t.type]}
            title={t.name}
            tagline={t.tagline}
            onClick={() => {
              const note = searchParams.get('note') ?? ''
              const tail = note ? `&note=${encodeURIComponent(note)}` : ''
              navigate(t.mode === 'meeting' ? `/review/meeting?template=${t.id}` : `/review/wizard?template=${t.id}${tail}`)
            }}
          />
        ))}
      </div>
    </div>
  )
}
