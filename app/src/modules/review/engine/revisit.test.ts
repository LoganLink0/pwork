import { describe, expect, it } from 'vitest'
import { isDue, lastRevisitInvalid, nextDueAt, revisitAnchor } from './revisit'
import type { InsightRecord } from '../types/models'

const DAY = 24 * 60 * 60 * 1000

function makeInsight(createdAt: string, revisit: { at: string; stillValid: boolean }[] = []): InsightRecord {
  return {
    id: 'ins_t',
    reviewId: 'rev_t',
    text: '测试洞察',
    tags: [],
    kind: 'inductive',
    verified: false,
    patternGroup: 'test',
    createdAt,
    revisit,
  }
}

describe('洞察回访引擎', () => {
  const t0 = '2026-08-01T00:00:00.000Z'

  it('首次回访：7 天后到期（第 6 天未到期，第 7 天到期）', () => {
    const ins = makeInsight(t0)
    const t6 = new Date(t0).getTime() + 6 * DAY
    const t7 = new Date(t0).getTime() + 7 * DAY
    expect(isDue(ins, t6)).toBe(false)
    expect(isDue(ins, t7)).toBe(true)
    expect(nextDueAt(ins)).toBe(t7)
  })

  it('回访过一次后，锚点变为上次回访时间，周期拉长到 30 天', () => {
    const t10 = new Date(t0).getTime() + 10 * DAY
    const ins = makeInsight(t0, [{ at: new Date(t10).toISOString(), stillValid: true }])
    expect(revisitAnchor(ins)).toBe(t10)
    const t39 = t10 + 29 * DAY
    const t40 = t10 + 30 * DAY
    expect(isDue(ins, t39)).toBe(false)
    expect(isDue(ins, t40)).toBe(true)
  })

  it('多次回访取最近一次为锚点', () => {
    const t10 = new Date(t0).getTime() + 10 * DAY
    const t20 = new Date(t0).getTime() + 20 * DAY
    const ins = makeInsight(t0, [
      { at: new Date(t10).toISOString(), stillValid: true },
      { at: new Date(t20).toISOString(), stillValid: true },
    ])
    expect(revisitAnchor(ins)).toBe(t20)
  })

  it('最近一次回访判定"需要修正"时展示已修正状态', () => {
    const t10 = new Date(t0).getTime() + 10 * DAY
    expect(lastRevisitInvalid(makeInsight(t0, [{ at: new Date(t10).toISOString(), stillValid: false }]))).toBe(true)
    expect(lastRevisitInvalid(makeInsight(t0, [{ at: new Date(t10).toISOString(), stillValid: true }]))).toBe(false)
    expect(lastRevisitInvalid(makeInsight(t0))).toBe(false)
  })

  it('缺少 createdAt 的旧数据按 0 处理（立即到期，促使补一次回访）', () => {
    const ins = { ...makeInsight(''), revisit: [] }
    expect(isDue(ins)).toBe(true)
  })
})
