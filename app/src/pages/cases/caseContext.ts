import { useOutletContext } from 'react-router-dom'
import type { CaseFileKind } from '../../db/caseFilesRepo'
import type { CaseFile, Profile } from '../../types/models'

/** 案例工作台布局下发给各步骤的共享数据与操作 */
export interface CaseStepContext {
  profile: Profile | undefined
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
