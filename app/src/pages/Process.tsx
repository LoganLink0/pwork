import { useEffect, useMemo, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { searchAll, KIND_LABEL, type SearchHit, type SearchKind } from '../engine/searchAll'
import { chatCompletion } from '../modules/review/engine/llm'
import { loadCoachConfig, llmConfigFrom, llmConfigured } from '../modules/review/engine/coach'
import { CATEGORY_META, CATEGORY_ORDER, PROCESS_TOOLS, ENGINE_LABEL, toolRoute } from '../content/processTools'

/**
 * 处理模块主页：工具箱 + 跨模块检索 + AI 全库问答。
 * 工具注册表见 content/processTools.ts——加新工具先注册再实现组件。
 */
export function Process() {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searched, setSearched] = useState(false)

  const [question, setQuestion] = useState('')
  const [externalCtx, setExternalCtx] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<SearchHit[]>([])
  const [askState, setAskState] = useState<'idle' | 'asking' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const coachReady = llmConfigured()
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    window.clearTimeout(timer.current)
    const q = query.trim()
    if (!q) {
      setHits([])
      setSearched(false)
      return
    }
    timer.current = window.setTimeout(() => {
      void searchAll(q).then((r) => {
        setHits(r)
        setSearched(true)
      })
    }, 150)
    return () => window.clearTimeout(timer.current)
  }, [query])

  const groups = useMemo(() => {
    const byKind = new Map<SearchKind, SearchHit[]>()
    for (const h of hits) {
      const list = byKind.get(h.kind) ?? []
      list.push(h)
      byKind.set(h.kind, list)
    }
    return [...byKind.entries()]
  }, [hits])

  const ask = async () => {
    const q = question.trim()
    if (!q || askState === 'asking') return
    setAskState('asking')
    setErrorMsg('')
    setAnswer('')
    try {
      const contextHits = await searchAll(q)
      const ctx = contextHits.slice(0, 8).map((h, i) => `${i + 1}. [${KIND_LABEL[h.kind]}] ${h.title}`)
      const ext = externalCtx.trim()
      const prompt = [
        `我的问题：${q}`,
        '',
        '我的库里相关内容（检索命中）：',
        ...(ctx.length ? ctx : ['（没有检索到直接相关的内容）']),
        ...(ext ? ['', '我另外提供的资料（优先参考）：', ext.slice(0, 2000)] : []),
        '',
        '请基于以上内容回答；内容不足时直说需要补充什么记录。',
      ].join('\n')
      const text = await chatCompletion(
        llmConfigFrom(loadCoachConfig()),
        '你是个人知识库助手。基于用户库里检索到的内容回答，简洁、可操作；引用来源用 [n] 标注。',
        prompt,
        { maxTokens: 500 },
      )
      setAnswer(text)
      setSources(contextHits.slice(0, 8))
      setAskState('done')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e))
      setAskState('error')
    }
  }

  return (
    <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
      <div className="page-head">
        <h1>处理</h1>
        <span className="sub">工具箱（文字/音频/图片/视频）· 跨模块检索 · AI 问答</span>
      </div>

      <div className="set-card">
        <h2>工具箱</h2>
        <div className="desc">按信息形态分类：文字 → 音频 → 图片 → 视频；本地引擎离线可用，生成类为 BYOK 占位</div>
        <div className="set-body">
          <div className="module-grid">
            {CATEGORY_ORDER.map((cat) => {
              const meta = CATEGORY_META[cat]
              const tools = PROCESS_TOOLS.filter((t) => t.category === cat)
              return (
                <div key={cat} className="mcard" style={{ borderLeft: '3px solid ' + meta.mark }}>
                  <div className="m-head">
                    <span className="m-ico" aria-hidden>{meta.icon}</span>
                    <span className="m-name">{meta.name}</span>
                  </div>
                  <div className="m-sub">{meta.desc}</div>
                  <div className="m-links">
                    {tools.map((t) =>
                      t.engine === 'external' ? (
                        <a key={t.id} href={t.externalUrl} target="_blank" rel="noreferrer noopener" className="m-link">
                          <span>↗ {t.name}</span>
                          <span className="cnt">外部</span>
                        </a>
                      ) : (
                        <Link key={t.id} to={toolRoute(t.id)} className="m-link" style={t.status === 'byok-pending' ? { opacity: 0.55 } : undefined}>
                          <span>
                            {t.status === 'byok-pending' && <span aria-hidden>🔑 </span>}
                            {t.name}
                          </span>
                          <span className="cnt">{t.status === 'ready' ? ENGINE_LABEL[t.engine].replace('本地 · ', '') : '需 Key'}</span>
                        </Link>
                      )
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="set-card">
        <h2>跨模块检索</h2>
        <div className="desc">速记 / 任务 / 条目 / 复盘档案 / 洞察卡——一处查遍全库</div>
        <div className="set-body">
          <input
            className="input"
            style={{ width: '100%' }}
            placeholder="输入关键词，跨模块搜索…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="跨模块检索"
            data-testid="process-search"
          />
          {searched && hits.length === 0 && (
            <div style={{ paddingTop: 'var(--sp-3)', color: 'var(--ink-faint)', fontSize: 'var(--fs-sm)' }}>没有匹配「{query}」的内容。</div>
          )}
          {groups.map(([kind, list]) => (
            <div key={kind} style={{ paddingTop: 'var(--sp-3)' }}>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', marginBottom: 4 }}>{KIND_LABEL[kind as SearchKind]}</div>
              {list.map((h) => (
                <Link key={h.kind + h.id} to={h.to} className="p-item" style={{ textDecoration: 'none' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title}</span>
                  <span className="p-sub">{h.sub}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="set-card">
        <h2>AI 全库问答</h2>
        <div className="desc">AI 回答会参考检索到的内容，并标注来源</div>
        <div className="set-body">
          {!coachReady ? (
            <div className="notice">
              <b>BYOK 未配置</b>：先到 <Link to="/settings">设置 → AI · BYOK</Link> 填入服务商与 Key（只存本机）。没有 AI 不影响其他功能——检索照常用。
            </div>
          ) : (
            <>
              <div className="set-row">
                <textarea
                  className="input"
                  style={{ width: '100%', minHeight: 72, resize: 'vertical' }}
                  placeholder="问点什么……例如：我最近关于评分权重的想法有哪些？"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  aria-label="全库提问"
                />
              </div>
              <div className="set-row" style={{ alignItems: 'flex-start' }}>
                <label style={{ width: 'auto', flex: 'none' }}>外部资料</label>
                <textarea
                  className="input"
                  style={{ flex: 1, minHeight: 52, resize: 'vertical' }}
                  placeholder="（可选）粘贴工作台之外的资料，给 AI 多一份参考——默认只用库内数据"
                  value={externalCtx}
                  onChange={(e) => setExternalCtx(e.target.value)}
                  aria-label="外部资料"
                />
              </div>
              <div className="set-row">
                <button type="button" className="btn-primary" disabled={askState === 'asking' || !question.trim()} onClick={() => void ask()} data-testid="ask-btn">
                  {askState === 'asking' ? '思考中…' : '提问'}
                </button>
              </div>
              {askState === 'error' && (
                <div className="notice" style={{ borderLeftColor: 'var(--danger)' }} role="alert">
                  AI 调用失败：{errorMsg}（检查 Key/网络；检索功能不受影响）
                </div>
              )}
              {askState === 'done' && (
                <div style={{ paddingTop: 'var(--sp-2)' }}>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--fs-sm)', lineHeight: 1.8 }} data-testid="ai-answer">
                    {answer}
                  </div>
                  {sources.length > 0 && (
                    <div style={{ paddingTop: 'var(--sp-3)', fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                      来源：
                      {sources.map((s, i) => (
                        <span key={s.kind + s.id}>
                          [{i + 1} {KIND_LABEL[s.kind]}]{' '}
                        </span>
                      ))}
                      （点击上方检索结果可跳原文）
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
