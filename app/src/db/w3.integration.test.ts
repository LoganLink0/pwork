import { describe, expect, it } from 'vitest'
import { createTasksFromActions, createTask, dueStats, listTasks, setTaskStatus } from './tasksRepo'
import { importBundle } from './backup'
import { db } from './schema'
import { newId } from './repo'
import type { ActionItem } from '../modules/review/types/models'
import { todayLocal } from '../engine/datetime'

async function seedAction(over: Partial<ActionItem> = {}): Promise<ActionItem> {
  const a: ActionItem = {
    id: newId('act'),
    reviewId: 'rev_x',
    kind: 'start',
    text: '把评分权重反馈整理进兴趣域配置',
    ifThen: '如果打开设置，就先看采集偏好',
    due: todayLocal(),
    status: 'open',
    closedAt: null,
    ...over,
  }
  await db.actions.put(a)
  return a
}

describe('W3 桥接：createTasksFromActions', () => {
  it('行动项批量落任务库，origin 溯源 + taskId 回写（03 §4）', async () => {
    const a1 = await seedAction()
    const a2 = await seedAction({ text: '回复合作邮件', due: undefined, ifThen: undefined })
    await db.actions.put(a2)
    const created = await createTasksFromActions([a1, a2])

    expect(created).toHaveLength(2)
    const tasks = await listTasks()
    expect(tasks).toHaveLength(2)
    // origin 指向 ActionItem
    expect(tasks.map((t) => t.origin)).toEqual([
      { kind: 'review', refId: a1.id },
      { kind: 'review', refId: a2.id },
    ])
    // taskId 回写到 ActionItem（字段只增不删）
    expect((await db.actions.get(a1.id))?.taskId).toBe(created.find((t) => t.origin.refId === a1.id)!.id)
    // if-then 语义保留
    const t1 = tasks.find((t) => t.origin.refId === a1.id)!
    expect(t1.ifThen).toBe(a1.ifThen)
  })

  it('空文本行动项跳过', async () => {
    const a = await seedAction({ text: '  ' })
    expect(await createTasksFromActions([a])).toHaveLength(0)
  })
})

describe('W3 桥接：任务闭环反向同步 ActionItem', () => {
  it('完成任务 → ActionItem.status=done + closedAt；重开 → open', async () => {
    const a = await seedAction()
    const [task] = await createTasksFromActions([a])

    await setTaskStatus(task.id, 'done')
    expect((await db.actions.get(a.id))?.status).toBe('done')
    expect((await db.actions.get(a.id))?.closedAt).toBeTruthy()

    await setTaskStatus(task.id, 'todo')
    expect((await db.actions.get(a.id))?.status).toBe('open')
    expect((await db.actions.get(a.id))?.closedAt).toBeNull()
  })
})

describe('dueStats（首页瓦片/侧边栏）', () => {
  it('今天（含逾期）/本周/闭环计数', async () => {
    const today = todayLocal()
    await createTask({ title: '今天到期', due: today })
    await createTask({ title: '已逾期', due: '2026-08-01' })
    await createTask({ title: '本周稍后', due: '2099-01-01' }) // 超出一周不算本周
    const t = await createTask({ title: '会闭环的', due: today })
    await setTaskStatus(t.id, 'done')

    const s = await dueStats()
    expect(s.today).toBe(2) // 今天 + 逾期
    expect(s.open).toBe(3)
    expect(s.done).toBe(1)
  })
})

describe('importBundle（统一导入：FUPAN v1 + PWORK v2，LWW）', () => {
  it('FUPAN v1 旧格式（顶层 reviews/actions/insights）无损导入', async () => {
    const rev = {
      id: 'rev_old', type: 'personal', scenario: 'habit', templateId: 't', title: '旧复盘',
      createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      status: 'archived', quick: false, clap: { comparison: { goals: [], results: [], gaps: [] }, logic: { causes: [] }, acknowledge: { insights: [] }, project: { actions: [] } }, summary: [],
    }
    const act = { id: 'act_old', reviewId: 'rev_old', kind: 'start', text: '旧行动', status: 'open', closedAt: null }
    const r = await importBundle(JSON.stringify({ version: 1, exportedAt: '2026-08-01T00:00:00.000Z', reviews: [rev], actions: [act], insights: [] }))
    expect(r.format).toBe('fupan-v1')
    expect(r.counts.reviews).toBe(1)
    expect(r.counts.actions).toBe(1)
    expect((await db.reviews.get('rev_old'))?.title).toBe('旧复盘')

    // 再导入一次：LWW → 零写入
    const r2 = await importBundle(JSON.stringify({ version: 1, exportedAt: '2026-08-01T00:00:00.000Z', reviews: [rev], actions: [act], insights: [] }))
    expect(r2.counts.reviews).toBe(0)
    expect(r2.counts.actions).toBe(0)
  })

  it('PWORK v2 包裹：notes + tasks 合并', async () => {
    const note = {
      id: 'note_imp', title: '导入的速记', body: '正文', tags: [], links: { itemIds: [], reviewIds: [], taskIds: [] },
      source: 'manual', createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:00:00.000Z', deletedAt: null, schemaVersion: 1,
    }
    const task = {
      id: 'task_imp', title: '导入的任务', status: 'todo', origin: { kind: 'manual', refId: null },
      closedAt: null, createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:00:00.000Z', deletedAt: null, schemaVersion: 1,
    }
    const r = await importBundle(JSON.stringify({ version: 2, exportedAt: '2026-08-30T00:00:00.000Z', entities: { notes: [note], tasks: [task] } }))
    expect(r.format).toBe('pwork-v2')
    expect(r.counts.notes).toBe(1)
    expect(r.counts.tasks).toBe(1)
    expect((await db.tasks.get('task_imp'))?.title).toBe('导入的任务')
  })
})
