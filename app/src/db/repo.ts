/**
 * 速记数据访问层（repo）。
 * 纪律：软删除优先（铁律 3）；读取侧防御可选字段（铁律 2）；导出统一包裹（02 §4）。
 */
import { db } from './schema'
import type { ExportBundle, Note, NoteLinks } from '../types/models'

/** 生成本地唯一 ID（无需 uuid 依赖） */
export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}_${rand}`
}

export const NOTE_SCHEMA_VERSION = 1

/** 读取防御：存量数据可能缺新字段（铁律 2，FUPAN 1.5 的教训前置） */
export function normalizeNote(raw: Note): Note {
  return {
    ...raw,
    title: raw.title ?? '',
    body: raw.body ?? '',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    links: {
      itemIds: raw.links?.itemIds ?? [],
      reviewIds: raw.links?.reviewIds ?? [],
      taskIds: raw.links?.taskIds ?? [],
    },
    source: raw.source === 'quick' ? 'quick' : 'manual',
    deletedAt: raw.deletedAt ?? null,
    schemaVersion: raw.schemaVersion ?? NOTE_SCHEMA_VERSION,
  }
}

/* ------------------------------ 速记 CRUD ------------------------------ */

export interface CreateNoteInput {
  title?: string
  body: string
  tags?: string[]
  source?: 'quick' | 'manual'
  /** 初始挂接（如条目卡"写速记"写入 links.itemIds） */
  links?: NoteLinks
}

/** 标题缺省取正文首行（截 30 字） */
export function deriveTitle(body: string): string {
  const firstLine = body.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? ''
  return firstLine.slice(0, 30)
}

export async function createNote(input: CreateNoteInput): Promise<Note> {
  const now = new Date().toISOString()
  const note: Note = normalizeNote({
    id: newId('note'),
    title: input.title?.trim() || deriveTitle(input.body),
    body: input.body,
    tags: input.tags ?? [],
    links: input.links ?? { itemIds: [], reviewIds: [], taskIds: [] },
    source: input.source ?? 'manual',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    schemaVersion: NOTE_SCHEMA_VERSION,
  })
  await db.notes.put(note)
  return note
}

export async function getNote(id: string): Promise<Note | undefined> {
  const raw = await db.notes.get(id)
  return raw ? normalizeNote(raw) : undefined
}

export async function saveNote(note: Note): Promise<void> {
  await db.notes.put({ ...note, updatedAt: new Date().toISOString() })
}

/**
 * 原子增量更新：读-改-写包在同一个读写事务里（开发复盘 1.2 的连点竞态——
 * 同批次两次 update 不同字段，后一个不得基于旧值整体覆盖）。
 */
/** 反向挂接维护：复盘 id 写入 note.links.reviewIds（去重） */
export async function attachReviewToNote(noteId: string, reviewId: string): Promise<void> {
  await db.transaction('rw', db.notes, async () => {
    const raw = await db.notes.get(noteId)
    if (!raw) return
    const note = normalizeNote(raw)
    if (note.links.reviewIds.includes(reviewId)) return
    note.links.reviewIds.push(reviewId)
    await db.notes.put({ ...note, updatedAt: new Date().toISOString() })
  })
}

/** 反向挂接维护：任务 id 写入 note.links.taskIds（去重） */
export async function attachTaskToNote(noteId: string, taskId: string): Promise<void> {
  await db.transaction('rw', db.notes, async () => {
    const raw = await db.notes.get(noteId)
    if (!raw) return
    const note = normalizeNote(raw)
    if (note.links.taskIds.includes(taskId)) return
    note.links.taskIds.push(taskId)
    await db.notes.put({ ...note, updatedAt: new Date().toISOString() })
  })
}

export async function updateNoteFields(
  id: string,
  patch: Partial<Pick<Note, 'body' | 'title' | 'tags' | 'links'>>,
): Promise<void> {
  await db.transaction('rw', db.notes, async () => {
    const raw = await db.notes.get(id)
    if (!raw) return
    const current = normalizeNote(raw)
    await db.notes.put({
      ...current,
      body: patch.body ?? current.body,
      title: patch.title?.trim() ? patch.title : current.title,
      tags: patch.tags ?? current.tags,
      updatedAt: new Date().toISOString(),
    })
  })
}

/** 未删除的速记，updatedAt 倒序 */
export async function listActiveNotes(): Promise<Note[]> {
  const all = await db.notes.toArray()
  return all
    .map(normalizeNote)
    .filter((n) => n.deletedAt === null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** 回收站：已软删除的速记，删除时间倒序 */
export async function listDeletedNotes(): Promise<Note[]> {
  const all = await db.notes.toArray()
  return all
    .map(normalizeNote)
    .filter((n) => n.deletedAt !== null)
    .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))
}

/** 软删除（铁律 3：不做物理删除） */
export async function softDeleteNote(id: string): Promise<void> {
  const note = await db.notes.get(id)
  if (!note || note.deletedAt) return
  await db.notes.put({ ...note, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
}

export async function restoreNote(id: string): Promise<void> {
  const note = await db.notes.get(id)
  if (!note || !note.deletedAt) return
  await db.notes.put({ ...note, deletedAt: null, updatedAt: new Date().toISOString() })
}

/* ------------------------------ 导出（备份先行，铁律 6） ------------------------------ */

/** 全量导出包裹：{ version, exportedAt, entities }（02 §4 统一格式） */
export async function exportBundle(): Promise<ExportBundle> {
  const notes = await db.notes.toArray()
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    entities: {
      notes: notes.map(normalizeNote),
    },
  }
}

/** 单条速记 → Markdown（frontmatter + 正文） */
export function noteToMarkdown(note: Note): string {
  const fm = [
    '---',
    `id: ${note.id}`,
    `created: ${note.createdAt}`,
    `updated: ${note.updatedAt}`,
    note.tags.length ? `tags: [${note.tags.join(', ')}]` : null,
    note.links.itemIds.length ? `link_items: [${note.links.itemIds.join(', ')}]` : null,
    note.links.reviewIds.length ? `link_reviews: [${note.links.reviewIds.join(', ')}]` : null,
    note.links.taskIds.length ? `link_tasks: [${note.links.taskIds.join(', ')}]` : null,
    '---',
  ]
    .filter((l): l is string => l !== null)
    .join('\n')
  const title = note.title.trim() || deriveTitle(note.body)
  return `${fm}\n\n# ${title}\n\n${note.body}\n`
}

/** 触发浏览器下载（JSON / md 通用） */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
