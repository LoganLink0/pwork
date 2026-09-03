/**
 * 文章草稿（输出 O4）：速记与洞察卡按周期聚合成素材 → AI 整理成文章骨架（人逐节修改）→ 导出 Markdown。
 * 与报告撰写同一分工方式：AI 只产出结构化草稿，编辑权在人。
 */
import { db } from '../db/schema'
import { localDateOf, todayLocal } from './datetime'

export interface ArticleMaterial {
  id: string
  kind: 'note' | 'insight'
  title: string
  body: string
  createdAt: string
}

export interface ArticleDraft {
  title: string
  intro: string
  sections: { heading: string; body: string }[]
}

/* ------------------------------ 素材聚合 ------------------------------ */

const MAX_NOTE_CHARS = 1_500
const MAX_MATERIALS = 60

export async function gatherArticleMaterials(days = 7, now = new Date()): Promise<ArticleMaterial[]> {
  const since = new Date(now)
  since.setDate(now.getDate() - (days - 1))
  since.setHours(0, 0, 0, 0)
  const sinceLocal = localDateOf(since.toISOString())
  const today = todayLocal(now)
  const inRange = (iso: string) => {
    const d = localDateOf(iso)
    return d !== '' && d >= sinceLocal && d <= today
  }

  const [allNotes, allInsights] = await Promise.all([db.notes.toArray(), db.insights.toArray()])
  const out: ArticleMaterial[] = []
  for (const n of allNotes) {
    if (n.deletedAt || !inRange(n.createdAt)) continue
    out.push({
      id: n.id,
      kind: 'note',
      title: n.title || n.body.slice(0, 24),
      body: n.body.slice(0, MAX_NOTE_CHARS),
      createdAt: n.createdAt,
    })
  }
  for (const i of allInsights) {
    if (!inRange(i.createdAt)) continue
    out.push({ id: i.id, kind: 'insight', title: '洞察卡', body: i.text, createdAt: i.createdAt })
  }
  out.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return out.slice(0, MAX_MATERIALS)
}

/* ------------------------------ AI 提示词与解析 ------------------------------ */

export const ARTICLE_SYSTEM_PROMPT =
  '你是文章编辑，负责把原始素材整理成一篇结构清晰的文章草稿。只使用素材中出现的事实与观点，素材里没有的不要编造；语言平实，不用套话。只输出严格合法的 JSON，不要任何多余文字。'

export function buildArticleUserPrompt(days: number, materials: ArticleMaterial[]): string {
  const parts = materials.map((m, i) => {
    const body = m.body.length > MAX_NOTE_CHARS ? m.body.slice(0, MAX_NOTE_CHARS) + '（截断）' : m.body
    return `【素材${i + 1}｜${m.kind === 'note' ? '速记' : '洞察卡'}｜${m.title}】\n${body}`
  })
  return [
    `请把以下 ${days} 天内的素材整理成一篇可直接修改发布的文章草稿。`,
    '要求：',
    '1) title 是文章标题；intro 是开头段（交代这段时间做了什么、文章要讲什么，3 句以内）。',
    '2) sections 3-6 节，每节有 heading（小标题）和 body（成段文字，段落间用空行分隔）。',
    '3) 素材只是片段，允许把它们组织成连贯的叙述；但事实与数字必须来自素材，不足的地方写（此处待补充）。',
    '4) 只输出 JSON，格式：{"title":"...","intro":"...","sections":[{"heading":"...","body":"..."}]}',
    '',
    ...parts,
  ].join('\n')
}

/** 从 AI 返回文本中提取文章草稿（容忍代码块围栏与前后杂文字） */
export function parseArticle(text: string): ArticleDraft {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('AI 没有返回 JSON，请重试或改用手动骨架')
  const raw = text.slice(start, end + 1)
  const data = JSON.parse(raw) as Partial<ArticleDraft>
  if (!Array.isArray(data.sections) || data.sections.length === 0) throw new Error('AI 返回的草稿没有章节，请重试')
  const sections = data.sections
    .map((s) => ({ heading: String(s?.heading ?? '').trim(), body: String(s?.body ?? '') }))
    .filter((s) => s.heading)
  if (sections.length === 0) throw new Error('AI 返回的草稿没有有效章节，请重试')
  return {
    title: String(data.title ?? '').trim() || '未命名文章草稿',
    intro: String(data.intro ?? ''),
    sections,
  }
}

/* ------------------------------ 手动骨架与导出 ------------------------------ */

export function defaultArticleSkeleton(): ArticleDraft {
  return {
    title: '未命名文章草稿',
    intro: '（开头：这篇文章要讲什么、为什么写）',
    sections: [
      { heading: '一、背景', body: '（待填）' },
      { heading: '二、做了什么', body: '（待填）' },
      { heading: '三、学到了什么', body: '（待填）' },
      { heading: '四、接下来', body: '（待填）' },
    ],
  }
}

export function articleToMarkdown(draft: ArticleDraft): string {
  const L: string[] = [`# ${draft.title}`, '', draft.intro, '']
  for (const s of draft.sections) {
    L.push(`## ${s.heading}`, '', s.body, '')
  }
  L.push('---', '*PWORK 文章草稿*')
  return L.join('\n')
}
