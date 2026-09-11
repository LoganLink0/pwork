import { useEffect, useState } from 'react'
import { NavLink, Navigate, Outlet, useParams } from 'react-router-dom'
import { useProfiles } from '../../store/profiles'
import { addCaseFile, listCaseFiles, type CaseFileKind } from '../../db/caseFilesRepo'
import { sopProgress } from '../../engine/resumeWorkflow'
import { chatCompletion } from '../../modules/review/engine/llm'
import { loadCoachConfig, llmConfigFrom } from '../../modules/review/engine/coach'
import type { CaseFile } from '../../types/models'
import { CaseStepHost } from './CaseSteps'
import { useCaseStepContext, type CaseStepContext } from './caseContext'
import type { Profile } from '../../types/models'

/**
 * 案例工作台布局（分步工作区）：左侧 SOP 步骤栏（自动进度点），右侧当前步骤全屏。
 * 数据（案例/文件）在布局层加载，经 Outlet context 下发给各步骤；步骤间切换不丢输入。
 */

const STEPS: { id: string; to: string; label: string; sop: string }[] = [
  { id: 's1', to: 'materials', label: '文件与材料', sop: '① 自检包与客户材料' },
  { id: 's2', to: 'decode', label: '岗位解码', sop: '② 拆解 JD' },
  { id: 's3', to: 'interview', label: '访谈追问', sop: '③ 补齐没证据的经历' },
  { id: 's4', to: 'diagnose', label: '匹配诊断', sop: '④ 逐条对照打分' },
  { id: 's5', to: 'rewrite', label: '条目改写', sop: '⑤ STAR / 量化' },
  { id: 's6', to: 'draft', label: '简历稿', sop: '⑤⑥ 攒成稿 · 版本迭代' },
  { id: 's7', to: 'delivery', label: '交付核对', sop: '⑦⑧ 交付包与面试衔接' },
]

export function CaseLayout() {
  const { id = '' } = useParams()
  const { profiles } = useProfiles()
  const profile: Profile | undefined = profiles.find((p) => p.id === id)
  const [files, setFiles] = useState<CaseFile[]>([])
  const [notFound, setNotFound] = useState(false)

  const refresh = async () => {
    if (!id) return
    setFiles(await listCaseFiles(id))
  }

  useEffect(() => {
    if (!id) {
      setNotFound(true)
      return
    }
    void refresh()
    void useProfiles.getState().load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (notFound || !id) {
    return (
      <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
        <div className="page-head">
          <h1>案例工作台</h1>
        </div>
        <div className="notice">案例不存在，去 <NavLink to="/cases">案例库</NavLink> 查看。</div>
      </section>
    )
  }

  const clientMaterials = files.filter((f) => !['doc', 'resumeDraft'].includes(f.kind))
  const ctx: CaseStepContext = {
    profile,
    files,
    clientMaterials,
    jdFiles: files.filter((f) => f.kind === 'jd'),
    decodeDoc: files.find((f) => f.kind === 'doc' && f.name.includes('岗位解码表')),
    ivDoc: files.find((f) => f.kind === 'doc' && f.name.includes('访谈追问')),
    diagDoc: files.find((f) => f.kind === 'doc' && f.name.includes('匹配度诊断')),
    resumeDrafts: files.filter((f) => f.kind === 'resumeDraft'),
    checked: profile?.deliverables ?? [],
    refresh,
    saveDoc: async (name, text, kind: CaseFileKind = 'doc') => {
      await addCaseFile({ caseId: id, name, kind, text })
      await refresh()
    },
    callAI: (system, user, maxTokens) =>
      chatCompletion(llmConfigFrom(loadCoachConfig()), system, user, { maxTokens, timeoutMs: 90000 }),
  }

  const steps = sopProgress(files, ctx.checked)

  return (
    <section className="case-layout-wrap">
      <div className="page-head">
        <h1>{profile ? profile.name : '案例工作台'}</h1>
        <span className="sub">案例 · 按 08 手册八步 SOP 走完一个服务</span>
        <div className="right">
          <NavLink to="/cases" className="btn-ghost">← 案例库</NavLink>
        </div>
      </div>

      <div className="case-layout">
        <nav className="case-rail" aria-label="服务步骤">
          {STEPS.map((s) => {
            const st = steps.find((x) => x.id === s.id)
            return (
              <NavLink key={s.id} to={`/cases/${id}/${s.to}`} className="case-rail-item" title={s.sop}>
                <span className={`case-dot${st?.done ? ' done' : ''}`} aria-hidden>{st?.done ? '✓' : s.id.slice(1)}</span>
                <span className="case-rail-label">{s.label}</span>
              </NavLink>
            )
          })}
          <div className="case-rail-sep" aria-hidden />
          <NavLink to={`/cases/${id}/analysis`} className="case-rail-item" title="辅助工具：调研/建议类文档">
            <span className="case-dot" aria-hidden>＋</span>
            <span className="case-rail-label">分析草稿</span>
          </NavLink>
        </nav>
        <div className="case-workarea">
          <Outlet context={ctx} />
        </div>
      </div>
    </section>
  )
}

/** /cases/:id 默认落到第一步 */
export function CaseIndexRedirect() {
  const { id = '' } = useParams()
  return <Navigate to={`/cases/${id}/materials`} replace />
}

/** 路由宿主：所有步骤保持挂载（切步不丢输入），按 :step 只显示当前步骤 */
export function CaseStepRoute() {
  const ctx = useCaseStepContext()
  const { step = 'materials' } = useParams()
  return <CaseStepHost step={step} ctx={ctx} />
}
