import { useOutletContext } from 'react-router-dom'
import type { CaseFile, CaseFileKind } from '../types'
import type { Case } from '../types'

/** 案例工作台布局下发给各步骤的共享数据与操作 */
export interface CaseStepContext {
  kase: Case | undefined
  files: CaseFile[]
  clientMaterials: CaseFile[]
  jdFiles: CaseFile[]
  decodeDoc: CaseFile | undefined
  ivDoc: CaseFile | undefined
  diagDoc: CaseFile | undefined
  resumeDrafts: CaseFile[]
  checked: string[]
  refresh: () => Promise<void>
  saveDoc: (name: string, text: string, kind?: CaseFileKind) => Promise<void>
  callAI: (system: string, user: string, maxTokens: number) => Promise<string>
}

export function useCaseStepContext(): CaseStepContext {
  return useOutletContext<CaseStepContext>()
}
