import { describe, expect, it } from 'vitest'
import { fmtCompact, fmtLocal, greetWord, nextCalendarDay, relTime, todayLocal, weekdayLocal } from './datetime'

/** UTC 时区漂移回归（开发复盘 1.4）：本地 0:30 不得被算成"昨天/明天" */
describe('todayLocal / fmtLocal（本地时区）', () => {
  it('UTC+8 早 8 点前，todayLocal 仍是本地当天', () => {
    // 本地 2026-08-01 00:30 —— toISOString 会漂到 07-31，这里必须是 08-01
    expect(todayLocal(new Date(2026, 7, 1, 0, 30))).toBe('2026-08-01')
  })

  it('月末跨日正确', () => {
    expect(todayLocal(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })

  it('fmtLocal 输出本地时刻', () => {
    const d = new Date(2026, 7, 30, 9, 5)
    expect(fmtLocal(d.toISOString())).toBe('2026-08-30 09:05')
  })

  it('非法输入返回占位符', () => {
    expect(fmtLocal('not-a-date')).toBe('—')
  })
})

describe('relTime（相对时间）', () => {
  const now = new Date(2026, 7, 30, 12, 0)

  it('一分钟内 → 刚刚', () => {
    expect(relTime(new Date(2026, 7, 30, 11, 59, 40).toISOString(), now)).toBe('刚刚')
  })

  it('一小时内 → N 分钟前', () => {
    expect(relTime(new Date(2026, 7, 30, 11, 30).toISOString(), now)).toBe('30 分钟前')
  })

  it('同日更早 → N 小时前', () => {
    expect(relTime(new Date(2026, 7, 30, 9, 0).toISOString(), now)).toBe('3 小时前')
  })

  it('昨天 → 昨天 HH:MM', () => {
    expect(relTime(new Date(2026, 7, 29, 22, 40).toISOString(), now)).toBe('昨天 22:40')
  })

  it('今年更早 → M月D日', () => {
    expect(relTime(new Date(2026, 4, 2).toISOString(), now)).toBe('5月2日')
  })

  it('去年 → 带年份', () => {
    expect(relTime(new Date(2025, 4, 2).toISOString(), now)).toBe('2025-05-02')
  })
})

describe('greetWord / weekdayLocal', () => {
  it('按本地时刻给出问候', () => {
    expect(greetWord(new Date(2026, 7, 30, 8, 0))).toBe('早安')
    expect(greetWord(new Date(2026, 7, 30, 20, 0))).toBe('晚上好')
  })

  it('weekdayLocal 中文星期', () => {
    expect(weekdayLocal(new Date(2026, 7, 30))).toBe('日') // 2026-08-30 是周日
  })
})

describe('nextCalendarDay（日报日期导航：日历口径，不被"有数据的日子"绑死）', () => {
  it('昨天 → 今天；普通日 → 次日；跨月也对', () => {
    expect(nextCalendarDay('2026-10-20', '2026-10-21')).toBe('2026-10-21')
    expect(nextCalendarDay('2026-10-18', '2026-10-21')).toBe('2026-10-19')
    expect(nextCalendarDay('2026-09-30', '2026-10-21')).toBe('2026-10-01')
  })

  it('已在今天或日期越界/非法 → null（▶ 禁用）', () => {
    expect(nextCalendarDay('2026-10-21', '2026-10-21')).toBeNull()
    expect(nextCalendarDay('2026-10-22', '2026-10-21')).toBeNull()
    expect(nextCalendarDay('', '2026-10-21')).toBeNull()
    expect(nextCalendarDay('bad', '2026-10-21')).toBeNull()
  })
})

describe('fmtCompact（条目卡入库时间）', () => {
  it('同一天只显 HH:mm；跨天显 MM-DD HH:mm；非法输入空串', () => {
    const now = new Date(2026, 9, 21, 12, 0)
    // 时间戳用本地分量构造再 toISOString 往返——期望值即本地时刻，测试不依赖运行时区（CI 在 UTC 跑同理）
    expect(fmtCompact(new Date(2026, 9, 21, 2, 14).toISOString(), now)).toBe('02:14')
    expect(fmtCompact(new Date(2026, 9, 19, 8, 5).toISOString(), now)).toBe('10-19 08:05')
    expect(fmtCompact('not-a-date')).toBe('')
  })
})
