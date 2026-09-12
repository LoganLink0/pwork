import Dexie, { type Table } from 'dexie'
import type { Case, CaseFile } from '../types'

/**
 * 简历辅导本地数据库（独立于 PWORK）：库名 resume-coach。
 * 迁移规则：字段只增不删；索引变化必须升 version。
 * v1：案例 + 案例文件。
 */
export class CoachDB extends Dexie {
  cases!: Table<Case, string>
  caseFiles!: Table<CaseFile, string>

  constructor() {
    super('resume-coach')
    this.version(1).stores({
      cases: 'id, status, updatedAt',
      caseFiles: 'id, caseId, kind, createdAt',
    })
  }
}

export const db = new CoachDB()
