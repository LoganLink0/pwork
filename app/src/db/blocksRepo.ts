/**
 * 外部数据块数据访问层（输出扩展）：工作台之外的结构化片段。
 * 报告/朗读/PPT 管线经 gatherReportData 只读引用（02 铁律 4）。
 */
import { db } from './schema'
import { newId } from './repo'
import type { DataBlock } from '../types/models'

export const BLOCK_SCHEMA_VERSION = 1

function normalizeBlock(raw: DataBlock): DataBlock {
  return {
    ...raw,
    title: raw.title ?? '未命名数据块',
    content: raw.content ?? '',
    extId: raw.extId ?? undefined,
    profileId: raw.profileId ?? undefined,
    usage: raw.usage ?? undefined,
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
    deletedAt: raw.deletedAt ?? null,
    schemaVersion: raw.schemaVersion ?? BLOCK_SCHEMA_VERSION,
  }
}

export { normalizeBlock }

export interface SaveBlockInput {
  id?: string
  title: string
  content: string
  /** 云端推送源 id（增量去重用） */
  extId?: string
  /** 归属的调研对象 */
  profileId?: string
  /** 用途：自己用 / 给客户 */
  usage?: 'internal' | 'client'
}

/** 新建或更新（按 id）；标题取首行非空，最多 40 字 */
export async function saveBlock(input: SaveBlockInput): Promise<DataBlock> {
  const now = new Date().toISOString()
  const existing = input.id ? await db.blocks.get(input.id) : undefined
  const block = normalizeBlock({
    id: existing?.id ?? newId('block'),
    title: input.title.trim().slice(0, 40) || '未命名数据块',
    content: input.content.trim(),
    extId: input.extId ?? existing?.extId,
    profileId: input.profileId ?? existing?.profileId,
    usage: input.usage ?? existing?.usage,
    updatedAt: now,
    deletedAt: existing?.deletedAt ?? null,
    schemaVersion: BLOCK_SCHEMA_VERSION,
  })
  await db.blocks.put(block)
  return block
}

export async function listBlocks(): Promise<DataBlock[]> {
  const all = await db.blocks.toArray()
  return all
    .map(normalizeBlock)
    .filter((b) => b.deletedAt === null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** 软删除（铁律 3）：备份中仍可找回 */
export async function softDeleteBlock(id: string): Promise<void> {
  const raw = await db.blocks.get(id)
  if (!raw || raw.deletedAt) return
  await db.blocks.put({ ...normalizeBlock(raw), deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
}

/** 调整数据块归属的调研对象（undefined = 移出到未归类） */
export async function assignBlockProfile(id: string, profileId: string | undefined): Promise<void> {
  const raw = await db.blocks.get(id)
  if (!raw) return
  await db.blocks.put({ ...normalizeBlock(raw), profileId, updatedAt: new Date().toISOString() })
}

/** 某对象下的全部数据块（按更新时间倒序） */
export async function listBlocksByProfile(profileId: string): Promise<DataBlock[]> {
  const all = await db.blocks.where('profileId').equals(profileId).toArray()
  return all.map(normalizeBlock).filter((b) => b.deletedAt === null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
