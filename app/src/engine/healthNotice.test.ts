import { describe, it, expect, beforeEach } from 'vitest'
import { evaluateHealth, ERROR_THRESHOLD, dismissHealthToday, healthDismissedToday } from './healthNotice'
import type { ErrorLogEntry } from '../types/models'

/** 构造一条 N 天前的错误日志 */
function err(daysAgo: number): ErrorLogEntry {
  return {
    id: `e_${daysAgo}_${Math.random().toString(36).slice(2, 6)}`,
    where: '测试',
    kind: 'app',
    message: '测试错误',
    at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  } as ErrorLogEntry
}

beforeEach(() => localStorage.clear())

describe('首页健康提示判定（evaluateHealth）', () => {
  it('近一周错误超过阈值才提示，条数准确', () => {
    const errors = Array.from({ length: ERROR_THRESHOLD + 1 }, (_, i) => err(i % 5))
    const n = evaluateHealth(errors)
    expect(n).not.toBeNull()
    expect(n?.title).toBe(`近一周有 ${ERROR_THRESHOLD + 1} 条错误记录`)
    expect(n?.to).toBe('/settings?tab=errors')
  })

  it('阈值内（含等于）不提示', () => {
    expect(evaluateHealth(Array.from({ length: ERROR_THRESHOLD }, (_, i) => err(i)))).toBeNull()
    expect(evaluateHealth([])).toBeNull()
  })

  it('一周前的旧错误不计入', () => {
    const errors = [...Array.from({ length: ERROR_THRESHOLD + 2 }, () => err(10))]
    expect(evaluateHealth(errors)).toBeNull()
  })

  it('混合新旧：只有一周内的计入（6 条一周内 + 2 条旧的 → 提示 6 条）', () => {
    const errors = [...Array.from({ length: ERROR_THRESHOLD + 1 }, () => err(1)), err(30), err(20)]
    const n = evaluateHealth(errors)
    expect(n?.title).toBe(`近一周有 ${ERROR_THRESHOLD + 1} 条错误记录`)
  })
})

describe('当天关闭（dismissHealthToday / healthDismissedToday）', () => {
  it('关闭后当天命中，次日不再命中', () => {
    const now = new Date('2026-11-06T10:00:00')
    dismissHealthToday('errors', now)
    expect(healthDismissedToday('errors', now)).toBe(true)
    expect(healthDismissedToday('other', now)).toBe(false)
    const nextDay = new Date('2026-11-07T10:00:00')
    expect(healthDismissedToday('errors', nextDay)).toBe(false)
  })

  it('未关闭过返回 false', () => {
    expect(healthDismissedToday('errors')).toBe(false)
  })
})
