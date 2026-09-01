/**
 * AI 教练适配器（PRD 7.4）。
 * 两级实现：RuleBasedCoach（离线默认，确定性规则）/ LlmCoach（用户自带 Key 的 OpenAI 兼容端点）。
 * 约定：LLM 失败时必须回落规则引擎——AI 是润滑剂，拔掉它产品完整可用。
 * API Key 只存 localStorage，不进 IndexedDB，因此永远不会被"导出备份"带走。
 */
import { REFRAME } from '../content/copy'
import type { DebiasKind } from './debias'
import { chatCompletion, type LlmConfig } from './llm'

export interface CoachContext {
  scenario: string
  goal?: string
  result?: string
  causes: string[]
}

export interface CoachAdapter {
  readonly id: 'rule' | 'llm'
  readonly label: string
  askDeepQuestions(ctx: CoachContext): Promise<string[]>
  reframe(text: string, kind: DebiasKind): Promise<string>
}

/* ------------------------------ 配置 ------------------------------ */

export type CoachProvider = 'deepseek' | 'moonshot' | 'openai' | 'custom'

export interface CoachConfig {
  mode: 'rule' | 'llm'
  provider: CoachProvider
  baseURL: string
  apiKey: string
  model: string
}

export const PROVIDER_PRESETS: Partial<Record<CoachProvider, { name: string; baseURL: string; model: string }>> = {
  deepseek: { name: 'DeepSeek', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' },
  moonshot: { name: 'Moonshot Kimi', baseURL: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  openai: { name: 'OpenAI', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
}

const KEY = 'fupan-coach'

export const DEFAULT_COACH_CONFIG: CoachConfig = {
  mode: 'rule',
  provider: 'deepseek',
  baseURL: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-chat',
}

export function loadCoachConfig(): CoachConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_COACH_CONFIG }
    const parsed = JSON.parse(raw) as Partial<CoachConfig>
    return { ...DEFAULT_COACH_CONFIG, ...parsed, mode: parsed.mode === 'llm' && parsed.apiKey ? 'llm' : 'rule' }
  } catch {
    return { ...DEFAULT_COACH_CONFIG }
  }
}

export function saveCoachConfig(cfg: CoachConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg))
  } catch {
    /* ignore */
  }
}

export function llmConfigFrom(cfg: CoachConfig): LlmConfig {
  return { baseURL: cfg.baseURL, apiKey: cfg.apiKey, model: cfg.model }
}

/* ------------------------------ 规则引擎实现（离线默认） ------------------------------ */

const DEEP_WITH_CAUSES = [
  '这条原因，再往深挖一层：它为什么会发生？',
  '可控性再审一次：这里面有你能改变的部分吗？',
  '如果同样情况重来一次，哪个环节会最先出问题？',
]
const DEEP_NO_CAUSES = [
  '先把原因写下来——问题才有靶子。',
  '这条差距里，哪个部分是你能控制的？从它开始。',
  '如果只允许改变一件事，你会改哪件？',
]

export class RuleBasedCoach implements CoachAdapter {
  readonly id = 'rule' as const
  readonly label = '规则引擎（离线）'

  async askDeepQuestions(ctx: CoachContext): Promise<string[]> {
    const base = ctx.causes.length > 0 ? DEEP_WITH_CAUSES : DEEP_NO_CAUSES
    // 情绪场景换成触发点视角
    if (ctx.scenario === 'emotion') {
      return ['触发点出现之前，你注意到了什么信号？', '同样的信号下次出现，最早可以在哪一步打断它？']
    }
    return base
  }

  async reframe(_text: string, kind: DebiasKind): Promise<string> {
    return REFRAME[kind]
  }
}

/* ------------------------------ LLM 实现（BYOK） ------------------------------ */

const DEEP_SYSTEM = `你是一位复盘教练（方法论参考《跟着高手学复盘》与圣吉的系统思考）。规则：
- 只提问，不给答案、不评判、不安慰
- 问题必须引用用户上下文中的具体词句，指向更深的因果：数据、流程、环境、前提假设
- 最多 3 个问题，中文，语气温和直接
只输出一个 JSON 字符串数组，例如 ["问题1","问题2","问题3"]`

const REFRAME_SYSTEM = `你是复盘教练。把用户句子里的追责/自责/空洞承诺，改写成一句温和、指向事实与未来的引导问句。
规则：中文一句话、不超过 40 字、不重复用户的负面措辞。
示例：输入"都是小王的错" → 输出"哪个环节的信息或流程，本可以不一样？"
只输出改写后的问句。`

/** 从模型回复中稳健地提取问题数组（兼容 JSON / 编号列表两种格式） */
export function parseStringArray(text: string, max = 3): string[] {
  try {
    const m = text.match(/\[[\s\S]*\]/)
    if (m) {
      const arr = JSON.parse(m[0]) as unknown
      if (Array.isArray(arr)) {
        const out = arr.filter((x): x is string => typeof x === 'string' && x.trim().length > 3)
        if (out.length > 0) return out.slice(0, max)
      }
    }
  } catch {
    /* 落到行解析 */
  }
  // 行回退：仅在文本看起来像列表（≥2 行）时启用，避免把无关整段当成问题
  const lines = text
    .split('\n')
    .map((l) => l.replace(/^[-\d.、)\s]+/, '').replace(/^[：:]\s*/, '').trim())
    .filter((l) => l.length >= 2 && l.length <= 80 && !/[：:]$/.test(l))
  if (lines.length >= 2) return lines.slice(0, max)
  return []
}

export class LlmCoach implements CoachAdapter {
  readonly id = 'llm' as const
  readonly label = 'AI 模型'
  private cfg: CoachConfig
  private fallback: CoachAdapter

  constructor(cfg: CoachConfig, fallback: CoachAdapter = new RuleBasedCoach()) {
    this.cfg = cfg
    this.fallback = fallback
  }

  private llm(): LlmConfig {
    return llmConfigFrom(this.cfg)
  }

  async askDeepQuestions(ctx: CoachContext): Promise<string[]> {
    const user = [
      `复盘场景：${ctx.scenario}`,
      ctx.goal ? `目标/期望：${ctx.goal}` : '',
      ctx.result ? `实际结果：${ctx.result}` : '',
      ctx.causes.length ? `已有原因：${ctx.causes.join('；')}` : '已有原因：（尚未填写）',
      '请给出最多 3 个深挖式追问。',
    ]
      .filter(Boolean)
      .join('\n')
    try {
      const text = await chatCompletion(this.llm(), DEEP_SYSTEM, user)
      const out = parseStringArray(text, 3)
      if (out.length > 0) return out
      return this.fallback.askDeepQuestions(ctx)
    } catch {
      return this.fallback.askDeepQuestions(ctx)
    }
  }

  async reframe(text: string, kind: DebiasKind): Promise<string> {
    try {
      const out = await chatCompletion(this.llm(), REFRAME_SYSTEM, `输入："${text}"`)
      const cleaned = out.trim().replace(/^["“]|["”]$/g, '')
      if (cleaned.length > 0 && cleaned.length <= 80) return cleaned
      return this.fallback.reframe(text, kind)
    } catch {
      return this.fallback.reframe(text, kind)
    }
  }
}

/* ------------------------------ 工厂 ------------------------------ */

export function getCoach(cfg = loadCoachConfig()): CoachAdapter {
  if (cfg.mode === 'llm' && cfg.apiKey.trim() !== '') return new LlmCoach(cfg)
  return new RuleBasedCoach()
}
