import { useEffect, useState } from 'react'
import { NavLink, Navigate, Outlet, useParams } from 'react-router-dom'
import { addCaseFile, getCase, listCaseFiles } from '../db/repo'
import { sopProgress } from '../engine/resumeWorkflow'
import { chatCompletion } from '../engine/llm'
import { llmConfigFrom, loadLlmSettings } from '../engine/llmConfig'
import type { Case, CaseFile, CaseFileKind } from '../types'
import { CaseStepHost } from './CaseSteps'
import { useCaseStepContext, type CaseStepContext } from './caseContext'

/**
 * 案例工作台布局：左侧 SOP 步骤栏（自动进度点），右侧当前步骤全屏。
 * 数据在布局层加载，经 Outlet context 下发；步骤间切换不丢输入。
 */
const STEPS: { id: string; to: string; label: string }[] = [
  { id: 's1', to: 'materials', label: '文件与材料' },
  { id: 's2', to: 'decode', label: '岗位解码' },
  { id: 's3', to: 'interview', label: '访谈追问' },
  { id: 's4', to: 'diagnose', label: '匹配诊断' },
  { id: 's5', to: 'rewrite', label: '条目改写' },
  { id: 's6', to: 'draft', label: '简历稿' },
  { id: 's7', to: 'delivery', label: '交付核对' },
]

export function CaseLayout() {
  const { id = '' } = useParams()
  const [kase, setKase] = useState<Case | undefined>(undefined)
  const [files, setFiles] = useState<CaseFile[]>([])
  const [missing, setMissing] = useState(false)

  const refresh = async () => {
    if (!id) return
    setFiles(await listCaseFiles(id))
    setKase(await getCase(id))
  }

  useEffect(() => {
    if (!id) return
    void (async () => {
      const c = await getCase(id)
      if (!c) setMissing(true)
      else setKase(c)
      setFiles(await listCaseFiles(id))
    })()
  }, [id])

  if (missing) {
    return (
      <main className="app-main">
        <div className="notice">案例不存在，去 <NavLink to="/">案例库</NavLink> 查看。</div>
      </main>
    )
  }

  const clientMaterials = files.filter((f) => !['doc', 'resumeDraft'].includes(f.kind))
  const ctx: CaseStepContext = {
    kase,
    files,
    clientMaterials,
    jdFiles: files.filter((f) => f.kind === 'jd'),
    decodeDoc: files.find((f) => f.kind === 'doc' && f.name.includes('岗位解码表')),
    ivDoc: files.find((f) => f.kind === 'doc' && f.name.includes('访谈追问')),
    diagDoc: files.find((f) => f.kind === 'doc' && f.name.includes('匹配度诊断')),
    resumeDrafts: files.filter((f) => f.kind === 'resumeDraft'),
    checked: kase?.deliverables ?? [],
    refresh: async () => {
      setFiles(await listCaseFiles(id))
      setKase(await getCase(id))
    },
    saveDoc: async (name, text, kind: CaseFileKind = 'doc') => {
      await addCaseFile({ caseId: id, name, kind, text })
      await refresh()
    },
    callAI: (system, user, maxTokens) =>
      // 思考型模型（glm-4.5-flash）长提示词延迟波动大：诊断这类最大提示词实测可超 150s（E2E 与真实案例各复现一次），240s 覆盖
      chatCompletion(llmConfigFrom(loadLlmSettings()), system, user, { maxTokens, timeoutMs: 240000 }),
  }

  const steps = sopProgress(files, ctx.checked)

  return (
    <main className="app-main">
      <div className="page-head">
        <h1>{kase ? kase.name : '案例工作台'}</h1>
        <span className="sub">按八步流程走完一个服务：材料 → 解码 → 追问 → 诊断 → 改写 → 简历稿 → 交付</span>
        <div className="right">
          <NavLink to="/" className="btn">← 案例库</NavLink>
        </div>
      </div>

      <div className="case-layout">
        <nav className="rail" aria-label="服务步骤">
          {STEPS.map((s) => {
            const st = steps.find((x) => x.id === s.id)
            return (
              <NavLink key={s.id} to={`/cases/${id}/${s.to}`} className="rail-item" title={s.label}>
                <span className={`dot${st?.done ? ' done' : ''}`} aria-hidden>{st?.done ? '✓' : s.id.slice(1)}</span>
                <span>{s.label}</span>
              </NavLink>
            )
          })}
          <div className="sep" aria-hidden />
          <NavLink to={`/cases/${id}/analysis`} className="rail-item" title="辅助：调研 / 建议类文档">
            <span className="dot" aria-hidden>＋</span>
            <span>分析草稿</span>
          </NavLink>
        </nav>
        <div className="workarea">
          <Outlet context={ctx} />
        </div>
      </div>
    </main>
  )
}

export function CaseIndexRedirect() {
  const { id = '' } = useParams()
  return <Navigate to={`/cases/${id}/materials`} replace />
}

export function CaseStepRoute() {
  const ctx = useCaseStepContext()
  const { step = 'materials' } = useParams()
  return <CaseStepHost step={step} ctx={ctx} />
}
