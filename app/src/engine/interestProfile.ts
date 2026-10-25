/**
 * AI 兴趣画像（2026-10-20 第一性重设计）：从「多推」投票的条目标题里归纳兴趣词表，
 * 替代手填词表驱动评分的相关度——语义的事交给 AI，规则只做确定性的事。
 *
 * 触发：设置页手动按钮，或打开应用时自动（攒够 PROFILE_MIN_WANTS 条「多推」投票、
 * 且距上次归纳又新增了 PROFILE_AUTO_DELTA 条）。失败保持现有词表，静默入错误日志。
 */
import { db } from '../db/schema'
import { chatCompletion } from '../modules/review/engine/llm'
import { llmConfigFrom, loadCoachConfig } from '../modules/review/engine/coach'
import { useCollect } from '../store/collect'
import { recordError } from './errorLog'
import { itemTiers } from './itemTier'
import type { Item } from '../types/models'

export const PROFILE_MIN_WANTS = 20 // 启用门槛：至少 20 条「多推」投票
export const PROFILE_AUTO_DELTA = 15 // 自动重归纳：距上次归纳新增 15 条「多推」

/** 「多推」投票的条目标题（最近优先，最多 200 条） */
export function wantTitles(items: { deletedAt?: string; fetchedAt: string; title: string; annotation?: { vote?: string | null } }[]): string[] {
  return items
    .filter((i) => !i.deletedAt && i.annotation?.vote === 'want')
    .sort((a, b) => (a.fetchedAt < b.fetchedAt ? 1 : -1))
    .slice(0, 200)
    .map((i) => i.title)
}

/** 系统当时没排进当天前两名、但你标了「多推」的标题——信息量最大的样本：
 *  现有词表漏掉的主题全在这里，归纳时单独喂给 AI 重点学习 */
export function underestimatedWants(items: Item[]): string[] {
  const tiers = itemTiers(items)
  return items
    .filter((i) => !i.deletedAt && i.annotation?.vote === 'want' && tiers.get(i.id) !== 'must')
    .sort((a, b) => (a.fetchedAt < b.fetchedAt ? 1 : -1))
    .slice(0, 50)
    .map((i) => i.title)
}

/** 解析 AI 回复中的词表（容错：截取首个 JSON 对象，字段校验+去重+截断） */
export function parseInterests(reply: string): string[] {
  const m = reply.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('AI 回复里没有 JSON')
  const parsed = JSON.parse(m[0]) as { interests?: unknown }
  if (!Array.isArray(parsed.interests)) throw new Error('AI 回复的 JSON 里没有 interests 数组')
  const words = parsed.interests
    .filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
    .map((w) => w.trim())
  return [...new Set(words)].slice(0, 30)
}

/** 调 AI 归纳兴趣词表并写入采集配置；成功返回词数，失败返回原因（不改动现有词表） */
export async function refreshInterestProfile(): Promise<{ ok: true; words: number } | { ok: false; error: string }> {
  const ai = loadCoachConfig()
  if (ai.mode !== 'llm') return { ok: false, error: 'AI 未启用（设置 → AI · BYOK 选 LLM 模式）——保持现有词表' }
  const all = await db.items.toArray()
  const titles = wantTitles(all)
  if (titles.length < PROFILE_MIN_WANTS) {
    return { ok: false, error: `「多推」投票还不够（${titles.length}/${PROFILE_MIN_WANTS}）——先在信息日报里投票` }
  }
  // 被低估样本：系统排位不高但你标了多推——词表漏掉的主题，让 AI 重点补课
  const under = underestimatedWants(all)
  const underSection = under.length
    ? `\n\n其中这些当时没有排进当天前两名，但你标了「多推」——现有词表大概率漏了这类主题，归纳时重点从它们身上找：\n${under.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
    : ''
  const dislikes = useCollect.getState().config.dislikes
  const system = '你是兴趣画像归纳器。从用户明确标为"多推"（希望多看到这类）的信息标题中，归纳这位用户关注什么的词表。只输出 JSON，不要多余文字。'
  const user = `用户标为"多推"的标题（最近 ${titles.length} 条）：\n${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}${underSection}\n\n用户的屏蔽词（归纳时要避开）：${dislikes.join('、') || '无'}\n\n归纳 15–30 个兴趣关键词：中文为主，保留必要的英文专有名词；写"用户关注什么"（如 独立开发、增长打法），不要写"这些文章讲了什么"。输出：{"interests": ["词1", "词2"]}`
  const reply = await chatCompletion(llmConfigFrom(ai), system, user, { maxTokens: 2000, timeoutMs: 60_000, purpose: 'interest-profile' })
  const interests = parseInterests(reply)
  if (interests.length === 0) throw new Error('归纳结果为空')
  useCollect.getState().setConfig({ interests })
  return { ok: true, words: interests.length }
}

/** 打开应用时的自动触发（静默：成功 toast 一次，失败入错误日志不打扰） */
export async function autoRefreshInterestProfile(): Promise<void> {
  const wants = wantTitles(await db.items.toArray()).length
  if (wants < PROFILE_MIN_WANTS) return
  const last = JSON.parse(localStorage.getItem('pwork-profile') ?? 'null') as { at: string; wants: number } | null
  if (last && wants - last.wants < PROFILE_AUTO_DELTA) return
  try {
    const r = await refreshInterestProfile()
    if (r.ok) {
      localStorage.setItem('pwork-profile', JSON.stringify({ at: new Date().toISOString(), wants }))
      const { toast } = await import('./toast')
      toast('ok', `兴趣画像已更新：${r.words} 个关键词（据你的「多推」投票归纳）`)
    }
  } catch (e) {
    void recordError(
      { where: '兴趣画像.自动归纳', kind: 'app', message: e instanceof Error ? e.message : String(e) },
      { silent: true },
    )
  }
}
