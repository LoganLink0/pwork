/**
 * 调研对象数据访问层（输入第三通道的对象档案，07 场景包"对象档案"最小实装）：
 * 一家公司、一个客户……材料（数据块）挂在它下面，分析产出从它取材料。
 */
import { db } from './schema'
import { newId } from './repo'
import type { Profile } from '../types/models'

export const PROFILE_SCHEMA_VERSION = 1

function normalizeProfile(raw: Profile): Profile {
  return {
    ...raw,
    name: raw.name ?? '未命名对象',
    kind: raw.kind ?? '',
    status: raw.status ?? '进行中',
    note: raw.note ?? undefined,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
    deletedAt: raw.deletedAt ?? null,
    schemaVersion: raw.schemaVersion ?? PROFILE_SCHEMA_VERSION,
  }
}

export interface SaveProfileInput {
  id?: string
  name: string
  kind?: string
  note?: string
  status?: Profile['status']
  clientName?: string
  targetRole?: string
}

export async function saveProfile(input: SaveProfileInput): Promise<Profile> {
  const existing = input.id ? await db.profiles.get(input.id) : undefined
  const now = new Date().toISOString()
  const profile = normalizeProfile({
    id: existing?.id ?? newId('prof'),
    name: input.name.trim().slice(0, 60) || '未命名对象',
    kind: (input.kind ?? existing?.kind ?? '').trim().slice(0, 20),
    status: input.status ?? existing?.status ?? '进行中',
    clientName: input.clientName ?? existing?.clientName,
    targetRole: input.targetRole ?? existing?.targetRole,
    note: input.note?.trim() || existing?.note,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: existing?.deletedAt ?? null,
    schemaVersion: PROFILE_SCHEMA_VERSION,
  })
  await db.profiles.put(profile)
  return profile
}

export async function listProfiles(): Promise<Profile[]> {
  const all = await db.profiles.toArray()
  return all
    .map(normalizeProfile)
    .filter((p) => p.deletedAt === null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** 软删除对象；已挂的数据块保留（profileId 置空回到"未归类"）；案例文件随案例一并软删除（同一回收粒度） */
export async function softDeleteProfile(id: string): Promise<void> {
  const raw = await db.profiles.get(id)
  if (!raw || raw.deletedAt) return
  const now = new Date().toISOString()
  await db.profiles.put({ ...normalizeProfile(raw), deletedAt: now, updatedAt: now })
  const blocks = await db.blocks.where('profileId').equals(id).toArray()
  for (const b of blocks) {
    await db.blocks.put({ ...b, profileId: undefined, updatedAt: now })
  }
  const files = await db.caseFiles.where('caseId').equals(id).toArray()
  for (const f of files) {
    if (!f.deletedAt) await db.caseFiles.put({ ...f, deletedAt: now, updatedAt: now })
  }
}
