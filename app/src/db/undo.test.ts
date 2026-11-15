import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './schema'
import { pushUndo, loadUndo, undoLast, revertChange, UNDO_KEY } from './undo'
import type { Note, TaskItem } from '../types/models'

beforeEach(async () => {
  await db.clearAll()
  await db.kv.delete(UNDO_KEY)
})

describe('revertChange（三方合并纯函数）', () => {
  const before = { id: 'x', title: '旧标题', body: '旧正文', updatedAt: '2026-11-14T00:00:00Z' }
  const after = { id: 'x', title: '新标题', body: '旧正文', updatedAt: '2026-11-14T10:00:00Z' }

  it('分支1：current==after（之后没动过）→ 回滚到 before', () => {
    const r = revertChange(before, after, { ...after })
    expect(r?.title).toBe('旧标题')
    expect(r?.body).toBe('旧正文')
  })

  it('分支2：current==before（用户已手动改回）→ 保持现在的值', () => {
    const r = revertChange(before, after, { ...before, updatedAt: after.updatedAt })
    expect(r?.title).toBe('旧标题')
  })

  it('分支3：current 是第三值（之后又被改过）→ 保留现在的值', () => {
    const r = revertChange(before, after, { ...after, title: '第三方标题' })
    expect(r?.title).toBe('第三方标题')
  })

  it('分支4：本次改动没碰的键保持 current', () => {
    const r = revertChange(before, after, { ...after, body: '用户后写的正文' })
    // body 在 before/after 相等 → 不回滚，保持用户的新正文
    expect(r?.body).toBe('用户后写的正文')
  })

  it('分支5：新增的撤销（before null）→ 移除实体', () => {
    expect(revertChange(null, { id: 'x' }, { id: 'x', title: '新速记' })).toBeNull()
  })

  it('分支6：删除的撤销（current null）→ 放回 before', () => {
    const r = revertChange(before, null, null)
    expect(r?.title).toBe('旧标题')
  })
})

describe('undo 栈（kv 持久化 + undoLast）', () => {
  it('pushUndo 入栈、超过 10 条截最旧', async () => {
    for (let i = 0; i < 12; i++) {
      await pushUndo({ label: `操作${i}`, ts: new Date(2026, 10, 15, 0, 0, i).toISOString(), changes: [] })
    }
    const s = await loadUndo()
    expect(s.entries).toHaveLength(10)
    expect(s.entries[0].label).toBe('操作2')
  })

  it('undoLast：弹栈顶、回滚实体、推进 updatedAt（LWW 防线）', async () => {
    const note: Note = {
      id: 'n1', title: '新标题', body: '正文', tags: [], links: { itemIds: [], reviewIds: [], taskIds: [] },
      source: 'manual', createdAt: '2026-11-14T09:00:00Z', updatedAt: '2026-11-14T10:00:00Z', deletedAt: null, schemaVersion: 1,
    }
    await db.notes.put(note)
    await pushUndo({
      label: '改标题',
      ts: '2026-11-14T10:00:00Z',
      changes: [{ table: 'notes', id: 'n1', before: { ...note, title: '旧标题' }, after: { ...note } }],
    })
    const now = new Date('2026-11-15T12:00:00Z')
    const r = await undoLast(now)
    expect(r.label).toBe('改标题')
    expect(r.applied).toBe(1)
    const after = (await db.notes.get('n1')) as unknown as Record<string, unknown>
    expect(after.title).toBe('旧标题')
    // LWW 防线：撤销写入的 updatedAt 必须晚于被撤销的写入
    expect(String(after.updatedAt)).toBe(now.toISOString())
    expect(after.undoOf).toBe(now.toISOString())
    // 栈顶已弹
    expect((await loadUndo()).entries).toHaveLength(0)
  })

  it('undoLast：删除的撤销把行放回原位', async () => {
    const t: TaskItem = {
      id: 't9', title: '被删的待办', status: 'todo',
      origin: { kind: 'manual', refId: null }, closedAt: null, deletedAt: null,
      createdAt: '2026-11-14T00:00:00Z', updatedAt: '2026-11-14T00:00:00Z', schemaVersion: 1,
    }
    await pushUndo({
      label: '删待办',
      ts: '2026-11-14T10:00:00Z',
      changes: [{ table: 'tasks', id: 't9', before: { ...t }, after: null }],
    })
    const r = await undoLast(new Date('2026-11-15T12:00:00Z'))
    expect(r.applied).toBe(1)
    const back = await db.tasks.get('t9')
    expect(back?.title).toBe('被删的待办')
    // 放回的行 updatedAt 推进——云端 LWW 不会用旧行压掉它
    expect((back as unknown as Record<string, unknown>).updatedAt).toBe('2026-11-15T12:00:00.000Z')
  })

  it('undoLast：新速记的撤销把行移除', async () => {
    const created: Note = {
      id: 'n_new', title: '新建', body: '刚记的', tags: [], links: { itemIds: [], reviewIds: [], taskIds: [] },
      source: 'quick', createdAt: '2026-11-14T09:00:00Z', updatedAt: '2026-11-14T09:00:00Z', deletedAt: null, schemaVersion: 1,
    }
    await db.notes.put(created)
    await pushUndo({
      label: '新建速记',
      ts: '2026-11-14T09:30:00Z',
      changes: [{ table: 'notes', id: 'n_new', before: null, after: { ...created } }],
    })
    const r = await undoLast(new Date('2026-11-15T12:00:00Z'))
    expect(r.applied).toBe(1)
    expect(await db.notes.get('n_new')).toBeUndefined()
  })

  it('空栈 undoLast 抛人话错误', async () => {
    await expect(undoLast()).rejects.toThrow('没有可撤销的操作')
  })

  it('白名单外表 skipped 不炸', async () => {
    await pushUndo({ label: '碰 kv', ts: '2026-11-14T00:00:00Z', changes: [{ table: 'kv', id: 'k', before: null, after: null }] })
    const r = await undoLast(new Date())
    expect(r.skipped).toBe(1)
  })
})
