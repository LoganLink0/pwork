import { db } from '../../../db/schema'
import { itemsOfLocalDay } from '../../../db/collect'
import type { Item } from '../../../types/models'
import { chatCompletionCached } from '../../../engine/aiCached'
import { recordError } from '../../../engine/errorLog'
import { loadCoachConfig } from '../../review/engine/coach'

/**
 * 41 批 · 条目 AI 一句话摘要（「已经替你读好了」的实体化）。
 * 设计纪律：
 * - 仅用户配置 AI（mode==='llm'）时生成；未配置直接跳过，永不打扰
 * - 批量限速：逐条串行 + 1s 间隔（400ms 的连发曾整批被服务商限流——2026-11-22 实测
 *   28 条仅 1 条成功且零留痕）；单次调用超时 30s；单条失败跳过，下次自然重试
 * - 失败不再完全静默：一批结束若全部/多数失败，记一条批量错误（含首个原因）——
 *   服务商配额/限流类系统性失败必须可见（出错立即暴露纪律；此前零留痕致用户只见
 *   空白摘要不知原因）
 * - 摘要走 AI 缓存表（aiCache）：同一条目内容未变不重复计费
 * - 生成触发：抓取完成后（store 层）+ 打开日报页限量补挂（每次 ≤10 条）
 */

const PURPOSE = 'item-aisummary'
const BATCH_INTERVAL_MS = 1000
const PAGE_LIMIT = 10

/** AI 是否可用（配置了 LLM 模式才算——rule 模式无生成能力） */
function aiReady(): boolean {
  try {
    const cfg = loadCoachConfig()
    return cfg.mode === 'llm'
  } catch {
    return false
  }
}

/** 组装输入：标题 + 全文前 800 字（无全文用 RSS 摘要兜底） */
function buildUserInput(item: Item): string {
  const body = (item.content || item.summary || '').slice(0, 800)
  return `标题：${item.title}\n来源：${item.sourceName}\n内容：${body}`
}

/** 单条生成并写库。返回生成的摘要（失败/不可用返回 null，原因经 onFail 上报） */
export async function summarizeItem(
  item: Item,
  onFail?: (reason: string) => void,
): Promise<string | null> {
  if (!aiReady()) return null
  try {
    const { text } = await chatCompletionCached({
      purpose: PURPOSE,
      inputKey: `${item.id}@${item.updatedAt}`,
      system: '你是资讯摘要助手。把这条资讯压缩成一句不超过 60 字的中文，说清发生了什么、与关注它的读者何干。只输出摘要本身，不要前缀、引号或解释。',
      user: buildUserInput(item),
      maxTokens: 120,
    })
    const summary = text.trim().replace(/^["'「『]|["'」』]$/g, '').slice(0, 120)
    if (!summary) {
      onFail?.('AI 返回了空摘要')
      return null
    }
    await db.items.update(item.id, { aiSummary: summary, aiSummaryAt: new Date().toISOString() })
    return summary
  } catch (err) {
    onFail?.(err instanceof Error ? err.message : String(err))
    return null
  }
}

/** 打开日报页时的限量补挂：对当日缺摘要的 kept 条目补生成（每次 ≤10 条，防止一次性巨量调用）。
 *  一批结束若有失败，记一条批量错误（条数 + 首个原因）——失败可见但不刷屏 */
export async function summarizeDailyBackfill(date: string, limit = PAGE_LIMIT): Promise<number> {
  if (!aiReady()) return 0
  const all = await itemsOfLocalDay(date)
  const targets = all.filter((i) => i.stage !== 'raw' && i.stage !== 'discarded' && !i.aiSummary).slice(0, limit)
  let n = 0
  const failures: string[] = []
  for (const item of targets) {
    await summarizeItem(item, (reason) => {
      failures.push(`「${item.title.slice(0, 20)}」：${reason}`)
    })
    n += 1
    if (item !== targets[targets.length - 1]) await new Promise((r) => setTimeout(r, BATCH_INTERVAL_MS))
  }
  if (failures.length) {
    void recordError({
      where: 'AI 一句话摘要 summarizeDailyBackfill',
      kind: 'app',
      message: `本批 ${targets.length} 条中 ${failures.length} 条生成失败（已跳过，下次打开日报页自动重试）；首条失败：${failures[0]}`,
    })
  }
  return n
}
