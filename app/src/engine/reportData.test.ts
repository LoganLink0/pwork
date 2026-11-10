import { describe, expect, it, beforeEach } from 'vitest'
import { db } from '../db/schema'
import { gatherReportData } from './reportData'
import { todayLocal } from './datetime'
import type { TaskItem } from '../types/models'

/** 循环待办的报告口径（1.5 批）：完成记录计入闭环清单、循环任务不进闭环率分母 */

function mkTask(over: Partial<TaskItem> & { id: string; title: string }): TaskItem {
  const now = new Date().toISOString()
  return {
    status: 'todo',
    origin: { kind: 'manual', refId: null },
    closedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    schemaVersion: 1,
    ...over,
  }
}

const shift = (localDate: string, days: number): string => {
  const [y, m, d] = localDate.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days, 12)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

beforeEach(async () => {
  await db.clearAll()
})

describe('循环待办的报告口径（1.5 批）', () => {
  it('完成记录计入闭环清单，循环任务不进闭环率分母', async () => {
    const now = new Date()
    const d0 = todayLocal(now)
    const d2 = shift(d0, -2)
    // 普通任务：本周闭环一次
    await db.tasks.put(mkTask({ id: 't_ok', title: '普通任务闭环', status: 'done', closedAt: `${d0}T08:00:00` }))
    // 循环任务：本周完成两次（勾选后即重开，处于 todo 态）
    await db.tasks.put(mkTask({ id: 't_rec', title: '每周整理发票', recurrenceDays: 7, status: 'todo', due: d0, doneDates: [d2, d0] }))

    const r = await gatherReportData('weekly', now)
    expect(r.tasks.closed).toHaveLength(3) // 普通 1 次 + 循环 2 次
    expect(r.tasks.closed.filter((c) => c.title === '每周整理发票')).toHaveLength(2)
    // 闭环率分母只看非循环任务：1 项全部闭环 → 100%（循环的永久 todo 不再拖垮这个数）
    expect(r.tasks.closureRate).toBe(100)
  })

  it('区间外的完成记录不计入', async () => {
    const now = new Date()
    const d0 = todayLocal(now)
    const d10 = shift(d0, -10) // 8 天前，周窗口（7 天）之外
    await db.tasks.put(mkTask({ id: 't_rec2', title: '月度循环', recurrenceDays: 30, doneDates: [d10] }))
    const r = await gatherReportData('weekly', now)
    expect(r.tasks.closed).toHaveLength(0)
  })

  it('只有循环任务时：本期完成过 → 闭环率 100（不再被永久 todo 拖到 0）', async () => {
    const now = new Date()
    const d0 = todayLocal(now)
    await db.tasks.put(mkTask({ id: 't_only', title: '每周整理发票', recurrenceDays: 7, doneDates: [d0] }))
    const r = await gatherReportData('weekly', now)
    expect(r.tasks.closed).toHaveLength(1)
    expect(r.tasks.closureRate).toBe(100)
  })

  it('循环任务本期没完成 → 闭环率如实回 0；普通任务照旧按完成数算', async () => {
    const now = new Date()
    await db.tasks.put(mkTask({ id: 't_miss', title: '本期没做的循环', recurrenceDays: 30 }))
    await db.tasks.put(mkTask({ id: 't_open', title: '普通任务未闭环', status: 'todo' }))
    const r = await gatherReportData('weekly', now)
    expect(r.tasks.closureRate).toBe(0)
  })

  it('混合口径：一次性闭环 + 循环本期兑现 = 100；一次性未闭环占分母', async () => {
    const now = new Date()
    const d0 = todayLocal(now)
    await db.tasks.put(mkTask({ id: 't_a', title: '一次性已闭环', status: 'done', closedAt: `${d0}T08:00:00` }))
    await db.tasks.put(mkTask({ id: 't_b', title: '一次性未闭环', status: 'todo' }))
    await db.tasks.put(mkTask({ id: 't_c', title: '循环已兑现', recurrenceDays: 7, doneDates: [d0] }))
    const r = await gatherReportData('weekly', now)
    // 分母 3（2 普通任务 + 1 循环），分子 2（闭环 1 + 循环兑现 1）→ 67
    expect(r.tasks.closureRate).toBe(67)
  })
})
