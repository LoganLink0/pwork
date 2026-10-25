/**
 * chatCompletion 的缓存版（2026-09-29）：AIHOT 回执"重试不重复付费"的本地轻量实现。
 * 同一 purpose + 输入指纹 + 提示词 + 模型 → 直接复用 7 天内的上次结果；
 * 用于"材料没变、重复点生成"的场景（分析草稿 / 文章草稿 / PPT 大纲）。
 */
import { aiCacheKey, getCachedAi, putCachedAi } from '../db/aiCache'
import { chatCompletion } from '../modules/review/engine/llm'
import { loadCoachConfig, llmConfigFrom } from '../modules/review/engine/coach'

export interface CachedAiCall {
  /** 用途标识（如 'article'）——不同用途即使输入相同也不互串 */
  purpose: string
  /** 输入指纹：材料 id+内容、视角、受众等一切影响输出的要素拼进来 */
  inputKey: string
  system: string
  user: string
  maxTokens: number
}

export async function chatCompletionCached(call: CachedAiCall): Promise<{ text: string; cached: boolean }> {
  const cfg = loadCoachConfig()
  const key = aiCacheKey(call.purpose, call.inputKey, call.system, cfg.model)
  const hit = await getCachedAi(key)
  if (hit !== null) return { text: hit, cached: true }
  const text = await chatCompletion(llmConfigFrom(cfg), call.system, call.user, { maxTokens: call.maxTokens, timeoutMs: 90000, purpose: call.purpose })
  await putCachedAi(key, call.purpose, text, cfg.model)
  return { text, cached: false }
}
