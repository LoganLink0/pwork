import { beforeEach, describe, expect, it } from 'vitest'
import {
  actionStats,
  closeAction,
  deleteReview,
  exportAll,
  getReview,
  importAll,
  listOpenActions,
  listReviews,
  newId,
  saveReview,
  updateInsight,
  upsertActions,
} from './repo'
import { emptyClap, type ReviewRecord } from '../types/models'

function makeReview(id: string): ReviewRecord {
  const now = new Date().toISOString()
  return {
    id,
    type: 'personal',
    scenario: 'daily',
    templateId: 'personal-daily',
    title: `测试档案 ${id}`,
    createdAt: now,
    updatedAt: now,
    status: 'archived',
    quick: true,
    clap: emptyClap(),
    summary: ['一', '二', '三'],
  }
}

beforeEach(async () => {
  const bundle = await exportAll()
  await importAll({ ...bundle, reviews: [], actions: [], insights: [] }, 'overwrite')
})

describe('复盘档案仓储', () => {
  it('保存后可读取，列表按更新时间倒序', async () => {
    const a = makeReview(newId('rev'))
    await new Promise((r) => setTimeout(r, 5))
    const b = makeReview(newId('rev'))
    await saveReview(a)
    await saveReview(b)

    const got = await getReview(b.id)
    expect(got?.title).toBe(b.title)

    const list = await listReviews()
    expect(list.map((r) => r.id)).toEqual([b.id, a.id])
  })

  it('级联删除：档案连同其行动项与洞察卡一并清除', async () => {
    const rec = makeReview(newId('rev'))
    await saveReview(rec)
    await upsertActions(rec.id, [
      { id: newId('act'), reviewId: rec.id, kind: 'start', text: '做一件事', status: 'open', closedAt: null },
    ])
    await deleteReview(rec.id)

    expect(await getReview(rec.id)).toBeUndefined()
    expect(await listOpenActions()).toEqual([])
  })
})

describe('行动项待办池', () => {
  it('只列 open 项，按期限排序，可闭环', async () => {
    const rec = makeReview(newId('rev'))
    await saveReview(rec)
    const act = (id: string, due: string) => ({
      id,
      reviewId: rec.id,
      kind: 'start' as const,
      text: `任务${id}`,
      due,
      status: 'open' as const,
      closedAt: null,
    })
    const a1 = act(newId('act'), '2026-09-10')
    const a2 = act(newId('act'), '2026-09-01')
    const a3 = act(newId('act'), '2026-08-01')
    await upsertActions(rec.id, [a1, a2, a3])
    await closeAction(a3.id, 'done')

    const open = await listOpenActions()
    expect(open.map((x) => x.id)).toEqual([a2.id, a1.id])

    // 统计：3 个行动项，闭环 1 个 → 1/3
    const stats = await actionStats()
    expect(stats.open).toBe(2)
    expect(stats.done).toBe(1)
    expect(stats.closureRate).toBeCloseTo(1 / 3)
  })

  it('没有行动项时闭环率为 0 而非 NaN', async () => {
    const stats = await actionStats()
    expect(stats.closureRate).toBe(0)
  })
})

describe('洞察卡更新', () => {
  it('回访记录可写回并持久化', async () => {
    const rec = makeReview(newId('rev'))
    await saveReview(rec)
    const id = newId('ins')
    await updateInsight({
      id,
      reviewId: rec.id,
      text: '测试认知',
      tags: [],
      kind: 'inductive',
      verified: false,
      patternGroup: 'test',
      createdAt: new Date().toISOString(),
      revisit: [],
    })
    const at = new Date().toISOString()
    await updateInsight({
      id,
      reviewId: rec.id,
      text: '测试认知',
      tags: [],
      kind: 'inductive',
      verified: false,
      patternGroup: 'test',
      createdAt: new Date().toISOString(),
      revisit: [{ at, stillValid: true }],
    })

    const bundle = await exportAll()
    const stored = bundle.insights.find((i) => i.id === id)
    expect(stored?.revisit).toHaveLength(1)
    expect(stored?.revisit[0].stillValid).toBe(true)
  })
})

describe('全量导出与导入', () => {
  it('导出 → 清空 → 导入（覆盖模式）后数据一致', async () => {
    const rec = makeReview(newId('rev'))
    await saveReview(rec)
    const actionId = newId('act')
    await upsertActions(rec.id, [
      { id: actionId, reviewId: rec.id, kind: 'stop', text: '停掉无效会议', status: 'open', closedAt: null },
    ])

    const bundle = await exportAll()
    expect(bundle.version).toBe(1)
    expect(bundle.reviews).toHaveLength(1)
    expect(bundle.actions).toHaveLength(1)

    await importAll({ ...bundle, reviews: [], actions: [], insights: [] }, 'overwrite')
    expect(await listReviews()).toEqual([])

    await importAll(bundle, 'overwrite')
    const restored = await listReviews()
    expect(restored).toHaveLength(1)
    expect(restored[0].title).toBe(rec.title)
  })

  it('拒绝不支持的备份版本', async () => {
    const bundle = await exportAll()
    await expect(importAll({ ...bundle, version: 99 as never })).rejects.toThrow(/备份版本/)
  })
})

import { deleteInsight, listActionsByReview, updateAction } from './repo'
import type { InsightRecord } from '../types/models'

describe('第一批缺口：洞察卡删除 / 行动项编辑 / 按复盘查行动项', () => {
  it('洞察卡可删除', async () => {
    const rec = makeReview(newId('rev'))
    await saveReview(rec)
    const ins: InsightRecord = {
      id: newId('ins'),
      reviewId: rec.id,
      text: '写错的洞察',
      tags: [],
      kind: 'inductive',
      verified: false,
      patternGroup: 't',
      createdAt: new Date().toISOString(),
      revisit: [],
    }
    await updateInsight(ins)
    expect((await exportAll()).insights).toHaveLength(1)
    await deleteInsight(ins.id)
    expect((await exportAll()).insights).toHaveLength(0)
  })

  it('行动项可编辑（改期/改内容）且溯源字段保留', async () => {
    const rec = makeReview(newId('rev'))
    await saveReview(rec)
    const id = newId('act')
    await upsertActions(rec.id, [
      { id, reviewId: rec.id, kind: 'start', text: '原计划', due: '2026-09-01', status: 'open', closedAt: null },
    ])
    await updateAction(id, { text: '改后的计划', due: '2026-09-20' })
    const all = (await exportAll()).actions
    const edited = all.find((a) => a.id === id)
    expect(edited?.text).toBe('改后的计划')
    expect(edited?.due).toBe('2026-09-20')
    expect(edited?.reviewId).toBe(rec.id)
  })

  it('按复盘查行动项', async () => {
    const r1 = makeReview(newId('rev'))
    const r2 = makeReview(newId('rev'))
    await saveReview(r1)
    await saveReview(r2)
    await upsertActions(r1.id, [
      { id: newId('act'), reviewId: r1.id, kind: 'start', text: 'r1 的事', status: 'open', closedAt: null },
    ])
    await upsertActions(r2.id, [
      { id: newId('act'), reviewId: r2.id, kind: 'stop', text: 'r2 的事', status: 'open', closedAt: null },
    ])
    const mine = await listActionsByReview(r1.id)
    expect(mine).toHaveLength(1)
    expect(mine[0].text).toBe('r1 的事')
  })
})
