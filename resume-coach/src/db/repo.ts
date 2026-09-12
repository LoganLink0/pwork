/**
 * 案例数据访问层：保存/列表/软删除；案例文件随案例一并软删除（同一回收粒度）。
 * 所有写操作前后由调用方负责对账反馈，本层不做静默吞错。
 */
import { db } from './schema'
import type { Case, CaseFile, CaseStatus } from '../types'

export const CASE_SCHEMA_VERSION = 1
export const CASE_FILE_SCHEMA_VERSION = 1

export const CASE_STATUS_LIST: CaseStatus[] = ['进行中', '已交付', '已收款']

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeCase(raw: Case): Case {
  return {
    ...raw,
    kind: raw.kind ?? '简历辅导',
    status: raw.status ?? '进行中',
    deliverables: raw.deliverables,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
    deletedAt: raw.deletedAt ?? null,
    schemaVersion: raw.schemaVersion ?? CASE_SCHEMA_VERSION,
  }
}

export interface SaveCaseInput {
  id?: string
  name: string
  kind?: string
  status?: CaseStatus
  clientName?: string
  targetRole?: string
  deliverables?: string[]
}

export async function saveCase(input: SaveCaseInput): Promise<Case> {
  const existing = input.id ? await db.cases.get(input.id) : undefined
  if (input.id && !existing) throw new Error('案例不存在或已删除')
  const now = new Date().toISOString()
  const record = normalizeCase({
    id: existing?.id ?? newId('case'),
    name: input.name.trim().slice(0, 60) || '未命名案例',
    kind: (input.kind ?? existing?.kind ?? '简历辅导').trim().slice(0, 20),
    status: input.status ?? existing?.status ?? '进行中',
    clientName: input.clientName ?? existing?.clientName,
    targetRole: input.targetRole ?? existing?.targetRole,
    deliverables: input.deliverables ?? existing?.deliverables,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
    schemaVersion: CASE_SCHEMA_VERSION,
  })
  await db.cases.put(record)
  return record
}

export async function listCases(): Promise<Case[]> {
  const all = await db.cases.toArray()
  return all.map(normalizeCase).filter((c) => c.deletedAt === null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getCase(id: string): Promise<Case | undefined> {
  const raw = await db.cases.get(id)
  return raw && !raw.deletedAt ? normalizeCase(raw) : undefined
}

/** 事务化勾选/取消一件交付物（连点不互相覆盖） */
export async function toggleCaseDeliverable(id: string, deliverableId: string): Promise<void> {
  await db.transaction('rw', db.cases, async () => {
    const raw = await db.cases.get(id)
    if (!raw || raw.deletedAt) return
    const c = normalizeCase(raw)
    const cur = c.deliverables ?? []
    const next = cur.includes(deliverableId) ? cur.filter((x) => x !== deliverableId) : [...cur, deliverableId]
    await db.cases.put({ ...c, deliverables: next, updatedAt: new Date().toISOString() })
  })
}

/** 软删除案例；名下案例文件一并软删除（备份中可找回） */
export async function softDeleteCase(id: string): Promise<void> {
  const raw = await db.cases.get(id)
  if (!raw || raw.deletedAt) return
  const now = new Date().toISOString()
  await db.cases.put({ ...normalizeCase(raw), deletedAt: now, updatedAt: now })
  const files = await db.caseFiles.where('caseId').equals(id).toArray()
  for (const f of files) {
    if (!f.deletedAt) await db.caseFiles.put({ ...f, deletedAt: now, updatedAt: now })
  }
}

/* ------------------------------ 案例文件 ------------------------------ */

export function normalizeCaseFile(raw: CaseFile): CaseFile {
  return {
    ...raw,
    kind: raw.kind ?? 'other',
    text: raw.text ?? '',
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
    deletedAt: raw.deletedAt ?? null,
    schemaVersion: raw.schemaVersion ?? CASE_FILE_SCHEMA_VERSION,
  }
}

export interface AddCaseFileInput {
  caseId: string
  name: string
  kind: CaseFile['kind']
  text: string
}

export async function addCaseFile(input: AddCaseFileInput): Promise<CaseFile> {
  const now = new Date().toISOString()
  const file = normalizeCaseFile({
    id: newId('cfile'),
    caseId: input.caseId,
    name: input.name.trim().slice(0, 80) || '未命名文件',
    kind: input.kind,
    text: input.text,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    schemaVersion: CASE_FILE_SCHEMA_VERSION,
  })
  await db.caseFiles.put(file)
  return file
}

export async function listCaseFiles(caseId: string): Promise<CaseFile[]> {
  const all = await db.caseFiles.where('caseId').equals(caseId).toArray()
  return all
    .map(normalizeCaseFile)
    .filter((f) => f.deletedAt === null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** 软删除（可在备份中找回） */
export async function softDeleteCaseFile(id: string): Promise<void> {
  const raw = await db.caseFiles.get(id)
  if (!raw || raw.deletedAt) return
  await db.caseFiles.put({ ...normalizeCaseFile(raw), deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
}

/* ------------------------------ 通用下载 ------------------------------ */

/** 触发浏览器下载文本文件 */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
