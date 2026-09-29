/**
 * ingest 请求体的规范化与限额（纯函数，端点只留薄壳）：
 * 字段截断 + 单请求条数上限 + 分钟限流阈值。Token 泄漏时把 D1 写入敞口压到有界。
 * （AIHOT ingest 的做法：每请求 50 条 + 每分钟限额，2026-09-29 移植）
 */

export const INGEST_MAX_PER_REQUEST = 50
export const INGEST_MAX_PER_MINUTE = 30

export interface IngestBlockInput {
  source: string
  title: string
  content: string
}

export interface NormalizeResult {
  blocks: IngestBlockInput[]
  /** 字段缺失或空白的条数 */
  skipped: number
  /** 超出单请求上限被丢弃的条数 */
  truncated: number
}

export function normalizeIngest(body: unknown): NormalizeResult {
  const asRecord = body as { blocks?: unknown; title?: unknown } | null
  const raw: Record<string, unknown>[] = Array.isArray(asRecord?.blocks)
    ? (asRecord!.blocks as Record<string, unknown>[])
    : asRecord && typeof asRecord === 'object' && asRecord.title !== undefined
      ? [asRecord as Record<string, unknown>]
      : []
  const truncated = Math.max(0, raw.length - INGEST_MAX_PER_REQUEST)
  const blocks: IngestBlockInput[] = []
  let skipped = 0
  for (const b of raw.slice(0, INGEST_MAX_PER_REQUEST)) {
    const title = typeof b.title === 'string' ? b.title.trim().slice(0, 40) : ''
    const content = typeof b.content === 'string' ? b.content.trim().slice(0, 20000) : ''
    if (!title || !content) {
      skipped++
      continue
    }
    blocks.push({ source: String(b.source ?? 'api').slice(0, 40), title, content })
  }
  return { blocks, skipped, truncated }
}

/** 分钟键（UTC YYYY-MM-DDTHH:mm，由代码生成，仅数字与分隔符） */
export function minuteKey(now = new Date()): string {
  return now.toISOString().slice(0, 16)
}
