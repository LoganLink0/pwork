import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useBlocks } from '../store/blocks'
import { useProfiles } from '../store/profiles'
import { fileToBlockContent } from '../engine/fileImport'
import { extractMaterial } from '../engine/pptWriter'
import {
  ARTICLE_VIEWS,
  ARTICLE_SYSTEM_PROMPT,
  articleToMarkdown,
  buildArticleUserPrompt,
  exportArticleDocx,
  parseArticle,
  type ArticleDraft,
  type ArticleMaterial,
  type ArticleView,
} from '../engine/articleWriter'
import {
  FINDINGS_TITLE,
  FRAMEWORK_SYSTEM_PROMPT,
  RESEARCH_TYPES,
  buildFramework,
  buildFrameworkUserPrompt,
  buildFullPrompt,
  buildSectionPrompt,
  loadFramework,
  mergeLegacySectionBlocks,
  normalizeAiFramework,
  saveFramework,
  typeName,
  type ResearchFramework,
  type ResearchType,
} from '../engine/research'
import { byRecentUse, loadQuickSites, markQuickSiteUsed } from '../engine/quickLaunch'
import { parseAiJson } from '../engine/aiJson'
import { chatCompletionCached } from '../engine/aiCached'
import { chatCompletion } from '../modules/review/engine/llm'
import { loadCoachConfig, llmConfigFrom, llmConfigured } from '../modules/review/engine/coach'
import { gatewaySearchConfigured, gatewayWebSearch } from '../engine/webSearch'
import { downloadFile } from '../db/repo'
import { ArticleEditor } from '../components/writer/ArticleEditor'
import { toast } from '../engine/toast'

const WEB_ANSWER_SYSTEM =
  '你是调研助理。基于用户提供的检索结果回答当前维度的问题：引用来源用[n]标注；检索结果没有覆盖的信息明确说「未检出」，不要编造；不确定的标「未核实」。分点、简体中文。'

/**
 * 调研分析（输出模块；2026-10-13 任务式重构，2026-10-21 发现流重设计）：
 * 单元是「调研任务」——输入目标 → 建议调研角度（纯展示 + 组装整份提示词）→
 * 一条「发现」流水：一键联网调研追加、外部 AI 整篇回答直接粘贴、手写随笔，
 * 全部进同一处，不按角度归档——角度管"问全"，流水管"记下"。
 * 存储沿用数据块（发现是任务名下的一个块），但这是实现细节，界面不出现该词汇。
 */
