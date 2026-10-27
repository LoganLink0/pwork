/**
 * AI 教练适配器（PRD 7.4）。
 * 两级实现：RuleBasedCoach（离线默认，确定性规则）/ LlmCoach（用户自带 Key 的 OpenAI 兼容端点）。
 * 约定：LLM 失败时必须回落规则引擎——AI 是润滑剂，拔掉它产品完整可用。
 * API Key 只存 localStorage，不进 IndexedDB，因此永远不会被"导出备份"带走。
 */
import { REFRAME } from '../content/copy'
import type { DebiasKind } from './debias'
import { chatCompletion, type LlmConfig } from './llm'
import { parseAiJson } from '../../../engine/aiJson'
import { isDesktopApp as isDesktopRuntime } from '../../../engine/platform'

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

export type CoachProvider =
  | 'deepseek' | 'zhipu' | 'moonshot' | 'openai'
  | 'qwen' | 'doubao' | 'hunyuan' | 'ernie' | 'spark'
  | 'siliconflow' | 'openrouter'
  | 'claude' | 'gemini' | 'grok' | 'groq'
  | 'ollama'
  | 'custom'

export interface CoachConfig {
  mode: 'rule' | 'llm'
  provider: CoachProvider
  baseURL: string
  apiKey: string
  model: string
  /** 接入方式（MIND 设计）：gateway = Key 只存本机 .env.local，浏览器经本地网关调用（推荐）；direct = Key 存 localStorage */
  viaGateway?: boolean
  gatewayUrl?: string
}

/** 厂商预设（端点/Key 页 2026-10-27 官方文档查证；默认模型名 2026-10-27 逐家重查修正——
 *  模型名随版本演进，过期时在 设置 → AI 里可改）。ollama 是本机模型端点，Key 随便填即可通过鉴权。 */
export const PROVIDER_PRESETS: Partial<Record<CoachProvider, { name: string; baseURL: string; model: string }>> = {
  deepseek: { name: 'DeepSeek', baseURL: 'https://api.deepseek.com', model: 'deepseek-flash' },
  zhipu: { name: '智谱', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.3-flash' },
  moonshot: { name: 'Moonshot Kimi', baseURL: 'https://api.moonshot.cn/v1', model: 'kimi-k3' },
  openai: { name: 'OpenAI', baseURL: 'https://api.openai.com/v1', model: 'gpt-5-mini' },
  qwen: { name: '通义千问', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  doubao: { name: '豆包', baseURL: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seed-1-8' },
  hunyuan: { name: '腾讯混元', baseURL: 'https://api.hunyuan.cloud.tencent.com/v1', model: 'hunyuan-turbos-latest' },
  ernie: { name: '百度文心', baseURL: 'https://qianfan.baidubce.com/v2', model: 'ernie-4.5-turbo-32k' },
  spark: { name: '讯飞星火', baseURL: 'https://spark-api-open.xf-yun.com/v1', model: '4.0Ultra' },
  siliconflow: { name: '硅基流动', baseURL: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen3.5-4B' },
  openrouter: { name: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', model: 'openrouter/auto' },
  claude: { name: 'Claude', baseURL: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-6' },
  gemini: { name: 'Gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3-flash' },
  grok: { name: 'Grok', baseURL: 'https://api.x.ai/v1', model: 'grok-4.7' },
  groq: { name: 'Groq', baseURL: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  ollama: { name: '本地模型（Ollama）', baseURL: 'http://127.0.0.1:11434/v1', model: 'qwen3:8b' },
}

/** 大模型厂商直达信息（端点/Key 页/默认模型 2026-10-27 官方文档逐一查证）：引导页与设置页配置 AI 用。
 *  keyPage 是各自开放平台「获取 API Key」页面的直达地址；group 用于引导页与设置页的分组呈现。
 *  引导页展示前两组（国内常用 + 聚合），其余在 设置 → AI 的完整列表里。 */
export type VendorGroup = '国内常用' | '聚合平台' | '国际' | '本地'
export const AI_VENDORS: { id: CoachProvider; name: string; keyPage: string; group: VendorGroup }[] = [
  { id: 'deepseek', name: 'DeepSeek', keyPage: 'https://platform.deepseek.com/api_keys', group: '国内常用' },
  { id: 'zhipu', name: '智谱', keyPage: 'https://open.bigmodel.cn/usercenter/apikeys', group: '国内常用' },
  { id: 'moonshot', name: 'Moonshot Kimi', keyPage: 'https://platform.kimi.com/console/api-keys', group: '国内常用' },
  { id: 'qwen', name: '通义千问', keyPage: 'https://bailian.console.aliyun.com/model/settings/api-key', group: '国内常用' },
  { id: 'doubao', name: '豆包', keyPage: 'https://console.volcengine.com/ark', group: '国内常用' },
  { id: 'hunyuan', name: '腾讯混元', keyPage: 'https://console.cloud.tencent.com/hunyuan/api-key', group: '国内常用' },
  { id: 'ernie', name: '百度文心', keyPage: 'https://console.bce.baidu.com/qianfan/overview', group: '国内常用' },
  { id: 'spark', name: '讯飞星火', keyPage: 'https://xinghuo.xfyun.cn', group: '国内常用' },
  { id: 'openai', name: 'OpenAI', keyPage: 'https://platform.openai.com/api-keys', group: '国际' },
  { id: 'siliconflow', name: '硅基流动', keyPage: 'https://cloud.siliconflow.cn/account/ak', group: '聚合平台' },
  { id: 'openrouter', name: 'OpenRouter', keyPage: 'https://openrouter.ai/settings/keys', group: '聚合平台' },
  { id: 'claude', name: 'Claude', keyPage: 'https://console.anthropic.com/settings/keys', group: '国际' },
  { id: 'gemini', name: 'Gemini', keyPage: 'https://aistudio.google.com/apikey', group: '国际' },
  { id: 'grok', name: 'Grok', keyPage: 'https://console.x.ai', group: '国际' },
  { id: 'groq', name: 'Groq', keyPage: 'https://console.groq.com/keys', group: '国际' },
  { id: 'ollama', name: '本地模型（Ollama）', keyPage: 'https://ollama.com', group: '本地' },
]

const KEY = 'fupan-coach'

export const DEFAULT_COACH_CONFIG: CoachConfig = {
  mode: 'rule',
  provider: 'deepseek',
  baseURL: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-flash',
}

export function loadCoachConfig(): CoachConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_COACH_CONFIG }
    const parsed = JSON.parse(raw) as Partial<CoachConfig>
    const cfg: CoachConfig = { ...DEFAULT_COACH_CONFIG, ...parsed, mode: parsed.mode === 'llm' && (parsed.apiKey || parsed.viaGateway) ? 'llm' : 'rule' }
    // 桌面版没有浏览器直连模式（2026-10-27 边界定稿）：内嵌网关是唯一方式，
    // 历史上存过直连配置的桌面用户在这里自动归一，Key 在网关里的照常可用
    if (cfg.mode === 'llm' && !cfg.viaGateway && isDesktopRuntime()) {
      return { ...cfg, viaGateway: true, gatewayUrl: cfg.gatewayUrl || DEFAULT_GATEWAY_URL }
    }
    return cfg
  } catch {
    return { ...DEFAULT_COACH_CONFIG }
  }
}

/** AI 是否已配置：mode 归一化后为 'llm' 即成立——直连模式看 Key，本地网关模式 Key 在网关进程里（浏览器侧没有） */
export function llmConfigured(): boolean {
  return loadCoachConfig().mode === 'llm'
}

export function saveCoachConfig(cfg: CoachConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg))
  } catch {
    /* ignore */
  }
}

export const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:8788'

/** 网关真实状态探测：引导页与设置页共用的判定源（本地存的"已配置"可能只是历史残留，
 *  网关进程里到底有没有 Key 要问 /health 才算数） */
export type GatewayProbe = { online: boolean; chatConfigured: boolean; searchConfigured?: boolean }

export async function probeGateway(url: string = DEFAULT_GATEWAY_URL): Promise<GatewayProbe> {
  const base = url.replace(/\/+$/, '')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 2500)
  try {
    const r = await fetch(`${base}/health`, { signal: ctrl.signal })
    const j = (await r.json()) as { ok?: boolean; chatConfigured?: boolean; searchConfigured?: boolean }
    return { online: Boolean(j.ok), chatConfigured: Boolean(j.chatConfigured), searchConfigured: Boolean(j.searchConfigured) }
  } catch {
    return { online: false, chatConfigured: false }
  } finally {
    clearTimeout(timer)
  }
}

