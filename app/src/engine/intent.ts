/**
 * 本地意图层（2026-11-15 外部研读报告改动 2）：问小 P 未配 AI 时的本地降级。
 * 外部对照报告第三期 §一/§四 判定「AI 可选」承诺在对话入口缺本地降级实现，此文件补上。
 * 意图清单（全部只读；「记一条」写路径经用户拍板移除——速记浮层/页面是既有低摩擦
 * 记录入口，隐式语法的第二入口认知成本大于价值）：
 *   ① 查排期（只读，且在 AI 之前先行路由）：「待办/安排/日程 + 什么/哪些/看看」
 *      → 汇总未完成任务——全库检索不含待办表，不能交给 AI 检索硬答
 *   ② 默认：本地检索（searchMulti 正文级）组装命中清单 + 来源（与 AI 问答同形状）
 * 日期用 datetime.ts 的 todayLocal/localDateOf（本地时间纪律：注入 now，不裸读时钟）。
 */
import { db } from '../db/schema'
import { searchMulti, type SearchHit } from './searchAll'
import { todayLocal, localDateOf } from './datetime'
import type { AskAiSource } from './askAi'

export interface LocalIntentResult {
  reply: string
  sources: AskAiSource[]
  /** 走了哪个意图（调试与测试断言用） */
  via: 'schedule' | 'search'
}

/** 排期意图纯判定（供调用方在 AI 之前先行路由）：待办类词 + 询问句式。
 *  全库检索不含待办表——「最近有什么待办」必须本地查 tasks，不能交给 AI 检索。 */
export function isScheduleIntent(q: string): boolean {
  return /待办|安排|日程|排期|事项/.test(q) && /什么|哪些|看看|列表|有没有|还有/.test(q)
}

async function scheduleReply(now: Date): Promise<LocalIntentResult> {
  const today = todayLocal(now)
  const tomorrow = localDateOf(new Date(now.getTime() + 86_400_000).toISOString())
  const all = await db.tasks.toArray()
  const open = all.filter((t) => t.status === 'todo')
  const overdue = open.filter((t) => t.due && t.due < today)
  const dueToday = open.filter((t) => t.due === today)
  const dueTomorrow = open.filter((t) => t.due === tomorrow)
  const later = open.filter((t) => t.due && t.due > tomorrow).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''))
  const undated = open.filter((t) => !t.due)
  const lines: string[] = []
  if (overdue.length) lines.push(`逾期 ${overdue.length} 条：` + overdue.slice(0, 4).map((t) => `${t.title}（${t.due}）`).join('、'))
  if (dueToday.length) lines.push(`今天 ${dueToday.length} 条：` + dueToday.slice(0, 4).map((t) => t.title).join('、'))
  if (dueTomorrow.length) lines.push(`明天 ${dueTomorrow.length} 条：` + dueTomorrow.slice(0, 4).map((t) => t.title).join('、'))
  if (later.length) lines.push(`之后 ${later.length} 条，最近的一条：${later[0].title}（${later[0].due}）`)
  if (undated.length) lines.push(`另有 ${undated.length} 条没设期限`)
  if (lines.length === 0) lines.push('当前没有未完成的待办。')
  return { reply: lines.join('\n'), sources: [], via: 'schedule' as const }
}

async function searchReply(q: string): Promise<LocalIntentResult> {
  const hits: SearchHit[] = await searchMulti(q)
  if (hits.length === 0) {
    return {
      reply: '本地没有找到相关内容。可以换个说法，或先往库里记一些相关内容。',
      sources: [],
      via: 'search' as const,
    }
  }
  const top = hits.slice(0, 5)
  const lines = top.map((h, i) => `[${i + 1}] ${h.title}`)
  return {
    reply: `本地检索到 ${hits.length} 条相关内容（未连接 AI，以下为命中清单）：\n` + lines.join('\n'),
    sources: top.map((h) => ({ kind: h.kind, title: h.title, to: h.to })),
    via: 'search' as const,
  }
}

/** 问小 P 的本地降级入口：未配 AI 时由 CommandPalette 调用（AI 可用时走 askLibrary 不经此） */
export async function runLocalIntent(message: string, now: Date = new Date()): Promise<LocalIntentResult> {
  const q = message.trim()
  if (!q) return { reply: '先输入要问的内容', sources: [], via: 'search' as const }
  // 查排期：出现待办/安排/日程类词，且是询问句式
  if (isScheduleIntent(q)) {
    return scheduleReply(now)
  }
  return searchReply(q)
}
