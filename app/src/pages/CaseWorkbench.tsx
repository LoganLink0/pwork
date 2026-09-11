import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProfiles } from '../store/profiles'
import { toggleProfileDeliverable } from '../db/profilesRepo'
import {
  addCaseFile,
  listCaseFiles,
  softDeleteCaseFile,
  CASE_KIND_LABEL,
  type CaseFileKind,
} from '../db/caseFilesRepo'
import {
  buildDecodePrompt,
  buildDiagnosePrompt,
  buildRewritePrompt,
  DECODE_SYSTEM_PROMPT,
  DIAGNOSE_SYSTEM_PROMPT,
  REWRITE_SYSTEM_PROMPT,
  decodeToText,
  diagnosisToText,
  parseDecode,
  parseDiagnosis,
  type JobDecode,
  type MatchDiagnosis,
} from '../engine/resumeTools'
import {
  buildInterviewPrompt,
  exportSelfCheckPackDocx,
  exportTextDocx,
  selfCheckPackMarkdown,
  sopProgress,
  INTERVIEW_SYSTEM_PROMPT,
  DELIVERABLE_CHECKLIST,
} from '../engine/resumeWorkflow'
import { downloadFile } from '../db/repo'
import { chatCompletion } from '../modules/review/engine/llm'
import { loadCoachConfig, llmConfigFrom } from '../modules/review/engine/coach'
import { todayLocal } from '../engine/datetime'
import { ArticleEditor } from '../components/writer/ArticleEditor'
import { ARTICLE_VIEWS, ARTICLE_SYSTEM_PROMPT, buildArticleUserPrompt, getArticleView, parseArticle, articleToMarkdown, exportArticleDocx, type ArticleDraft, type ArticleView } from '../engine/articleWriter'
import type { CaseFile, Profile } from '../types/models'
import { extractMaterial } from '../engine/pptWriter'

const coachReady = () => Boolean(loadCoachConfig().apiKey)

const KIND_ORDER: CaseFileKind[] = ['resume', 'jd', 'checklist', 'company', 'other']

