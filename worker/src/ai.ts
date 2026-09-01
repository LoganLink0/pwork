/**
 * AI 两级筛选（04 §5）：4a 便宜模型预筛（通过率目标 30–50%）→ 4b 强模型评分+打标+otFlag。
 * 红线：只输出 JSON；评分必须附 ≤30 字理由；每日 token 熔断；失败回落规则评分。
 */

export interface AiConfig {
  baseUrl: string
  apiKey: string | undefined
  modelCheap: string
  modelStrong: string
  dailyBudget: number
  interests: string[]
  dislikes: string[]
  context: string
}

export interface AiScore {
  total: number
  novelty: number
  relevance: number
  utility: number
  reason: string
  tags: string[]
  otFlag: 'opportunity' | 'threat' | 'trend' | null
}

/** chatCompletion 一次调用；返回文本与 token 用量。非 200 或超时抛错（调用方决定降级） */
export async function chat(ai: AiConfig, model: string, system: string, user: string, timeoutMs = 20_000): Promise<{ text: string; tokens: number }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const resp = await fetch(`${ai.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ai.apiKey ?? ''}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
        max_tokens: 500,
      }),
    })
    if (!resp.ok) throw new Error(`AI HTTP ${resp.status}`)
    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[]
      usage?: { total_tokens?: number }
    }
    const text = data.choices?.[0]?.message?.content ?? ''
    if (!text) throw new Error('AI 空响应')
    return { text, tokens: data.usage?.total_tokens ?? 0 }
  } finally {
    clearTimeout(timer)
  }
}

/** 强制 JSON：剥 markdown 围栏后解析；失败抛错 */
export function parseJsonLoose<T>(text: string): T {
  const stripped = text.replace(/```(?:json)?/gi, '').trim()
  const start = stripped.search(/[[{]/)
  if (start < 0) throw new Error('AI 输出无 JSON')
  const parsed = JSON.parse(stripped.slice(start)) as T
  return parsed
}

const SYSTEM_PREFILTER =
  '你是信息预筛器。根据用户兴趣判断条目是否值得进入评分。只输出 JSON：{"pass": boolean, "reason": "≤20字"}。不解释。'

const SYSTEM_SCORE =
  '你是信息评分器。对条目打分。只输出 JSON：{"total": 0-100 整数, "novelty": 0-1, "relevance": 0-1, "utility": 0-1, "reason": "≤30字理由", "tags": ["≤5个标签"], "otFlag": "opportunity"|"threat"|"trend"|null}。reason 必填且不超过 30 字。不解释。'

function userPrompt(ai: AiConfig, title: string, summary: string): string {
  return [
    `兴趣域：${ai.interests.join('、') || '（未配置）'}`,
    `屏蔽：${ai.dislikes.join('、') || '（无）'}`,
    ai.context ? `背景：${ai.context}` : '',
    '',
    `标题：${title}`,
    `摘要：${summary.slice(0, 300)}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** 4a 预筛：返回 null 表示 AI 不可用（走规则预筛兜底） */
export async function aiPrefilter(ai: AiConfig, title: string, summary: string, spendTokens: (n: number) => Promise<boolean>): Promise<{ pass: boolean; reason: string } | null> {
  if (!ai.apiKey) return null
  if (!(await spendTokens(0))) return null // 熔断
  try {
    const { text, tokens } = await chat(ai, ai.modelCheap, SYSTEM_PREFILTER, userPrompt(ai, title, summary))
    await spendTokens(tokens)
    const r = parseJsonLoose<{ pass: boolean; reason?: string }>(text)
    return { pass: Boolean(r.pass), reason: (r.reason ?? '').slice(0, 20) }
  } catch {
    return null
  }
}

/** 4b 评分打标：返回 null 表示 AI 不可用（走规则评分兜底） */
export async function aiScore(ai: AiConfig, title: string, summary: string, spendTokens: (n: number) => Promise<boolean>): Promise<AiScore | null> {
  if (!ai.apiKey) return null
  if (!(await spendTokens(0))) return null
  try {
    const { text, tokens } = await chat(ai, ai.modelStrong, SYSTEM_SCORE, userPrompt(ai, title, summary))
    await spendTokens(tokens)
    const r = parseJsonLoose<{
      total?: number
      novelty?: number
      relevance?: number
      utility?: number
      reason?: string
      tags?: string[]
      otFlag?: string | null
    }>(text)
    const ot = r.otFlag === 'opportunity' || r.otFlag === 'threat' || r.otFlag === 'trend' ? r.otFlag : null
    return {
      total: Math.min(100, Math.max(0, Math.round(r.total ?? 0))),
      novelty: clamp01(r.novelty ?? 0.5),
      relevance: clamp01(r.relevance ?? 0.5),
      utility: clamp01(r.utility ?? 0.5),
      reason: (r.reason ?? 'AI 评分').slice(0, 30),
      tags: (Array.isArray(r.tags) ? r.tags : []).slice(0, 5).map(String),
      otFlag: ot,
    }
  } catch {
    return null
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, Number(n) || 0))
}
