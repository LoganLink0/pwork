import { describe, expect, it } from 'vitest'
import { currentIntervalDays, isDue, isRetired, lastRevisitInvalid, nextDueAt, revisitAnchor } from './revisit'
import type { InsightRecord } from '../types/models'

const DAY = 24 * 60 * 60 * 1000

type Visit = InsightRecord['revisit'][number]

function makeInsight(createdAt: string, revisit: Visit[] = []): InsightRecord {
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

const at = (ms: number) => new Date(ms).toISOString()

describe('洞察回访引擎（三态间隔调度）', () => {
  const t0 = '2026-08-01T00:00:00.000Z'

  it('首次回访：7 天后到期（第 6 天未到期，第 7 天到期）', () => {
    const ins = makeInsight(t0)
    const t6 = new Date(t0).getTime() + 6 * DAY
    const t7 = new Date(t0).getTime() + 7 * DAY
    expect(isDue(ins, t6)).toBe(false)
    expect(isDue(ins, t7)).toBe(true)
    expect(nextDueAt(ins)).toBe(t7)
  })

  it('回访「成立」一次：锚点变为上次回访时间，间隔翻倍到 14 天', () => {
    const t10 = new Date(t0).getTime() + 10 * DAY
    const ins = makeInsight(t0, [{ at: at(t10), stillValid: true, result: 'valid' }])
    expect(revisitAnchor(ins)).toBe(t10)
    expect(currentIntervalDays(ins)).toBe(14)
    expect(isDue(ins, t10 + 13 * DAY)).toBe(false)
    expect(isDue(ins, t10 + 14 * DAY)).toBe(true)
  })

  it('连续「成立」间隔持续翻倍并封顶 180 天', () => {
    const v = (ms: number): Visit => ({ at: at(ms), stillValid: true, result: 'valid' })
    const once = makeInsight(t0, [v(10 * DAY)])
    expect(currentIntervalDays(once)).toBe(14)
    const twice = makeInsight(t0, [v(10 * DAY), v(30 * DAY)])
    expect(currentIntervalDays(twice)).toBe(28)
    const many = makeInsight(t0, [1, 2, 3, 4, 5, 6].map((n) => v(n * 30 * DAY)))
    expect(currentIntervalDays(many)).toBe(180)
  })

  it('「部分失效」：间隔重置 30 天', () => {
    const ins = makeInsight(t0, [
      { at: at(10 * DAY), stillValid: true, result: 'valid' },
      { at: at(30 * DAY), stillValid: true, result: 'valid' },
      { at: at(60 * DAY), stillValid: true, result: 'partial' },
    ])
    expect(currentIntervalDays(ins)).toBe(30)
  })

  it('「需要修正」：回访终结，永不再到期', () => {
    const ins = makeInsight(t0, [{ at: at(10 * DAY), stillValid: false, result: 'invalid' }])
    expect(isRetired(ins)).toBe(true)
    expect(lastRevisitInvalid(ins)).toBe(true)
    expect(isDue(ins, new Date(t0).getTime() + 3650 * DAY)).toBe(false)
  })

  it('旧记录无 result：按 stillValid 推导（true→成立翻倍 / false→终结）', () => {
    const legacyValid = makeInsight(t0, [{ at: at(10 * DAY), stillValid: true }])
    expect(currentIntervalDays(legacyValid)).toBe(14)
    const legacyInvalid = makeInsight(t0, [{ at: at(10 * DAY), stillValid: false }])
    expect(isRetired(legacyInvalid)).toBe(true)
  })

  it('多次回访取最近一次为锚点', () => {
    const t10 = new Date(t0).getTime() + 10 * DAY
    const t20 = new Date(t0).getTime() + 20 * DAY
    const ins = makeInsight(t0, [
      { at: at(t10), stillValid: true, result: 'valid' },
      { at: at(t20), stillValid: true, result: 'valid' },
    ])
    expect(revisitAnchor(ins)).toBe(t20)
  })

  it('缺少 createdAt 的旧数据按 0 处理（立即到期，促使补一次回访）', () => {
    const ins = { ...makeInsight(''), revisit: [] }
    expect(isDue(ins)).toBe(true)
  })
})
