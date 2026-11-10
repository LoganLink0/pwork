import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './schema'
import {
  addDaysLocal,
  createTask,
  deriveRecurrenceNext,
  getTask,
  normalizeTask,
  setTaskStatus,
  DONE_DATES_CAP,
  RECURRENCE_DAYS,
  RECURRENCE_LABEL,
} from './tasksRepo'
import type { TaskItem } from '../types/models'

/**
 * 循环待办与习惯追踪（1.5 批）：派生边界（跨月/跨年/闰日）、读取防御、闭环集成、
 * 完成记录截断。日期一律本地日口径。
 */

const mkTask = (over: Partial<TaskItem> & { id: string; title: string }): TaskItem => ({
  status: 'todo',
  origin: { kind: 'manual', refId: null },
  closedAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  deletedAt: null,
  schemaVersion: 1,
  ...over,
})

beforeEach(async () => {
  await db.clearAll()
})

describe('addDaysLocal（本地日期 +N 天）', () => {
  it('跨月：1 月 31 日 +7 天 = 2 月 7 日', () => {
    expect(addDaysLocal('2026-01-31', 7)).toBe('2026-02-07')
  })
  it('跨年：12 月 31 日 +7 天 = 次年 1 月 7 日', () => {
    expect(addDaysLocal('2026-12-31', 7)).toBe('2027-01-07')
  })
  it('闰年：2028 年 2 月 28 日 +1 天 = 2 月 29 日；平年顺延到 3 月 1 日', () => {
    expect(addDaysLocal('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDaysLocal('2026-02-28', 1)).toBe('2026-03-01')
  })
  it('每天循环连加 30 天不丢日', () => {
    let d = '2026-02-25'
    for (let i = 0; i < 30; i++) d = addDaysLocal(d, 1)
    expect(d).toBe('2026-03-27')
  })
})

describe('deriveRecurrenceNext（纯派生）', () => {
  it('从完成日派生下一期（不是从旧期限派生——逾期不雪崩）', () => {
    const task = mkTask({ id: 't1', title: '每周整理发票', recurrenceDays: 7, due: '2026-10-01' })
    const next = deriveRecurrenceNext(task, '2026-11-10')
    expect(next.due).toBe('2026-11-17')
    expect(next.status).toBe('todo')
    expect(next.closedAt).toBeNull()
    expect(next.doneDates).toEqual(['2026-11-10'])
  })

  it('完成记录追加并截最旧的（上限 52）', () => {
    const oldDates = Array.from({ length: DONE_DATES_CAP }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`)
    const task = mkTask({ id: 't2', title: '每天背单词', recurrenceDays: 1, doneDates: oldDates })
    const next = deriveRecurrenceNext(task, '2026-11-10')
    expect(next.doneDates).toHaveLength(DONE_DATES_CAP)
    expect(next.doneDates?.[0]).toBe('2026-01-02') // 最旧的被截掉
    expect(next.doneDates?.at(-1)).toBe('2026-11-10')
  })
})

describe('normalizeTask 读取防御', () => {
  it('recurrenceDays 非法值回 undefined，合法值保留', () => {
    expect(normalizeTask(mkTask({ id: 'a', title: 'x' })).recurrenceDays).toBeUndefined()
    expect(normalizeTask(mkTask({ id: 'b', title: 'x', recurrenceDays: 5 as never })).recurrenceDays).toBeUndefined()
    expect(normalizeTask(mkTask({ id: 'c', title: 'x', recurrenceDays: 7 })).recurrenceDays).toBe(7)
  })

  it('doneDates 非数组/坏条目/重复日期清洗，空数组回 undefined', () => {
    expect(normalizeTask(mkTask({ id: 'a', title: 'x', doneDates: 'x' as never })).doneDates).toBeUndefined()
    const dirty = normalizeTask(mkTask({
      id: 'b', title: 'x',
      doneDates: ['2026-11-01', '垃圾', 42 as never, '2026-11-01', '2026-11-02'],
    }))
    expect(dirty.doneDates).toEqual(['2026-11-01', '2026-11-02'])
    expect(normalizeTask(mkTask({ id: 'c', title: 'x', doneDates: [] })).doneDates).toBeUndefined()
  })

  it('间隔与叫法一一对应（界面同一概念全站同名）', () => {
    expect(RECURRENCE_DAYS).toEqual([1, 7, 14, 30, 90])
    expect(RECURRENCE_LABEL[7]).toBe('每周')
    expect(RECURRENCE_LABEL[90]).toBe('每季')
  })
})

describe('setTaskStatus 循环闭环集成（真实库）', () => {
  it('循环任务勾选完成：立即重开、due=完成日+间隔、完成记录 +1', async () => {
    await db.tasks.put(mkTask({ id: 'task_r1', title: '每周复盘发票', recurrenceDays: 7, due: '2026-01-01' }))
    await setTaskStatus('task_r1', 'done')
    const after = await getTask('task_r1')
    const today = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    const todayLocal = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`
    expect(after?.status).toBe('todo')
    expect(after?.due).toBe(addDaysLocal(todayLocal, 7))
    expect(after?.doneDates).toEqual([todayLocal])
    expect(after?.closedAt).toBeNull()
  })

  it('非循环任务勾选完成：照旧进 done 态（回归）', async () => {
    await db.tasks.put(mkTask({ id: 'task_r2', title: '一次性任务' }))
    await setTaskStatus('task_r2', 'done')
    const after = await getTask('task_r2')
    expect(after?.status).toBe('done')
    expect(after?.closedAt).toBeTruthy()
    expect(after?.doneDates).toBeUndefined()
  })

  it('循环任务搁置（dropped）不派生——终态就是终态', async () => {
    await db.tasks.put(mkTask({ id: 'task_r3', title: '不做了的循环', recurrenceDays: 30 }))
    await setTaskStatus('task_r3', 'dropped')
    const after = await getTask('task_r3')
    expect(after?.status).toBe('dropped')
    expect(after?.doneDates).toBeUndefined()
  })
})

describe('createTask 循环入参', () => {
  it('带 recurrenceDays 创建即循环任务', async () => {
    const t = await createTask({ title: '每天喝水打卡', recurrenceDays: 1 })
    expect(t.recurrenceDays).toBe(1)
    expect((await getTask(t.id))?.recurrenceDays).toBe(1)
  })
})
