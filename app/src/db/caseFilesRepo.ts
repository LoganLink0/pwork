/**
 * 案例文件数据访问层（案例模块）：简历辅导/售前案例的文件与文本材料。
 * 每个案例（客户 × 目标岗位）下挂多份文件；简历每次上传都是一个新版本（版本留存，可回看）。
 * 与数据块（指标型碎片）的区别：这里保持"文件/文档"形态，不拆碎。
 */
import { db } from './schema'
import { newId } from './repo'
import type { CaseFile } from '../types/models'

export const CASE_FILE_SCHEMA_VERSION = 1

export type CaseFileKind = 'resume' | 'jd' | 'company' | 'other'

export const CASE_KIND_LABEL: Record<CaseFileKind, string> = {
  resume: '客户简历',
  jd: '岗位 JD',
  company: '公司资料',
  other: '其他材料',
}

function normalizeCaseFile(raw: CaseFile): CaseFile {
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
  kind: CaseFileKind
  text: string
}

/** 新增案例文件（简历重复上传 = 新版本，按创建时间自然排序） */
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

export async function getCaseFile(id: string): Promise<CaseFile | undefined> {
  const raw = await db.caseFiles.get(id)
  return raw ? normalizeCaseFile(raw) : undefined
}

/** 软删除（铁律 3） */
export async function softDeleteCaseFile(id: string): Promise<void> {
  const raw = await db.caseFiles.get(id)
  if (!raw || raw.deletedAt) return
  await db.caseFiles.put({ ...normalizeCaseFile(raw), deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
}
