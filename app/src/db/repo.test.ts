import { describe, expect, it } from 'vitest'
import {
  createNote,
  deriveTitle,
  exportBundle,
  getNote,
  listActiveNotes,
  listDeletedNotes,
  newId,
  noteToMarkdown,
  normalizeNote,
  restoreNote,
  saveNote,
  softDeleteNote,
} from './repo'
import { db } from './schema'
import type { Note } from '../types/models'

// 铁律 7：fake-indexeddb 内存实现，与真实库物理隔离（setup.ts 已 clear）

describe('newId', () => {
  it('带前缀且不重复', () => {
    const a = newId('note')
    const b = newId('note')
    expect(a).toMatch(/^note_/)
    expect(a).not.toBe(b)
  })
})

describe('createNote / getNote', () => {
  it('铁律 1：必备字段齐全（id/createdAt/updatedAt/schemaVersion）', async () => {
    const n = await createNote({ body: '第一条速记', tags: ['想法'] })
    expect(n.id).toMatch(/^note_/)
    expect(n.createdAt).toBeTruthy()
    expect(n.updatedAt).toBeTruthy()
    expect(n.schemaVersion).toBe(1)
    expect(n.deletedAt).toBeNull()
    const got = await getNote(n.id)
    expect(got?.body).toBe('第一条速记')
  })

  it('标题缺省取正文首行并截 30 字', async () => {
    const n = await createNote({ body: '\n  \n标题行会被取用\n正文第二行' })
    expect(n.title).toBe('标题行会被取用')
    expect(deriveTitle('x'.repeat(50))).toHaveLength(30)
  })

  it('空行开头时跳过空行取首个非空行', () => {
    expect(deriveTitle('\n\n  hello  \nworld')).toBe('hello')
  })
})

describe('normalizeNote（铁律 2：读取防御）', () => {
  it('缺 tags/links/source/deletedAt 的存量数据被补全', () => {
    const raw = {
      id: 'note_old',
      title: '旧数据',
      body: '旧正文',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as unknown as Note
    const n = normalizeNote(raw)
    expect(n.tags).toEqual([])
    expect(n.links).toEqual({ itemIds: [], reviewIds: [], taskIds: [] })
    expect(n.source).toBe('manual')
    expect(n.deletedAt).toBeNull()
    expect(n.schemaVersion).toBe(1)
  })
})

describe('软删除（铁律 3）', () => {
  it('软删除后从活跃列表消失、进入回收站；恢复后回来', async () => {
    const a = await createNote({ body: '会被删除的速记' })
    await createNote({ body: '留下来的速记' })

    await softDeleteNote(a.id)
    let active = await listActiveNotes()
    let deleted = await listDeletedNotes()
    expect(active.map((n) => n.id)).not.toContain(a.id)
    expect(deleted.map((n) => n.id)).toContain(a.id)
    // 数据仍在库里（物理未删）
    const raw = await db.notes.get(a.id)
    expect(raw?.deletedAt).toBeTruthy()

    await restoreNote(a.id)
    active = await listActiveNotes()
    deleted = await listDeletedNotes()
    expect(active.map((n) => n.id)).toContain(a.id)
    expect(deleted).toHaveLength(0)
  })

  it('重复软删除 / 恢复未删除项为幂等', async () => {
    const a = await createNote({ body: '幂等测试' })
    await softDeleteNote(a.id)
    await softDeleteNote(a.id)
    expect((await listDeletedNotes()).map((n) => n.id)).toEqual([a.id])
    await restoreNote(a.id)
    await restoreNote(a.id)
    expect(await listDeletedNotes()).toHaveLength(0)
  })
})

describe('listActiveNotes 排序', () => {
  it('按 updatedAt 倒序（最近编辑在最前）', async () => {
    const a = await createNote({ body: '旧' })
    const b = await createNote({ body: '新' })
    // 再改 a，让 a 的 updatedAt 最新
    await saveNote({ ...(await getNote(a.id))!, body: '旧（已编辑）' })
    const list = await listActiveNotes()
    expect(list[0]!.id).toBe(a.id)
    expect(list[1]!.id).toBe(b.id)
  })
})

describe('导出（铁律 6：备份先行 + 02 §4 统一包裹）', () => {
  it('包裹为 { version, exportedAt, entities.notes }，含软删除数据', async () => {
    const a = await createNote({ body: '会被导出' })
    const b = await createNote({ body: '会被删除后导出' })
    await softDeleteNote(b.id)

    const bundle = await exportBundle()
    expect(bundle.version).toBe(1)
    expect(bundle.exportedAt).toBeTruthy()
    expect(bundle.entities.notes.map((n) => n.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('noteToMarkdown 输出 frontmatter + 标题 + 正文', async () => {
    const n = await createNote({ body: '正文内容', tags: ['想法'] })
    const md = noteToMarkdown(n)
    expect(md).toContain('---')
    expect(md).toContain(`id: ${n.id}`)
    expect(md).toContain('tags: [想法]')
    expect(md).toContain('# ')
    expect(md).toContain('正文内容')
  })
})

describe('saveNote', () => {
  it('更新时 bump updatedAt', async () => {
    const n = await createNote({ body: 'v1' })
    const before = n.updatedAt
    await new Promise((r) => setTimeout(r, 5))
    await saveNote({ ...n, body: 'v2' })
    const after = await getNote(n.id)
    expect(after?.body).toBe('v2')
    expect(after!.updatedAt > before).toBe(true)
  })
})