/** 网关连接测试：经网关发一条最小对话——Key 有效性以一次真实上游调用为准（通/不通都有明确结论）。
 *  成功返回 {ok:true}；失败返回上游/网关的具体错误消息，供界面通知 */
export async function testGatewayChat(url: string = DEFAULT_GATEWAY_URL, model = 'deepseek-chat'): Promise<{ ok: boolean; error?: string }> {
  const base = url.replace(/\/+$/, '')
  try {
    const r = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: '连接测试' }], max_tokens: 4, purpose: '连接测试' }),
    })
    if (r.ok) return { ok: true }
    const j = (await r.json().catch(() => null)) as { error?: string | { message?: string } } | null
    const err = typeof j?.error === 'string' ? j.error : j?.error?.message
    return { ok: false, error: err ?? `HTTP ${r.status}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function llmConfigFrom(cfg: CoachConfig): LlmConfig {
  // 网关模式：Key 由网关注入，浏览器侧不带真实 Key（sentinel 占位）
  if (cfg.viaGateway) {
    const base = (cfg.gatewayUrl || DEFAULT_GATEWAY_URL).replace(/\/+$/, '')
    return { baseURL: /\/v\d+$/.test(base) ? base : `${base}/v1`, apiKey: 'pwork-gateway', model: cfg.model }
  }
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
      // parseAiJson：多一层字符串内控制字符修复（模型中文输出偶发裸 \x0b，JSON.parse 必炸）
      const arr = parseAiJson<unknown>(m[0])
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
      const text = await chatCompletion(this.llm(), DEEP_SYSTEM, user, { purpose: 'review-coach' })
      const out = parseStringArray(text, 3)
      if (out.length > 0) return out
      return this.fallback.askDeepQuestions(ctx)
    } catch {
      return this.fallback.askDeepQuestions(ctx)
    }
  }

  async reframe(text: string, kind: DebiasKind): Promise<string> {
    try {
      const out = await chatCompletion(this.llm(), REFRAME_SYSTEM, `输入："${text}"`, { purpose: 'review-reframe' })
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
  // 网关模式下 Key 在网关进程（浏览器侧 apiKey 为空），viaGateway 即已配置——不能只看 apiKey 把网关用户挡在门外
  if (cfg.mode === 'llm' && (cfg.apiKey.trim() !== '' || cfg.viaGateway)) return new LlmCoach(cfg)
  return new RuleBasedCoach()
}
