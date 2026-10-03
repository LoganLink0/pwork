/**
 * AI 结果缓存数据层（2026-09-29）：按 purpose+输入指纹+提示词+模型 复用 AI 产出。
 * 维护策略：读时校验 TTL（7 天）；写入顺带清过期与超量（上限 200 条，最旧先出）——免专门定时任务。
 */
import { db } from './schema'
import { recordError } from '../engine/errorLog'

const TTL_MS = 7 * 24 * 3600_000
const MAX_ROWS = 200

/** FNV-1a：同步轻量哈希，够指纹用（非安全用途） */
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16)
}

/** 缓存键 = 目的 + 输入指纹 + 提示词 + 模型 的哈希——任一变化即视为新请求 */
export function aiCacheKey(purpose: string, inputKey: string, system: string, model: string): string {
  return `aic_${fnv1a([purpose, inputKey, system, model].join('\u0001'))}`
}

export async function getCachedAi(id: string): Promise<string | null> {
  const row = await db.aiCache.get(id)
  if (!row) return null
  if (Date.now() - new Date(row.createdAt).getTime() > TTL_MS) return null
  return row.output
}

export async function putCachedAi(id: string, purpose: string, output: string, model: string): Promise<void> {
  await db.aiCache.put({ id, purpose, output, model, createdAt: new Date().toISOString() })
  await maintainAiCache()
}

/** 过期清理 + 超量淘汰（最旧先出）；失败不阻塞主流程，但必须留痕（2026-10 错误纪律） */
async function maintainAiCache(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - TTL_MS).toISOString()
    await db.aiCache.where('createdAt').below(cutoff).delete()
    const count = await db.aiCache.count()
    if (count > MAX_ROWS) {
      const oldest = await db.aiCache.orderBy('createdAt').limit(count - MAX_ROWS).toArray()
      await db.aiCache.bulkDelete(oldest.map((r) => r.id))
    }
  } catch (err) {
    void recordError({
      where: 'AI 缓存例行清理 maintainAiCache',
      kind: 'app',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
