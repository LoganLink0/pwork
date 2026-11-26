import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { itemTiers } from '../modules/input/engine/itemTier'
import { localDateOf } from './datetime'
import type { Item } from '../types/models'

/**
 * 日报分层漂移评估（第 4 批评估集，2026-11-26；外部审核建议的最小评估集）。
 * 基线 local/eval/baseline.json（gitignored，由 local/eval/eval-export.py 从真实库
 * 只读导出）不存在时整组跳过——CI 与无基线环境零影响。
 *
 * 分层一律用真实 itemTiers 重算（同日按分数排名：前 2 必看 / 3–8 可看 / 其余可略）。
 *
 * 使用协议：
 *   ① 建基线：python local/eval/eval-export.py baseline > local/eval/baseline.json
 *      跑本文件 → 首次运行生成 local/eval/drift-baseline.json（分布快照，gitignored）
 *   ② 换模型/改提示词/调词表之后：**先重导基线**（新分数才会进基线），再跑本文件
 *      → 任一档位占比偏移 >15 个百分点即红（漂移告警）；确认改动合理后删除
 *      drift-baseline.json 重新建基线
 *   ③ 金标重合度：eval-export.py golden 导出模板 → 人工标 Y/N → 改名 golden.md
 *      → 本文件额外报告系统「必看」与你金标的重合率（只报告不断言）
 */

const EVAL_DIR = join(__dirname, '..', '..', '..', 'local', 'eval') // engine → src → app → 仓库根
const BASELINE = join(EVAL_DIR, 'baseline.json')
const SNAPSHOT = join(EVAL_DIR, 'drift-baseline.json')
const GOLDEN = join(EVAL_DIR, 'golden.md')
const DRIFT_PCT = 15

interface BaselineItem {
  id: string
  fetchedAt: string
  scoreTotal: number
  title: string
  stage?: string
}

// 真实实现只碰这五个字段——最小映射保持同口径
const toItem = (b: BaselineItem): Item =>
  ({ id: b.id, fetchedAt: b.fetchedAt, deletedAt: undefined, stage: b.stage, score: { total: b.scoreTotal } }) as unknown as Item

type Dist = { must: number; may: number; skip: number }

function distOf(items: BaselineItem[]): { counts: Dist; pct: Dist } {
  const tiers = itemTiers(items.map(toItem))
  const counts: Dist = { must: 0, may: 0, skip: 0 }
  for (const t of tiers.values()) counts[t]++
  const total = tiers.size || 1
  return {
    counts,
    pct: { must: (counts.must / total) * 100, may: (counts.may / total) * 100, skip: (counts.skip / total) * 100 },
  }
}

// 基线缺失时整组跳过（CI 与无基线环境零影响）；vitest 版本无 describe.skipIf，用条件挂载
const describeWithBaseline = existsSync(BASELINE) ? describe : describe.skip
const itWithGolden = existsSync(GOLDEN) ? it : it.skip

describeWithBaseline('日报分层漂移评估（基线存在时生效）', () => {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as { exportedAt: string; items: BaselineItem[] }
  const dist = distOf(baseline.items)

  it('基线条目全部得到分层', () => {
    expect(tiersCount(baseline.items)).toBe(baseline.items.length)
  })

  it('分布对比上次快照：任一档位偏移 ≤15 个百分点（超漂移阈值即告警）', () => {
    if (!existsSync(SNAPSHOT)) {
      writeFileSync(SNAPSHOT, JSON.stringify({ exportedAt: baseline.exportedAt, pct: dist.pct, counts: dist.counts }, null, 1))
      console.log(
        `[evalDrift] 已建立分布快照：必看 ${dist.pct.must.toFixed(1)}% / 可看 ${dist.pct.may.toFixed(1)}% / 可略 ${dist.pct.skip.toFixed(1)}%（${dist.counts.must}/${dist.counts.may}/${dist.counts.skip}）`,
      )
      return
    }
    const prev = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as { pct: Dist }
    for (const k of ['must', 'may', 'skip'] as const) {
      const drift = Math.abs(dist.pct[k] - prev.pct[k])
      expect(
        drift,
        `档位 ${k} 占比偏移 ${drift.toFixed(1)} 个百分点（${prev.pct[k].toFixed(1)}% → ${dist.pct[k].toFixed(1)}%）——词表/提示词/模型变更导致分层漂移；确认合理后删除 local/eval/drift-baseline.json 重建基线`,
      ).toBeLessThanOrEqual(DRIFT_PCT)
    }
    writeFileSync(SNAPSHOT, JSON.stringify({ exportedAt: baseline.exportedAt, pct: dist.pct, counts: dist.counts }, null, 1))
  })

  itWithGolden('金标重合度报告（只报告不断言）', () => {
    const text = readFileSync(GOLDEN, 'utf8')
    const marks = [...text.matchAll(/^(\d+)\. \[[^\]]*\].*?—— 金标：\s*(Y|N)/gim)].map((m) => ({ row: Number(m[1]), yes: m[2] === 'Y' }))
    if (marks.length === 0) {
      console.log('[evalDrift] golden.md 里还没有任何 Y/N 标记')
      return
    }
    // 模板行序 = 当日条目按（分数降序、时间升序）排列；此处按同一排序回链基线
    const latestDay = new Map<string, BaselineItem[]>()
    for (const b of baseline.items) {
      const d = localDateOf(b.fetchedAt)
      const list = latestDay.get(d)
      if (list) list.push(b)
      else latestDay.set(d, [b])
    }
    const day = [...latestDay.keys()].sort().at(-1)!
    const dayRows = latestDay.get(day)!.sort((a, b) => b.scoreTotal - a.scoreTotal || (a.fetchedAt < b.fetchedAt ? -1 : 1))
    const yesIds = new Set(marks.filter((m) => m.yes && m.row >= 1 && m.row <= dayRows.length).map((m) => dayRows[m.row - 1]!.id))
    const tiers = itemTiers(dayRows.map(toItem))
    const landing: Dist = { must: 0, may: 0, skip: 0 }
    let inMust = 0
    for (const id of yesIds) {
      const t = tiers.get(id)
      if (t) landing[t]++
      if (t === 'must') inMust++
    }
    console.log(
      `[evalDrift] 金标 ${yesIds.size}/${marks.length} 条标 Y；其中落系统「必看」${inMust} 条（重合率 ${yesIds.size ? ((inMust / yesIds.size) * 100).toFixed(0) : '-'}%），其余分布 可看 ${landing.may} / 可略 ${landing.skip}`,
    )
  })
})

function tiersCount(items: BaselineItem[]): number {
  return itemTiers(items.map(toItem)).size
}