/** 案例工作台：按 08 手册八步 SOP 组织——材料(①) → 解码(②) → 追问(③) → 诊断(④) → 改写与简历稿(⑤⑥) → 交付核对(⑦⑧)。 */
export function CaseWorkbench() {
  const { id = '' } = useParams()
  const { profiles } = useProfiles()
  const profile: Profile | undefined = profiles.find((p) => p.id === id)

  const [files, setFiles] = useState<CaseFile[]>([])
  const [notFound, setNotFound] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractErr, setExtractErr] = useState('')
  const [exportMsg, setExportMsg] = useState('')
  const [pasteKind, setPasteKind] = useState<CaseFileKind>('jd')
  const [pasteName, setPasteName] = useState('')
  const [pasteText, setPasteText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // 自检包生成
  const [packMsg, setPackMsg] = useState('')
  // 岗位解码
  const [decodeBusy, setDecodeBusy] = useState(false)
  const [decodeErr, setDecodeErr] = useState('')
  const [jdPaste, setJdPaste] = useState('')
  const [manualDecode, setManualDecode] = useState('')
  // 访谈追问
  const [ivBusy, setIvBusy] = useState(false)
  const [ivErr, setIvErr] = useState('')
  const [manualIv, setManualIv] = useState('')
  // 匹配度诊断
  const [diagBusy, setDiagBusy] = useState(false)
  const [diagErr, setDiagErr] = useState('')
  const [manualDiag, setManualDiag] = useState('')
  // 条目改写
  const [rwRaw, setRwRaw] = useState('')
  const [rwOut, setRwOut] = useState('')
  const [rwBusy, setRwBusy] = useState(false)
  // 简历稿
  const [resumeText, setResumeText] = useState('')
  const [resumeMsg, setResumeMsg] = useState('')
  // 分析草稿
  const [analysisView, setAnalysisView] = useState<ArticleView>(ARTICLE_VIEWS.find((v) => v.id === 'resume-tailoring') ?? ARTICLE_VIEWS[0]!)
  const [analysisAudience, setAnalysisAudience] = useState<'internal' | 'external'>('external')
  const [draft, setDraft] = useState<ArticleDraft | null>(null)
  const [draftBusy, setDraftBusy] = useState(false)
  const [draftErr, setDraftErr] = useState('')

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

  const callAI = async (system: string, user: string, maxTokens: number): Promise<string> =>
    chatCompletion(llmConfigFrom(loadCoachConfig()), system, user, { maxTokens, timeoutMs: 90000 })

  const addPaste = async () => {
    if (!pasteText.trim()) return
    await addCaseFile({ caseId: id, name: pasteName.trim() || `${CASE_KIND_LABEL[pasteKind]} ${new Date().toLocaleDateString('zh-CN')}`, kind: pasteKind, text: pasteText.trim() })
    setPasteName('')
    setPasteText('')
    await refresh()
  }

  const onFiles = async (fl: FileList) => {
    setExtractErr('')
    setExtracting(true)
    try {
      for (const f of Array.from(fl)) {
        let kind: CaseFileKind = 'other'
        const n = f.name.toLowerCase()
        if (n.includes('自检包')) kind = 'checklist'
        else if (n.includes('简历稿') || n.includes('终稿')) kind = 'resumeDraft'
        else if (n.includes('简历') || n.includes('resume')) kind = 'resume'
        else if (n.includes('jd') || n.includes('岗位')) kind = 'jd'
        else if (n.includes('工商') || n.includes('公司') || n.includes('调研')) kind = 'company'
        const text = await extractMaterial(f)
        await addCaseFile({ caseId: id, name: f.name.replace(/\.[^.]+$/, ''), kind, text })
      }
      await refresh()
    } catch (e) {
      setExtractErr(e instanceof Error ? e.message : String(e))
    } finally {
      setExtracting(false)
    }
  }

  const saveDoc = async (name: string, text: string, kind: CaseFileKind = 'doc') => {
    await addCaseFile({ caseId: id, name, kind, text })
    await refresh()
  }

  /* ---------- SOP① 自检包 ---------- */
  const genPackMd = () => {
    const md = selfCheckPackMarkdown({ caseName: profile?.name, clientName: profile?.clientName, targetRole: profile?.targetRole })
    downloadFile(`自检包-${profile?.clientName || profile?.name || '客户'}.md`, md, 'text/markdown')
    setPackMsg('已下载 Markdown——发给客户填写，填完整份粘贴或上传回来（类型选"自检包"）。')
  }
  const genPackDocx = async () => {
    try {
      const name = await exportSelfCheckPackDocx({ caseName: profile?.name, clientName: profile?.clientName, targetRole: profile?.targetRole })
      setPackMsg(`已生成 ${name}——发给客户填写，填完整份粘贴或上传回来（类型选"自检包"）。`)
    } catch (e) {
      setPackMsg(`生成失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /* ---------- SOP② 岗位解码 ---------- */
  const runDecode = async (jd: string) => {
    setDecodeBusy(true)
    setDecodeErr('')
    try {
      const d: JobDecode = parseDecode(await callAI(DECODE_SYSTEM_PROMPT, buildDecodePrompt(jd), 3000))
      await saveDoc(`岗位解码表 · ${todayLocal()}`, decodeToText(d))
      setJdPaste('')
    } catch (e) {
      setDecodeErr(e instanceof Error ? e.message : String(e))
    } finally {
      setDecodeBusy(false)
    }
  }

  /* ---------- SOP③ 访谈追问 ---------- */
  const runInterview = async () => {
    if (!decodeDoc || ivBusy) return
    setIvBusy(true)
    setIvErr('')
    try {
      const text = await callAI(
        INTERVIEW_SYSTEM_PROMPT,
        buildInterviewPrompt(decodeDoc.text, clientMaterials.map((f) => ({ name: f.name, text: f.text }))),
        3000,
      )
      await saveDoc(`访谈追问清单 · ${todayLocal()}`, text.trim())
    } catch (e) {
      setIvErr(e instanceof Error ? e.message : String(e))
    } finally {
      setIvBusy(false)
    }
  }

  /* ---------- SOP④ 匹配度诊断 ---------- */
  const runDiagnose = async () => {
    setDiagBusy(true)
    setDiagErr('')
    try {
      const text = await callAI(
        DIAGNOSE_SYSTEM_PROMPT,
        buildDiagnosePrompt(
          decodeDoc?.text ?? '',
          clientMaterials.map((f) => ({ title: f.name, body: f.text })),
        ),
        5000,
      )
      const d: MatchDiagnosis = parseDiagnosis(text)
      await saveDoc(`匹配度诊断 · ${todayLocal()}`, diagnosisToText(d), 'doc')
    } catch (e) {
      setDiagErr(e instanceof Error ? e.message : String(e))
    } finally {
      setDiagBusy(false)
    }
  }

  /* ---------- SOP⑤ 条目改写 ---------- */
  const runRewrite = async () => {
    if (!rwRaw.trim() || rwBusy) return
    setRwBusy(true)
    try {
      setRwOut(await callAI(REWRITE_SYSTEM_PROMPT, buildRewritePrompt(rwRaw.trim(), decodeDoc?.text ?? null), 1500))
    } catch (e) {
      setRwOut(`改写失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRwBusy(false)
    }
  }

  const collectRewrite = () => {
    if (!rwOut.trim()) return
    setResumeText((t) => (t.trim() ? `${t.trimEnd()}\n${rwOut.trim()}\n` : `${rwOut.trim()}\n`))
    setResumeMsg('已收进下方"简历稿"，记得保存为新版本。')
    document.getElementById('seg-resume')?.scrollIntoView({ behavior: 'smooth' })
  }

  /* ---------- SOP⑤⑥ 简历稿 ---------- */
  const saveResumeVersion = async (asFinal = false) => {
    if (!resumeText.trim()) return
    const name = asFinal ? `简历终稿 · ${todayLocal()}` : `简历稿 · ${new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
    await saveDoc(name, resumeText.trim(), 'resumeDraft')
    setResumeMsg(asFinal ? '终稿已存为本案例文件；交付前别忘了第八段的核对清单。' : '已保存为新版本——客户反馈后在当前文本上改，再存下一版。')
  }

  const exportResume = async (kind: 'md' | 'docx') => {
    if (!resumeText.trim()) return
    if (kind === 'md') {
      downloadFile(`简历稿-${profile?.clientName || profile?.name || '客户'}.md`, resumeText, 'text/markdown')
      setResumeMsg('已下载 Markdown。')
    } else {
      const name = await exportTextDocx(`简历稿 · ${profile?.clientName || profile?.name || '客户'}`, resumeText)
      setResumeMsg(`已生成 ${name}（PDF 可在 Word 中另存）。`)
    }
  }

  /* ---------- 分析草稿（辅助） ---------- */
  const runAnalysis = async () => {
    const materials = clientMaterials.map((f) => ({ id: f.id, kind: 'note' as const, title: f.name, body: f.text, createdAt: f.createdAt, sourceLabel: '案例材料' }))
    setDraftBusy(true)
    setDraftErr('')
    try {
      const text = await callAI(ARTICLE_SYSTEM_PROMPT, buildArticleUserPrompt({ materials, view: analysisView, scopeLabel: profile?.name }), 8000)
      setDraft(parseArticle(text))
    } catch (e) {
      setDraftErr(e instanceof Error ? e.message : String(e))
    } finally {
      setDraftBusy(false)
    }
  }

  const doExport = (kind: 'md' | 'docx') => {
    if (!draft) return
    if (kind === 'md') {
      downloadFile(`${draft.title}.md`, articleToMarkdown(draft), 'text/markdown')
    } else {
      void exportArticleDocx(draft).then((name) => setExportMsg(`已生成 ${name}`))
    }
  }

  /* ---------- SOP⑦⑧ 交付核对 ---------- */
  const toggleDeliverable = async (did: string) => {
    if (!profile) return
    await toggleProfileDeliverable(profile.id, did)
    void useProfiles.getState().load()
  }

  if (notFound) {
    return (
      <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
        <div className="page-head">
          <h1>案例工作台</h1>
        </div>
        <div className="empty">
          <div className="e-ico" aria-hidden>📋</div>
          <p>案例不存在，去 <Link to="/cases">案例库</Link> 查看。</p>
        </div>
      </section>
    )
  }

  const clientMaterials = files.filter((f) => !['doc', 'resumeDraft'].includes(f.kind))
  const jdFiles = files.filter((f) => f.kind === 'jd')
  const decodeDoc = files.find((f) => f.kind === 'doc' && f.name.includes('岗位解码表'))
  const ivDoc = files.find((f) => f.kind === 'doc' && f.name.includes('访谈追问'))
  const diagDoc = files.find((f) => f.kind === 'doc' && f.name.includes('匹配度诊断'))
  const resumeDrafts = files.filter((f) => f.kind === 'resumeDraft')
  const checked = profile?.deliverables ?? []
  const steps = sopProgress(files, checked)

  return (
    <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
      <div className="page-head">
        <h1>{profile ? profile.name : '案例工作台'}</h1>
        <span className="sub">案例 · 按 08 手册八步 SOP 走完一个服务——文件保持原样，产出挂在本案例下</span>
        <div className="right">
          <Link to="/cases" className="btn-ghost">← 案例库</Link>
        </div>
      </div>

      {/* 八步进度（自动判断） */}
      <div className="set-row" style={{ flexWrap: 'wrap', marginBottom: 'var(--sp-3)' }} data-testid="sop-progress" role="list" aria-label="八步服务进度">
        {steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="listitem"
            className={`chip${s.done ? ' on' : ''}`}
            title={s.done ? '已完成' : s.optional ? '可选步骤' : '未完成——点击跳到对应区块'}
            style={s.optional && !s.done ? { opacity: 0.55 } : undefined}
            onClick={() => document.getElementById(`seg-${s.id}`)?.scrollIntoView({ behavior: 'smooth' })}
          >
            {s.done ? '✓ ' : `${i + 1} `}
            {s.label}
            {s.optional && !s.done ? '（可选）' : ''}
          </button>
        ))}
      </div>

      {/* 一、文件与材料（SOP①自检包 + 客户材料） */}
      <div className="set-card" id="seg-s1">
        <h2>一、文件与材料</h2>
        <div className="desc">先「生成自检包」发给客户（SOP①）；收回来的自检包、客户简历、JD、公司资料粘贴或上传到这里。上传 Word/PDF/MD/TXT 自动提取文字。</div>
        <div className="set-body">
          <div className="set-row" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn-ghost" onClick={genPackMd} data-testid="pack-md">
              ⬇ 生成自检包（Markdown）
            </button>
            <button type="button" className="btn-ghost" onClick={() => void genPackDocx()} data-testid="pack-docx">
              ⬇ 生成自检包（Word）
            </button>
            {packMsg && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{packMsg}</span>}
          </div>
          <div className="set-row" style={{ flexWrap: 'wrap', paddingTop: 0 }}>
            {KIND_ORDER.map((k) => (
              <button key={k} type="button" className={`chip${pasteKind === k ? ' on' : ''}`} onClick={() => setPasteKind(k)}>
                {CASE_KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="set-row" style={{ alignItems: 'flex-start' }}>
            <textarea
              className="input"
              style={{ flex: 1 }}
              rows={3}
              placeholder="粘贴文字内容……"
              value={pasteText}
              aria-label="粘贴内容"
              onChange={(e) => setPasteText(e.target.value)}
            />
          </div>
          <div className="set-row">
            <input
              className="input"
              style={{ maxWidth: 200 }}
              placeholder="材料名称（可选）"
              value={pasteName}
              aria-label="材料名称"
              onChange={(e) => setPasteName(e.target.value)}
            />
            <button type="button" className="btn-ghost" disabled={!pasteText.trim()} onClick={() => void addPaste()}>
              ＋ 添加
            </button>
            <button type="button" className="btn-ghost" disabled={extracting} onClick={() => fileRef.current?.click()}>
              {extracting ? '⟳ 提取中…' : '⬆ 上传文件'}
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".md,.txt,.docx,.pdf,.markdown"
              style={{ display: 'none' }}
              aria-label="选择材料文件"
              onChange={(e) => {
                if (e.target.files?.length) void onFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
          {extractErr && (
            <div className="set-row">
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{extractErr}</span>
            </div>
          )}
          <div className="set-row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {files.length === 0 && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>（还没有材料）</div>}
              {files.map((f) => (
                <div key={f.id} style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'baseline', padding: '3px 0' }}>
                  <span style={{ fontSize: 'var(--fs-sm)' }}>{f.name}</span>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{CASE_KIND_LABEL[f.kind]} · {f.text.length} 字 · {new Date(f.createdAt).toLocaleDateString('zh-CN')}</span>
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => {
                      if (window.confirm(`删除「${f.name}」？（软删除）`)) void softDeleteCaseFile(f.id).then(refresh)
                    }}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 二、岗位解码（SOP②） */}
      <div className="set-card" id="seg-s2">
        <h2>二、岗位解码（JD → P0/P1/P2 + 隐性能力词）</h2>
        <div className="desc">解码结果存为本案例的过程文档，后续追问、诊断和改写都以它为准。没有 AI 也能用：把自己整理好的解码表手动填进去。</div>
        <div className="set-body">
          {jdFiles.length > 0 && (
            <div className="set-row">
              <label>用案例内的 JD 文件</label>
              <select
                className="lane-select"
                value=""
                aria-label="选择案例内的 JD 文件填入"
                onChange={(e) => {
                  const f = jdFiles.find((x) => x.id === e.target.value)
                  if (f) setJdPaste(f.text)
                }}
              >
                <option value="">选一份填入下方…</option>
                {jdFiles.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="set-row" style={{ alignItems: 'flex-start' }}>
            <textarea
              className="input"
              style={{ flex: 1 }}
              rows={4}
              placeholder="粘贴 JD 全文……"
              value={jdPaste}
              aria-label="粘贴 JD 全文"
              onChange={(e) => setJdPaste(e.target.value)}
            />
          </div>
          <div className="set-row">
            <button type="button" className="btn-primary" disabled={!jdPaste.trim() || decodeBusy || !coachReady()} onClick={() => void runDecode(jdPaste)}>
              {decodeBusy ? '⟳ 解码中…' : '🤖 AI 解码此 JD'}
            </button>
            {!coachReady() && (
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                AI 需要先在 <Link to="/settings">设置 → AI · BYOK</Link> 配置；或在下方手动填写。
              </span>
            )}
            {decodeErr && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{decodeErr}</span>}
          </div>
          <div className="set-row" style={{ alignItems: 'flex-start' }}>
            <details style={{ flex: 1 }}>
              <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>不用 AI：手动填写解码表</summary>
              <textarea
                className="input"
                style={{ width: '100%', marginTop: 'var(--sp-2)' }}
                rows={6}
                placeholder={'照手册的解码表格式写，例如：\nP0 必须证明：\n- 3 年以上 B 端销售经验\nP1 潜力项：\n- 金融行业客户资源\nP2 加分项：\n- 有团队管理经验\n隐性能力词：抗压、跨部门协调'}
                value={manualDecode}
                aria-label="手动填写岗位解码表"
                onChange={(e) => setManualDecode(e.target.value)}
              />
              <div className="set-row" style={{ marginTop: 'var(--sp-2)' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={!manualDecode.trim()}
                  onClick={() => void saveDoc(`岗位解码表 · ${todayLocal()}`, manualDecode.trim()).then(() => setManualDecode(''))}
                >
                  保存为过程文档
                </button>
              </div>
            </details>
          </div>
          {decodeDoc && (
            <div className="set-row" style={{ alignItems: 'flex-start' }}>
              <details style={{ flex: 1 }}>
                <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>查看当前解码表</summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--fs-xs)', margin: 'var(--sp-2) 0 0' }}>{decodeDoc.text}</pre>
              </details>
            </div>
          )}
        </div>
      </div>

      {/* 三、访谈追问（SOP③） */}
      <div className="set-card" id="seg-s3">
        <h2>三、访谈追问清单</h2>
        <div className="desc">按解码表逐项列问题，找出材料里没证据的经历——访谈时照着问，把数字、场景、结果问出来。需要先有解码表。</div>
        <div className="set-body">
          <div className="set-row">
            <button type="button" className="btn-primary" disabled={!decodeDoc || ivBusy || !coachReady()} onClick={() => void runInterview()} data-testid="interview-btn">
              {ivBusy ? '⟳ 生成中…' : '🤖 AI 生成追问清单'}
            </button>
            {!decodeDoc && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>需要先在第二段完成岗位解码。</span>}
            {decodeDoc && !coachReady() && (
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                AI 需要先在 <Link to="/settings">设置 → AI · BYOK</Link> 配置；或在下方手动整理。
              </span>
            )}
            {ivErr && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{ivErr}</span>}
          </div>
          <div className="set-row" style={{ alignItems: 'flex-start' }}>
            <details style={{ flex: 1 }}>
              <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>不用 AI：手动整理追问清单</summary>
              <textarea
                className="input"
                style={{ width: '100%', marginTop: 'var(--sp-2)' }}
                rows={5}
                placeholder={'例：\n必须问清：\n- 210 万业绩里你个人贡献多少？团队几个人分？\n- POC 方案是谁写的？客户提了哪些反对意见？'}
                value={manualIv}
                aria-label="手动整理访谈追问清单"
                onChange={(e) => setManualIv(e.target.value)}
              />
              <div className="set-row" style={{ marginTop: 'var(--sp-2)' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={!manualIv.trim()}
                  onClick={() => void saveDoc(`访谈追问清单 · ${todayLocal()}`, manualIv.trim()).then(() => setManualIv(''))}
                >
                  保存为过程文档
                </button>
              </div>
            </details>
          </div>
          {ivDoc && (
            <div className="set-row" style={{ alignItems: 'flex-start' }}>
              <details style={{ flex: 1 }}>
                <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>查看当前追问清单</summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--fs-xs)', margin: 'var(--sp-2) 0 0' }}>{ivDoc.text}</pre>
              </details>
            </div>
          )}
        </div>
      </div>

      {/* 四、匹配度诊断（SOP④） */}
      <div className="set-card" id="seg-s4">
        <h2>四、匹配度诊断（逐条对照打分）</h2>
        <div className="desc">把案例内全部客户材料与解码表逐条对照：每条要求找证据、打 0-5 分、指出缺口。素材缺什么会如实标注，不编造。访谈补料后建议重跑一次。</div>
        <div className="set-body">
          <div className="set-row">
            <button type="button" className="btn-primary" disabled={diagBusy || clientMaterials.length === 0 || !coachReady()} onClick={() => void runDiagnose()}>
              {diagBusy ? '⟳ 诊断中…' : '🤖 AI 匹配度诊断'}
            </button>
            {clientMaterials.length === 0 && (
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>先在第一段添加客户材料（自检包 / 简历）。</span>
            )}
            {clientMaterials.length > 0 && !coachReady() && (
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                AI 需要先在 <Link to="/settings">设置 → AI · BYOK</Link> 配置；或在下方手动填写。
              </span>
            )}
            {diagErr && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{diagErr}</span>}
          </div>
          <div className="set-row" style={{ alignItems: 'flex-start' }}>
            <details style={{ flex: 1 }}>
              <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>不用 AI：手动填写诊断表</summary>
              <textarea
                className="input"
                style={{ width: '100%', marginTop: 'var(--sp-2)' }}
                rows={6}
                placeholder={'一条要求一行，例如：\n3 年以上 B 端销售经验 | 4 分 | 证据：某某项目 2021-2024 | 缺口：无\n金融行业客户资源 | 1 分 | 证据：无 | 缺口：需补充行业接触经历'}
                value={manualDiag}
                aria-label="手动填写匹配度诊断表"
                onChange={(e) => setManualDiag(e.target.value)}
              />
              <div className="set-row" style={{ marginTop: 'var(--sp-2)' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={!manualDiag.trim()}
                  onClick={() => void saveDoc(`匹配度诊断 · ${todayLocal()}`, manualDiag.trim()).then(() => setManualDiag(''))}
                >
                  保存为过程文档
                </button>
              </div>
            </details>
          </div>
          {diagDoc && (
            <div className="set-row" style={{ alignItems: 'flex-start' }}>
              <details style={{ flex: 1 }}>
                <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>查看当前诊断表</summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--fs-xs)', margin: 'var(--sp-2) 0 0' }}>{diagDoc.text}</pre>
              </details>
            </div>
          )}
        </div>
      </div>

      {/* 五、条目改写（SOP⑤） */}
      <div className="set-card" id="seg-s5">
        <h2>五、条目改写（STAR / 量化）</h2>
        <div className="desc">原始经历描述 → "问题-行动-结果"简历条目。没数字的地方用（数字待补）占位，不编造。改好的条目一键收进简历稿。</div>
        <div className="set-body">
          <div className="set-row" style={{ alignItems: 'flex-start' }}>
            <textarea
              className="input"
              style={{ flex: 1 }}
              rows={2}
              placeholder="粘贴原始经历描述，如：负责组织公司年会"
              value={rwRaw}
              aria-label="原始经历描述"
              onChange={(e) => setRwRaw(e.target.value)}
            />
          </div>
          <div className="set-row">
            <button type="button" className="btn-ghost" disabled={!rwRaw.trim() || rwBusy || !coachReady()} onClick={() => void runRewrite()}>
              {rwBusy ? '⟳ 改写中…' : '✍ AI 改写条目'}
            </button>
            {!coachReady() && (
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                AI 需要先在 <Link to="/settings">设置 → AI · BYOK</Link> 配置；不用 AI 时照"问题-行动-结果"三段自己写。
              </span>
            )}
          </div>
          {rwOut && (
            <div className="set-row" style={{ alignItems: 'flex-start' }}>
              <textarea className="input" rows={3} value={rwOut} readOnly aria-label="改写结果" />
              <button type="button" className="btn-ghost" onClick={collectRewrite} data-testid="collect-rewrite">
                ＋ 收进简历稿
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 六、简历稿（SOP⑤⑥：版本迭代） */}
      <div className="set-card" id="seg-s6">
        <h2>六、简历稿（改好的条目在这里攒成稿，客户反馈后存新版本）</h2>
        <div className="desc">改写条目收进来、直接写也行；每存一次就是一个版本，全案例可回看。终稿导出 Word 后另存 PDF。</div>
        <div className="set-body">
          {resumeDrafts.length > 0 && (
            <div className="set-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', marginBottom: 'var(--sp-1)' }}>已有版本（{resumeDrafts.length}）</div>
                {resumeDrafts.map((f) => (
                  <div key={f.id} style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'baseline', padding: '2px 0' }}>
                    <span style={{ fontSize: 'var(--fs-sm)' }}>{f.name}</span>
                    <details style={{ flex: 1 }}>
                      <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', display: 'inline' }}>查看</summary>
                      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--fs-xs)', margin: 'var(--sp-1) 0 0' }}>{f.text}</pre>
                    </details>
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => {
                        if (window.confirm(`删除版本「${f.name}」？（软删除）`)) void softDeleteCaseFile(f.id).then(refresh)
                      }}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="set-row" style={{ alignItems: 'flex-start' }}>
            <textarea
              className="input"
              style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)' }}
              rows={10}
              placeholder={'简历稿内容。可以从条目改写"收进"开始，也可以直接粘贴现有简历来改。建议结构：\n# 姓名 · 目标岗位\n## 核心业绩\n…\n## 工作经历\n…'}
              value={resumeText}
              aria-label="简历稿内容"
              onChange={(e) => setResumeText(e.target.value)}
            />
          </div>
          <div className="set-row" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary" disabled={!resumeText.trim()} onClick={() => void saveResumeVersion(false)} data-testid="resume-save">
              💾 保存为新版本
            </button>
            <button type="button" className="btn-ghost" disabled={!resumeText.trim()} onClick={() => void saveResumeVersion(true)}>
              🏁 存为终稿
            </button>
            <button type="button" className="btn-ghost" disabled={!resumeText.trim()} onClick={() => void exportResume('docx')}>
              ⬇ Word（.docx）
            </button>
            <button type="button" className="btn-ghost" disabled={!resumeText.trim()} onClick={() => void exportResume('md')}>
              ⬇ Markdown
            </button>
            {resumeMsg && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ok)' }}>{resumeMsg}</span>}
          </div>
        </div>
      </div>

      {/* 七、分析草稿（辅助） */}
      <div className="set-card" id="seg-s7">
        <h2>七、分析草稿（调研 / 建议类文档）</h2>
        <div className="desc">选视角和受众，把案例材料整理成文档（简历定制建议 / 企业调研速览 / 自由整理），逐节修改后导出。</div>
        <div className="set-body">
          <div className="set-row">
            <label>视角</label>
            <div className="radio">
              {ARTICLE_VIEWS.map((v) => (
                <button key={v.id} type="button" className={analysisView.id === v.id ? 'on' : ''} onClick={() => setAnalysisView(v)}>
                  {v.name}
                </button>
              ))}
            </div>
          </div>
          <div className="set-row">
            <label>用途</label>
            <div className="radio">
              <button type="button" className={analysisAudience === 'external' ? 'on' : ''} onClick={() => setAnalysisAudience('external')}>给客户</button>
              <button type="button" className={analysisAudience === 'internal' ? 'on' : ''} onClick={() => setAnalysisAudience('internal')}>自己用</button>
            </div>
          </div>
          {draft === null ? (
            <div className="set-row" style={{ flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                disabled={!clientMaterials.length || draftBusy || !coachReady()}
                onClick={() => void runAnalysis()}
              >
                {draftBusy ? '⟳ AI 整理中…' : '🤖 AI 整理成分析草稿'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setDraft(getArticleView(analysisView.id).skeleton())}>
                用手动骨架（不需要 AI）
              </button>
              {!coachReady() && (
                <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                  AI 需要先在 <Link to="/settings">设置 → AI · BYOK</Link> 配置。
                </span>
              )}
              {draftErr && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{draftErr}</span>}
            </div>
          ) : (
            <div className="set-row">
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ok)' }}>草稿已生成，在下方逐节修改。</span>
            </div>
          )}
        </div>
      </div>

      {draft && (
        <div className="set-card">
          <h2>分析草稿（可编辑）</h2>
          <div className="set-body">
            <div className="set-row">
              <label>导出</label>
              <button type="button" className="btn-ghost" onClick={() => doExport('md')}>⬇ Markdown</button>
              <button type="button" className="btn-ghost" onClick={() => doExport('docx')}>⬇ Word（.docx）</button>
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>PDF 可在 Word 中另存</span>
              {exportMsg && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ok)' }}>{exportMsg}</span>}
              <button type="button" className="mini-btn" onClick={() => setDraft(null)}>丢弃草稿</button>
            </div>
            <ArticleEditor draft={draft} onChange={setDraft} />
          </div>
        </div>
      )}

      {/* 八、交付包核对（SOP⑦⑧） */}
      <div className="set-card" id="seg-s8">
        <h2>八、交付包核对清单</h2>
        <div className="desc">简历修改服务共 7 件交付物（08 手册 §四）。模板在项目「交付物模板」目录；诊断报告在第四段生成后可从材料导出。全部勾完，去案例库把状态切到「已交付」。</div>
        <div className="set-body">
          {DELIVERABLE_CHECKLIST.map((d) => (
            <div className="set-row" key={d.id}>
              <label style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)', cursor: 'pointer', flex: 1, minWidth: 0 }}>
                <input
                  type="checkbox"
                  checked={checked.includes(d.id)}
                  onChange={() => void toggleDeliverable(d.id)}
                  aria-label={`交付物：${d.label}`}
                  data-testid={`deliverable-${d.id}`}
                />
                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{d.label}</span>
                <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{d.hint}</span>
              </label>
            </div>
          ))}
          <div className="set-row">
            <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
              面试衔接（可选，SOP⑧）：需要时把话术卡存进材料，进度条第八步会自动亮起。
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
