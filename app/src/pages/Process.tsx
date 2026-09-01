import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { searchAll, KIND_LABEL, type SearchHit, type SearchKind } from '../engine/searchAll'
import { chatCompletion } from '../modules/review/engine/llm'
import { loadCoachConfig, llmConfigFrom } from '../modules/review/engine/coach'

/**
 * 处理模块起步（W5，05 路线图）：跨模块检索 + AI 全库问答（BYOK）。
 * 不做黑盒：问答的上下文来源全部列出来源链接；未配置 BYOK 时明示引导。
 */
export function Process() {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searched, setSearched] = useState(false)

  // AI 问答
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<SearchHit[]>([])
  const [askState, setAskState] = useState<'idle' | 'asking' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const coachReady = Boolean(loadCoachConfig().apiKey)
  const timer = useRef<number | undefined>(undefined)

  // 防抖检索
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
      // 上下文：命中条目的标题/摘要（速记带正文前 200 字），上限 8 条
      const ctx = contextHits.slice(0, 8).map((h, i) => `${i + 1}. [${KIND_LABEL[h.kind]}] ${h.title}`)
      const prompt = [
        `我的问题：${q}`,
        '',
        '我的库里相关内容（检索命中）：',
        ...(ctx.length ? ctx : ['（没有检索到直接相关的内容）']),
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
        <span className="sub">跨模块检索 · AI 全库问答（BYOK）——处理模块的起步形态（W5）</span>
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
        <div className="desc">检索命中作为上下文，BYOK 调用——回答附来源，可溯源</div>
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
