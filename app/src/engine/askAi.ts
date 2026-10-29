/**
 * AI 全库问答重启（0.4-4，2026-10-29）：10-23 回撤的根因是上下文只给检索标题
 * 导致答非所问——本次检索与上下文一起升到正文级（searchAll 正文级命中的同一套）。
 * 流程：检索命中 → 按命中取回完整正文 → 按字数预算装配上下文 → AI 作答并附来源。
 * 不可用时（未配 AI）调用方收到明确错误，检索不受影响。
 */
import { db } from '../db/schema'
import { searchAll, type SearchHit } from './searchAll'
import { chatCompletion } from '../modules/review/engine/llm'
import { llmConfigFrom, loadCoachConfig } from '../modules/review/engine/coach'

export interface AskAiSource {
  kind: SearchHit['kind']
  title: string
  to: string
}

export interface AskAiResult {
  answer: string
  sources: AskAiSource[]
}

/** 单条正文预算与总预算（字符）：上下文过长会稀释答案并挤爆输出 */
const PER_ITEM_BUDGET = 600
export const ASK_TOTAL_BUDGET = 4000

/** 纯函数：正文数组 → 编号上下文块（单条截断 + 总预算约束；空文本跳过） */
export function pickBlocks(texts: string[], totalBudget: number = ASK_TOTAL_BUDGET, perItemBudget: number = PER_ITEM_BUDGET): string[] {
  const blocks: string[] = []
  let used = 0
  for (const raw of texts) {
    if (!raw) continue
    if (used >= totalBudget) break
    const clipped = raw.length > perItemBudget ? `${raw.slice(0, perItemBudget)}…` : raw
    const block = `[${blocks.length + 1}] ${clipped}`
    if (used + block.length > totalBudget) break
    blocks.push(block)
    used += block.length
  }
  return blocks
}

/** 按命中取回完整正文（速记全文 / 条目摘要+批注 / 洞察全文 / 复盘小结 / 任务执行意图） */
async function fullTextOf(hit: SearchHit): Promise<string> {
  switch (hit.kind) {
    case 'note': {
      const n = await db.notes.get(hit.id)
      return n ? `${n.title ? `标题：${n.title}\n` : ''}${n.body}` : ''
    }
    case 'item': {
      const i = await db.items.get(hit.id)
      if (!i) return ''
      return `${i.title}\n${i.summary ?? ''}${i.annotation?.notes ? `\n我的批注：${i.annotation.notes}` : ''}`
    }
    case 'insight': {
      const i = await db.insights.get(hit.id)
      return i?.text ?? ''
    }
    case 'review': {
      const r = await db.reviews.get(hit.id)
      return r ? `${r.title}\n${(r.summary ?? []).join('\n')}` : ''
    }
    case 'task': {
      const t = await db.tasks.get(hit.id)
      if (!t) return ''
      return `${t.title}${t.due ? `（期限 ${t.due}）` : ''}${t.ifThen ? ` 执行意图：${t.ifThen}` : ''}`
    }
    default:
      return ''
  }
}

/**
 * 全库问答：检索 → 装配 → 作答。AI 未配置/网关不可达时抛错（调用方展示人话提示）。
 * 引入 now 参数体内不读时钟的纪律不涉及（无时间逻辑）。
 */
export async function askLibrary(question: string): Promise<AskAiResult> {
  const q = question.trim()
  if (!q) throw new Error('先输入要问的内容')
  const coach = loadCoachConfig()
  const cfg = llmConfigFrom(coach)
  if (coach.viaGateway !== true && !cfg.apiKey) throw new Error('还没有配置 AI——在 设置 → AI 或首访引导里配好 Key 即可使用')

  const hits = await searchAll(q)
  const sources: AskAiSource[] = hits
    .filter((h) => h.kind !== 'term')
    .map((h) => ({ kind: h.kind, title: h.title, to: h.to }))

  const texts: string[] = []
  for (const h of hits) texts.push(await fullTextOf(h))
  const blocks = pickBlocks(texts)
  if (blocks.length === 0) {
    return { answer: '全库里没有找到与这个问题相关的内容（检索是正文级的，包括速记正文、条目摘要与批注、洞察全文）。可以把问题换个说法，或先往库里记一些相关内容。', sources: [] }
  }

  const system = [
    '你是个人工作台的资料问答助手。只依据提供的资料回答问题，并标注引用编号（如 [1]）。',
    '资料没有覆盖的部分就直说"资料里没有"，不要编造。回答用简体中文，简洁直接。',
  ].join('\n')
  const user = `我的资料：\n\n${blocks.join('\n\n')}\n\n问题：${q}`
  const answer = await chatCompletion(cfg, system, user, { purpose: 'library-ask', maxTokens: 1200, timeoutMs: 60000 })
  return { answer, sources }
}