export function ResearchPage() {
  const { blocks, load: loadBlocks, save: saveBlock, remove: removeBlock } = useBlocks()
  const { profiles, load: loadProfiles, save: saveProfile, remove: removeProfile } = useProfiles()
  const [profileId, setProfileId] = useState<string | null>(null)
  const [target, setTarget] = useState('')
  const [type, setType] = useState<ResearchType>('company')
  const [fw, setFw] = useState<ResearchFramework | null>(null)
  const [fwBusy, setFwBusy] = useState(false)
  const [askBusy, setAskBusy] = useState<string | null>(null)
  const [webBusy, setWebBusy] = useState<string | null>(null)
  const [searchReady, setSearchReady] = useState(false)
  /** 发现草稿（单一流水；null=未编辑，展示库里的值；onBlur 落库） */
  const [findingDraft, setFindingDraft] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const migratedFor = useRef<string | null>(null)

  // 出稿
  const [view, setView] = useState<ArticleView>(ARTICLE_VIEWS[0]!)
  const [audience, setAudience] = useState<'internal' | 'client'>('client')
  const [draft, setDraft] = useState<ArticleDraft | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')

  const coachReady = llmConfigured()

  /** 操作反馈统一走右上角 toast（2026-10-13 用户要求）：按文案推断级别，调用点不用逐个挑 */
  const setMsg = (text: string) => {
    if (!text) return // 历史调用点的"清空"语义：toast 模式下无事可做
    toast(/失败|错误|没提取到|没有返回|未授权/.test(text) ? 'error' : /完成|已复制|已加入|已用内置/.test(text) ? 'ok' : 'info', text)
  }
  const profile = profiles.find((p) => p.id === profileId) ?? null
  const taskBlocks = blocks.filter((b) => b.profileId === profileId)
  const findingsBlock = taskBlocks.find((b) => b.title === FINDINGS_TITLE)
  const extraMaterials = taskBlocks.filter((b) => b.title !== FINDINGS_TITLE)
  const findingsValue = findingDraft ?? findingsBlock?.content ?? ''
  const articleMaterials: ArticleMaterial[] = taskBlocks.map((b) => ({
    id: b.id,
    kind: 'note' as const,
    title: b.title,
    body: b.content,
    createdAt: b.updatedAt,
    sourceLabel: '调研发现',
  }))

  useEffect(() => {
    void loadBlocks()
    void loadProfiles()
  }, [loadBlocks, loadProfiles])

  // 切换任务时载入其框架与发现
  useEffect(() => {
    setFw(profileId ? loadFramework(profileId) : null)
    setFindingDraft(null)
    setDraft(null)
    setMsg('')
  }, [profileId])

  // 旧版分节发现的自动合并（一次性）：按节存的块拼成一条流水，节标题转分隔行
  useEffect(() => {
    if (!profileId || !fw || migratedFor.current === profileId) return
    migratedFor.current = profileId
    const legacy = mergeLegacySectionBlocks(taskBlocks, fw.sections.map((s) => s.heading))
    if (!legacy) return
    void (async () => {
      const merged = findingsBlock ? `${findingsBlock.content.trim()}\n\n${legacy.content}` : legacy.content
      await saveBlock({ id: findingsBlock?.id, title: FINDINGS_TITLE, content: merged, profileId, usage: 'internal' })
      for (const b of taskBlocks) {
        if (legacy.legacyTitles.includes(b.title)) await removeBlock(b.id)
      }
      await loadBlocks()
      setMsg('已把按节保存的旧发现合并成一条流水（内容一字未丢）')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 迁移只按任务跑一次
  }, [profileId, fw, blocks])

  // 网关是否配了搜索（决定显示「联网调研」还是「直接问 AI」）；coachReady 为假时按钮本就不显示
  useEffect(() => {
    if (!coachReady) return
    void gatewaySearchConfigured(loadCoachConfig().gatewayUrl || 'http://127.0.0.1:8788').then(setSearchReady)
  }, [coachReady])

  /** 复制整份调研提示词（2026-10-13 用户拍板：一次复制拿全，不分节拆） */
  const copyFullPrompt = async () => {
    if (!fw) return
    try {
      await navigator.clipboard.writeText(buildFullPrompt(fw))
      setMsg('完整提示词已复制——打开任一 AI 站点粘贴即问，整篇回答直接粘进「发现」')
    } catch {
      setMsg('复制失败：浏览器未授权剪贴板（设置里允许后重试）')
    }
  }

  /** 生成（或重新生成）框架：AI 可用走定制；429 限流自动重试一次；失败/未配置落回内置模板 */
  const generateFramework = async (pid?: string, force = false) => {
    const id = pid ?? profileId
    if (!id) return
    const task = profiles.find((p) => p.id === id) ?? null
    // 目标取 ① 的输入，选中旧任务时兜底用任务名（旧任务补框架的入口，2026-10-13 修复"选中后无法生成"）
    const t = target.trim() || task?.name || ''
    if (!t) return
    // 类型优先按任务建立时的标签映射（旧任务 kind 存的是类型名）
    const useType: ResearchType = RESEARCH_TYPES.find((x) => x.name === task?.kind)?.id ?? type
    if (force && !window.confirm('重新生成会覆盖当前框架（已填的发现保留，但可能对不上新章节）——继续？')) return
    setFwBusy(true)
    let next: ResearchFramework | null = null
    if (coachReady) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const text = await chatCompletion(
            llmConfigFrom(loadCoachConfig()),
            FRAMEWORK_SYSTEM_PROMPT,
            buildFrameworkUserPrompt(useType, t),
            // 深度思考型模型的思考先吃 maxTokens 预算——3000 时 JSON 经常没写完就断流
            //（2026-10-21 用户踩中"AI 没有返回 JSON"），给足 8000；超时仍落回模板
            { maxTokens: 8000, timeoutMs: 120000 },
          )
          next = normalizeAiFramework(parseAiJson(text), useType, t)
          break
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          // 模型限流（1305/429）是瞬时的：歇 3 秒自动重试一次，别让用户手动再点
          if (attempt === 1 && /HTTP 429/.test(message)) {
            setMsg('模型当前访问量过大，3 秒后自动重试……')
            await new Promise((r) => setTimeout(r, 3000))
            continue
          }
          setMsg(`AI 定制框架失败（${message}）——已用内置模板，可再试`)
          break
        }
      }
    }
    if (!next) next = buildFramework(useType, t)
    setFw(next)
    saveFramework(id, next)
    setFwBusy(false)
  }

  /** 开始（或继续）任务：同名任务复用不重建；建完立即生成框架 */
  const startTask = async () => {
    const t = target.trim()
    if (!t) return
    const existing = profiles.find((p) => p.name === t)
    const p = existing ?? (await saveProfile({ name: t, kind: typeName(type) }))
    setProfileId(p.id)
    await generateFramework(p.id)
  }

  /** 往发现流水追加一段（带分隔标题），落库并刷新 */
  const appendFinding = async (sectionTitle: string, body: string) => {
    if (!profileId) return
    const stamp = new Date().toLocaleDateString()
    const prev = findingsValue
    const merged = `${prev ? prev.trimEnd() + '\n\n' : ''}## ${sectionTitle}（${stamp}）\n${body.trim()}`
    setFindingDraft(merged)
    await saveBlock({ id: findingsBlock?.id, title: FINDINGS_TITLE, content: merged, profileId, usage: 'internal' })
    await loadBlocks()
  }

  /** 直接问 AI（基于模型已有知识；建议同时把外部检索结果贴进来交叉验证） */
  const askAi = async (heading: string) => {
    if (!fw || askBusy) return
    setAskBusy(heading)
    setMsg('')
    try {
      const section = fw.sections.find((s) => s.heading === heading)!
      const { text } = await chatCompletionCached({
        purpose: 'research-ask',
        inputKey: ['research-ask', fw.target, heading, type].join('|'),
        system: '你是调研助理。基于你已有的知识回答；不确定的明确标注「未核实」。分点、简体中文。',
        user: buildSectionPrompt(fw, section),
        maxTokens: 2000,
      })
      await appendFinding(`${heading} · AI 回答（未核实，需交叉验证）`, text)
    } catch (e) {
      setMsg(`问 AI 失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setAskBusy(null)
    }
  }

  /** 联网调研单个角度：搜该角度问题 → 带来源喂给模型 → 答案与来源链接追加进发现 */
  const researchOnline = async (heading: string) => {
    if (!fw || webBusy) return
    const section = fw.sections.find((s) => s.heading === heading)!
    const plain = heading.replace(/^[一二三四五六七八九十]+、/, '')
    setWebBusy(heading)
    setMsg('')
    try {
      const gw = loadCoachConfig().gatewayUrl || 'http://127.0.0.1:8788'
      const queries = [
        `${fw.target} ${plain}`,
        section.questions[0] ? `${fw.target} ${section.questions[0].replace(/[？?。]/g, '')}` : '',
      ]
        .filter(Boolean)
        .slice(0, 2)
      const lists = await Promise.all(queries.map((q) => gatewayWebSearch(gw, q, 4)))
      const seen = new Set<string>()
      const hits = lists.flat().filter((h) => (seen.has(h.link) ? false : (seen.add(h.link), true))).slice(0, 8)
      if (hits.length === 0) {
        setMsg('联网检索没有返回结果——换个关键词或用「复制提示词」手动查')
        return
      }
      const ctx = hits.map((h, i) => `[${i + 1}] ${h.title}（${h.link}）\n${h.content}`).join('\n\n')
      const inputKey = ['research-web', fw.target, heading, queries.join('|'), hits.map((h) => h.link).join(',')].join('|')
      const { text } = await chatCompletionCached({
        purpose: 'research-web',
        inputKey,
        system: WEB_ANSWER_SYSTEM,
        user: [
          `调研目标：${fw.target}`,
          `当前维度：${plain}`,
          '要回答的问题：',
          ...section.questions.map((q, i) => `${i + 1}. ${q}`),
          '',
          '检索结果：',
          ctx,
          '',
          '请综合检索结果回答上述问题。',
        ].join('\n'),
        maxTokens: 3000,
      })
      await appendFinding(`${heading} · 联网调研`, `${text.trim()}\n来源：\n${hits.map((h, i) => `[${i + 1}] ${h.title} — ${h.link}`).join('\n')}`)
      setMsg(`联网调研完成：检索 ${queries.length} 次，引用 ${hits.length} 个来源`)
    } catch (e) {
      setMsg(`联网调研失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setWebBusy(null)
    }
  }

  const saveFinding = async (content: string) => {
    if (!profileId) return
    if (findingsBlock && findingsBlock.content === content) return
    if (!content.trim() && findingsBlock) {
      await removeBlock(findingsBlock.id)
      return
    }
    if (!content.trim()) return
    await saveBlock({ id: findingsBlock?.id, title: FINDINGS_TITLE, content, profileId, usage: 'internal' })
  }

  /** 一键调研全部角度（2026-10-21 用户拍板"不要逐节去问"）：顺序跑完，单节失败不中断 */
  const [allProgress, setAllProgress] = useState<{ done: number; total: number } | null>(null)
  const researchAllOnline = async () => {
    if (!fw || webBusy !== null || allProgress) return
    setAllProgress({ done: 0, total: fw.sections.length })
    let ok = 0
    for (let i = 0; i < fw.sections.length; i++) {
      try {
        await researchOnline(fw.sections[i]!.heading)
        ok += 1
      } catch {
        /* 单节失败继续；researchOnline 内部已 toast 原因 */
      }
      setAllProgress({ done: i + 1, total: fw.sections.length })
    }
    setAllProgress(null)
    setMsg(`一键调研完成：${ok}/${fw.sections.length} 个角度成功，结果已追加进发现`)
  }

  const onFile = async (file: File) => {
    if (!profileId) return
    try {
      const lower = file.name.toLowerCase()
      let content = ''
      if (/\.(csv|json|tsv)$/.test(lower)) {
        const r = fileToBlockContent(file.name, await file.text())
        content = r.content
      } else {
        content = (await extractMaterial(file)).trim()
        if (!content) {
          setMsg('这份文件没提取到文字（扫描版 PDF 或空文档？）')
          return
        }
      }
      await saveBlock({ title: file.name.replace(/\.[^.]+$/, ''), content, profileId, usage: 'internal' })
      setMsg('补充材料已加入')
    } catch (e) {
      setMsg(`导入失败：${e instanceof Error ? e.message : '文件解析出错'}`)
    }
  }

  const generateAnalysis = async () => {
    if (aiBusy || articleMaterials.length === 0) return
    setAiBusy(true)
    setAiError('')
    try {
      const inputKey = ['research', view.id, audience, profileId ?? 'all', ...articleMaterials.map((m) => `${m.id}:${m.body.length}`)].join('|')
      const { text } = await chatCompletionCached({
        purpose: 'article-analysis',
        inputKey,
        system: ARTICLE_SYSTEM_PROMPT,
        user: buildArticleUserPrompt({ materials: articleMaterials, view, scopeLabel: fw?.target }),
        maxTokens: 8000,
      })
      setDraft(parseArticle(text))
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiBusy(false)
    }
  }

  const doExport = (kind: 'md' | 'docx') => {
    if (!draft) return
    if (kind === 'md') downloadFile(`${draft.title}.md`, articleToMarkdown(draft), 'text/markdown')
    else void exportArticleDocx(draft)
  }

  const removeTask = async () => {
    if (!profile) return
    if (!window.confirm(`删除调研任务「${profile.name}」？框架与发现一并移除（备份中仍可找回）。`)) return
    // 先删发现再删任务：数据层的删除任务只把块"摘成未归类"（服务案例场景），
    // 调研发现若走那条路会泄进周报外部数据——必须显式删（2026-10-13 自查发现）
    for (const b of taskBlocks) await removeBlock(b.id)
    await removeProfile(profile.id)
    setProfileId(null)
    setFw(null)
  }

  const typeMeta = RESEARCH_TYPES.find((t) => t.id === type)!

  return (
    <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
      <div className="page-head">
        <h1>调研分析</h1>
        <span className="sub">输入调研目标 → 照建议角度调研 → 发现记在一处 → 出稿（Markdown / Word）</span>
      </div>

      <div className="set-card">
        <h2>① 调研目标</h2>
        <div className="desc">{coachReady ? 'AI 已配置：框架按目标定制生成' : 'AI 未配置：用内置调研模板（同样完整可用，配了 AI 可定制）'}</div>
        <div className="set-body">
          {profiles.length > 0 && (
            <div className="chips" style={{ marginBottom: 'var(--sp-2)' }}>
              {profiles.map((p) => (
                <button key={p.id} type="button" className={`chip${profileId === p.id ? ' on' : ''}`} onClick={() => setProfileId(p.id)}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <div className="set-row">
            <input
              className="input"
              style={{ maxWidth: 320 }}
              placeholder={typeMeta.placeholder}
              value={target}
              aria-label="调研目标"
              onChange={(e) => setTarget(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void startTask()}
            />
            <button type="button" className="btn-primary" disabled={!target.trim() || fwBusy} onClick={() => void startTask()} data-testid="start-research">
              {fwBusy ? '⟳ 生成框架中…' : '开始调研'}
            </button>
          </div>
          <div className="set-row">
            <label>类型</label>
            <div className="radio">
              {RESEARCH_TYPES.map((t) => (
                <button key={t.id} type="button" className={type === t.id ? 'on' : ''} onClick={() => setType(t.id)} title={t.hint}>
                  {t.name}
                </button>
              ))}
            </div>
            <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{typeMeta.hint}</span>
          </div>
        </div>
      </div>

      {profile && (
        <div className="set-card">
          <h2>② 建议调研角度</h2>
          <div className="desc">
            {fw
              ? `${fw.generatedBy === 'ai' ? 'AI 定制' : '内置模板'} · ${fw.sections.length} 个角度——${coachReady && searchReady ? '可一键全部调研，或单个角度补查；也可' : ''}复制完整提示词去外部 AI 问`
              : '还没有角度建议——回到 ① 点「开始调研」生成'}
          </div>
          <div className="set-body">
            {fw === null ? (
              fwBusy ? (
                <div className="notice">⟳ 框架生成中（AI 定制最长约 90 秒，超时自动用内置模板）——不用等在原地。</div>
              ) : profile ? (
                <div className="notice" style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>这个任务还没有框架（可能创建于框架功能之前）。</span>
                  <button type="button" className="mini-btn" onClick={() => void generateFramework()} data-testid="gen-framework">
                    生成框架
                  </button>
                </div>
              ) : (
                <div className="notice">先在上方输入目标开始调研；已开始的任务点上方标签继续。</div>
              )
            ) : (
              <>
                <div className="set-row" style={{ flexWrap: 'wrap', marginBottom: 'var(--sp-3)' }}>
                  {coachReady && searchReady && (
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={webBusy !== null || allProgress !== null}
                      onClick={() => void researchAllOnline()}
                      title="按下面的角度自动跑完联网搜索与作答，结果追加进「发现」——不用逐个点"
                    >
                      {allProgress ? `⟳ 一键调研中（${allProgress.done}/${allProgress.total}）…` : `🌐 一键调研（全部 ${fw.sections.length} 个角度）`}
                    </button>
                  )}
                  <button type="button" className={coachReady && searchReady ? 'btn-ghost' : 'btn-primary'} onClick={() => void copyFullPrompt()} data-testid="copy-full-prompt">
                    📋 复制完整提示词（{fw.sections.length} 个角度合一）
                  </button>
                  {/* 跳转清单与处理页「快速启动」共用（取前 4 个，按最近使用排序）；点击记一次使用 */}
                  {byRecentUse(loadQuickSites()).slice(0, 4).map((s) => (
                    <a
                      key={s.id}
                      className="btn-ghost"
                      style={{ textDecoration: 'none' }}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      onClick={() => markQuickSiteUsed(s.id)}
                    >
                      去{s.name} ↗
                    </a>
                  ))}
                </div>
                <div className="set-row" style={{ marginBottom: 'var(--sp-3)' }}>
                  <button type="button" className="btn-ghost" disabled={fwBusy} onClick={() => void generateFramework(undefined, true)}>
                    ↻ 换一组角度
                  </button>
                  <button type="button" className="mini-btn" onClick={() => void removeTask()}>删除任务</button>
                  <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>角度只是建议——发现都在下面一处，不按角度归档</span>
                </div>
                {fw.sections.map((s) => (
                  <div key={s.heading} style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 'var(--fs-md)', fontWeight: 600 }}>{s.heading}</span>
                      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>去哪查：{s.sources.join(' / ')}</span>
                      {coachReady && searchReady && (
                        <button
                          type="button"
                          className="mini-btn"
                          disabled={webBusy !== null || allProgress !== null}
                          onClick={() => void researchOnline(s.heading)}
                          title="只调研这个角度：搜索 → AI 带来源作答 → 追加进发现"
                          style={{ marginLeft: 'auto' }}
                        >
                          {webBusy === s.heading ? '⟳ 调研中…' : '🌐 只查此角度'}
                        </button>
                      )}
                      {coachReady && !searchReady && (
                        <button
                          type="button"
                          className="mini-btn"
                          disabled={askBusy !== null}
                          onClick={() => void askAi(s.heading)}
                          title="让 AI 按已有知识回答这个角度的问题，追加进发现"
                          style={{ marginLeft: 'auto' }}
                        >
                          {askBusy === s.heading ? '⟳ AI 回答中…' : '🤖 问 AI 此角度'}
                        </button>
                      )}
                    </div>
                    {s.questions.length > 0 && (
                      <ul style={{ margin: 'var(--sp-2) 0 0', paddingLeft: 'var(--sp-5)', fontSize: 'var(--fs-sm)', color: 'var(--ink-soft)', lineHeight: 1.9 }}>
                        {s.questions.map((q, i) => (
                          <li key={i}>{q}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {profile && (
        <div className="set-card">
          <h2>③ 发现</h2>
          <div className="desc">一条流水记到底——一键调研和「只查此角度」的结果自动追加进来；在外部 AI 问完的整篇回答直接粘贴进来；自己读到什么也随手记。出稿时全部都会用上。</div>
          <div className="set-body">
            <textarea
              className="input"
              rows={Math.min(20, Math.max(8, Math.ceil(findingsValue.length / 60) + 2))}
              placeholder="发现都记在这里（联网调研与 AI 回答自动追加；外部 AI 的整篇回答直接粘贴）"
              value={findingsValue}
              aria-label="发现"
              data-testid="research-findings"
              onChange={(e) => setFindingDraft(e.target.value)}
              onBlur={(e) => void saveFinding(e.target.value)}
            />
          </div>
        </div>
      )}

      {profile && (
        <div className="set-card">
          <h2>④ 出稿</h2>
          <div className="desc">把发现整理成分析稿，逐节修改后导出；没有 AI 用手动骨架照样能写</div>
          <div className="set-body">
            <div className="set-row">
              <label>视角</label>
              <div className="radio">
                {ARTICLE_VIEWS.map((v) => (
                  <button key={v.id} type="button" className={view.id === v.id ? 'on' : ''} onClick={() => setView(v)}>
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="set-row" style={{ alignItems: 'flex-start' }}>
              <label>成品结构</label>
              <span className="val" style={{ color: 'var(--ink-soft)' }} data-testid="outline-preview">
                这篇会包含：{view.skeleton().sections.map((s) => s.heading).join(' · ')}
              </span>
            </div>
            <div className="set-row">
              <label>用途</label>
              <div className="radio">
                <button type="button" className={audience === 'client' ? 'on' : ''} onClick={() => setAudience('client')}>给客户（措辞正式，可直接交付）</button>
                <button type="button" className={audience === 'internal' ? 'on' : ''} onClick={() => setAudience('internal')}>自己用（可直写问题与判断）</button>
              </div>
            </div>
            <div className="set-row" style={{ flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                disabled={!articleMaterials.length || aiBusy || !coachReady}
                onClick={() => void generateAnalysis()}
                data-testid="research-generate"
              >
                {aiBusy ? '⟳ AI 整理中…' : '🤖 AI 整理成分析草稿'}
              </button>
              <button type="button" className="btn-ghost" disabled={!articleMaterials.length} onClick={() => setDraft(view.skeleton())}>
                用手动骨架（不需要 AI）
              </button>
              {!coachReady && (
                <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                  AI 整理需要先在 <Link to="/settings">设置 → AI · BYOK</Link> 配置。
                </span>
              )}
              {articleMaterials.length === 0 && (
                <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>还没有任何发现——先在 ② 各节贴回内容。</span>
              )}
              {aiError && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{aiError}</span>}
            </div>
            <div className="set-row" style={{ flexWrap: 'wrap' }}>
              <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()} data-testid="import-material">
                ⬆ 补充材料（Word / PDF / CSV / 文本）
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".docx,.pdf,.csv,.json,.txt,.tsv,.md"
                style={{ display: 'none' }}
                aria-label="选择补充材料文件"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void onFile(f)
                  e.target.value = ''
                }}
              />
              {extraMaterials.length > 0 && (
                <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                  已有补充材料 {extraMaterials.length} 份（{extraMaterials.slice(0, 3).map((b) => b.title).join('、')}{extraMaterials.length > 3 ? '…' : ''}）
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {draft && (
        <div className="set-card">
          <h2>分析草稿（可编辑）</h2>
          <div className="set-body">
            <div className="set-row">
              <label>导出</label>
              <button type="button" className="btn-ghost" onClick={() => doExport('md')}>⬇ Markdown</button>
              <button type="button" className="btn-ghost" onClick={() => doExport('docx')}>⬇ Word（.docx）</button>
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>Word 可另存 PDF</span>
            </div>
            <ArticleEditor draft={draft} onChange={setDraft} />
          </div>
        </div>
      )}

    </section>
  )
}
