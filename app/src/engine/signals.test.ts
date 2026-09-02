import { describe, expect, it } from 'vitest'
import { collectSignals, type SignalInput } from './signals'
import { todayLocal } from './datetime'

function input(over: Partial<SignalInput> = {}): SignalInput {
  return {
    openTasks: [],
    lastReviewCreatedAt: null,
    patternCounts: {},
    now: new Date(2026, 7, 31, 12, 0),
    ...over,
  }
}

describe('collectSignals（03 §4 信号触发）', () => {
  it('逾期任务 ≥2 → tasks-overdue', () => {
    const s = collectSignals(input({ openTasks: [{ title: '逾期甲', due: '2026-08-29' }, { title: '逾期乙', due: '2026-08-30' }] }))
    expect(s.find((x) => x.kind === 'tasks-overdue')?.message).toContain('2 项任务已逾期')
  })

  it('逾期 1 项不触发', () => {
    const s = collectSignals(input({ openTasks: [{ title: '只逾期一件', due: '2026-08-01' }] }))
    expect(s.find((x) => x.kind === 'tasks-overdue')).toBeUndefined()
  })

  it('距上次复盘 ≥7 天 → review-due（种子日期相对注入的 now=08-31 为 8 天）', () => {
    const s = collectSignals(input({ lastReviewCreatedAt: '2026-08-23T00:00:00.000Z' }))
    expect(s.find((x) => x.kind === 'review-due')?.message).toContain('8 天')
  })

  it('不足 7 天不触发（种子相对注入 now 为 3 天）', () => {
    const s = collectSignals(input({ lastReviewCreatedAt: '2026-08-28T00:00:00.000Z' }))
    expect(s.find((x) => x.kind === 'review-due')).toBeUndefined()
  })

  it('同模式 ≥3 次 → pattern-repeat', () => {
    const s = collectSignals(input({ patternCounts: { '晚睡': 3 } }))
    expect(s.find((x) => x.kind === 'pattern-repeat')).toBeDefined()
  })

  it('无信号 → 空数组', () => {
    expect(collectSignals(input())).toEqual([])
    expect(todayLocal(input().now)).toBe('2026-08-31')
  })
})
