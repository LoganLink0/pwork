import { describe, expect, it } from 'vitest'
import { fmtLocal, monthLocal, todayLocal } from './datetime'

describe('本地时间格式化', () => {
  it('按本地时区格式化，不被 UTC 偏移（toISOString 的老 bug）', () => {
    const d = new Date(2026, 7, 29, 20, 5) // 本地 2026-08-29 20:05
    expect(fmtLocal(d.toISOString())).toBe('2026-08-29 20:05')
    expect(todayLocal(d)).toBe('2026-08-29')
    expect(monthLocal(d)).toBe('2026-08')
  })

  it('跨月边界：本地 8 月 1 日 0:30 不会被 UTC 折算成 7 月 31 日', () => {
    const d = new Date(2026, 7, 1, 0, 30)
    expect(monthLocal(d)).toBe('2026-08')
    expect(todayLocal(d)).toBe('2026-08-01')
  })

  it('无效输入返回占位符', () => {
    expect(fmtLocal('not-a-date')).toBe('—')
  })
})
