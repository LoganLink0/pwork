/** 案例与案例文件的类型定义（resume-coach 自有数据模型，不与其他项目共享） */

export type CaseStatus = '进行中' | '已交付' | '已收款'

/** 案例：一个客户 × 一个目标岗位（售前调研类案例可只有名称） */
export interface Case {
  id: string
  name: string
  /** 类型：简历辅导 / 售前调研 */
  kind: string
  status: CaseStatus
  clientName?: string
  targetRole?: string
  /** 已完成的交付物（交付包核对清单，存交付物 id） */
  deliverables?: string[]
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  schemaVersion: number
}

export type CaseFileKind = 'resume' | 'jd' | 'company' | 'doc' | 'checklist' | 'resumeDraft' | 'other'

export const CASE_FILE_KIND_LABEL: Record<CaseFileKind, string> = {
  resume: '客户简历',
  jd: '岗位 JD',
  company: '公司资料',
  doc: '过程文档',
  checklist: '自检包',
  resumeDraft: '简历稿',
  other: '其他材料',
}

/** 案例文件：客户材料与过程文档，保持文件形态不拆碎；简历重复上传 = 新版本 */
export interface CaseFile {
  id: string
  caseId: string
  name: string
  kind: CaseFileKind
  /** 提取出的全文（docx/pdf 自动提取，txt/md 原样） */
  text: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  schemaVersion: number
}
