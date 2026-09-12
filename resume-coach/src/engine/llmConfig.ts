/**
 * AI 配置（简历辅导自有存储，键名独立）：直连模式 Key 存 localStorage；本地网关模式 Key 在网关进程（浏览器侧 sentinel 占位）。
 * 与 PWORK 共用同一个本地网关（app 目录 npm run gateway，127.0.0.1:8788，CORS 放行所有 localhost 来源）。
 */

export type CoachProvider = 'deepseek' | 'moonshot' | 'openai' | 'custom'

export interface LlmSettings {
  mode: 'rule' | 'llm'
  provider: CoachProvider
  baseURL: string
  apiKey: string
  model: string
  /** 接入方式：gateway = Key 只存本机 .env.local（推荐）；direct = Key 存 localStorage */
  viaGateway?: boolean
  gatewayUrl?: string
}

export interface LlmConfig {
  baseURL: string
  apiKey: string
  model: string
}

const KEY = 'resume-coach-llm'

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  mode: 'rule',
  provider: 'deepseek',
  baseURL: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-chat',
}

export const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:8788'

export function loadLlmSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_LLM_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<LlmSettings>
    // 归一化：mode 只有在确有凭据（直连 Key 或网关）时才是 llm，否则一律按未配置处理
    return { ...DEFAULT_LLM_SETTINGS, ...parsed, mode: parsed.mode === 'llm' && (parsed.apiKey || parsed.viaGateway) ? 'llm' : 'rule' }
  } catch {
    return { ...DEFAULT_LLM_SETTINGS }
  }
}

export function saveLlmSettings(cfg: LlmSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg))
  } catch {
    /* ignore */
  }
}

/** AI 是否已配置（网关模式浏览器侧没有 Key，看 mode 归一化结果） */
export function llmConfigured(): boolean {
  return loadLlmSettings().mode === 'llm'
}

export function llmConfigFrom(cfg: LlmSettings): LlmConfig {
  // 网关模式：Key 由网关注入，浏览器侧不带真实 Key（sentinel 占位）
  if (cfg.viaGateway) {
    const base = (cfg.gatewayUrl || DEFAULT_GATEWAY_URL).replace(/\/+$/, '')
    return { baseURL: /\/v\d+$/.test(base) ? base : `${base}/v1`, apiKey: 'pwork-gateway', model: cfg.model }
  }
  return { baseURL: cfg.baseURL, apiKey: cfg.apiKey, model: cfg.model }
}
