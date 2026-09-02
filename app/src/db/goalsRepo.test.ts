import { beforeEach, describe, expect, it } from 'vitest'
import { createGoal, listAllGoals, updateDue, updateProgress } from './goalsRepo'
import { db } from './schema'

/** 目标数据层：期限入口（Time-bound）与进度轨迹（追加不改写） */

beforeEach(async () => {
  await db.goals.clear()
})

describe('goalsRepo', () => {
  it('创建时可不带期限，随后可通过 updateDue 设定/清除', async () => {
    const g = await createGoal({ title: '三个月内完成备份演练' })
    expect(g.due).toBeUndefined()

    await updateDue(g.id, '2026-12-01')
    let stored = (await listAllGoals()).find((x) => x.id === g.id)
    expect(stored?.due).toBe('2026-12-01')

    // 清除（空串/undefined 归一为无期限）
    await updateDue(g.id, undefined)
    stored = (await listAllGoals()).find((x) => x.id === g.id)
    expect(stored?.due).toBeUndefined()
  })

  it('updateProgress 追加轨迹不改写历史，progressNote 恒等于最后一条', async () => {
    const g = await createGoal({ title: '跑通一次全量备份' })
    await updateProgress(g.id, '完成了首次导出')
    await updateProgress(g.id, '恢复了其中三条记录验证')

    const stored = (await listAllGoals()).find((x) => x.id === g.id)
    expect(stored?.progressNote).toBe('恢复了其中三条记录验证')
    const log = stored?.progressLog ?? []
    expect(log).toHaveLength(2)
    expect(log[0]?.note).toBe('完成了首次导出')
    expect(log[1]?.note).toBe('恢复了其中三条记录验证')
    // 轨迹时间戳单调
    expect(log[0]!.at <= log[1]!.at).toBe(true)
  })
})
