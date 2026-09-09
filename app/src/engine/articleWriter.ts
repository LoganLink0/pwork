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
  /** 提示词里的来源叫法（如"外部材料"）；默认按 kind 显示 */
  sourceLabel?: string
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

/** 分析视角：同一批材料，换视角 = 换一种整理方式（调研对象工作台用） */
export interface ArticleView {
  id: 'free' | 'company-profile' | 'resume-tailoring'
  name: string
  /** 追加到 AI 提示词的视角说明 */
  guide: string
  /** 手动骨架（无 AI 时） */
  skeleton: () => ArticleDraft
}

export const ARTICLE_VIEWS: ArticleView[] = [
  {
    id: 'free',
    name: '自由整理',
    guide: '把素材组织成一篇连贯的文章：有开头、分小节、有收尾。',
    skeleton: () => defaultArticleSkeleton(),
  },
  {
    id: 'company-profile',
    name: '企业调研速览',
    guide:
      '按售前调研视角整理：说清对方是做什么的、商业逻辑（靠什么赚钱）、业务痛点、行业地位与趋势，最后落到合作或切入建议。',
    skeleton: () => ({
      title: '企业调研速览',
      intro: '（开头：调研对象、目的、信息来源说明）',
      sections: [
        { heading: '一、公司与主体信息', body: '（待填：成立 / 注册资本 / 所在地 / 经营状态）' },
        { heading: '二、业务线与商业逻辑', body: '（待填：主要业务线；靠什么赚钱）' },
        { heading: '三、业务痛点', body: '（待填：行业共性痛点；这家公司的具体痛点）' },
        { heading: '四、行业地位与趋势', body: '（待填：所处位置；趋势判断）' },
        { heading: '五、合作或切入建议', body: '（待填）' },
      ],
    }),
  },
  {
    id: 'resume-tailoring',
    name: '简历定制建议',
    guide:
      '这份分析用于帮助求职者定制简历：先解读目标公司与岗位真正看重什么（关键词、能力、经历类型），再对照素材中的现有简历逐条给出修改建议（哪段经历前置、补什么关键词、删什么）。给客户看的措辞要正式、可直接采用。',
    skeleton: () => ({
      title: '简历定制建议',
      intro: '（开头：目标公司与岗位、客户情况概述）',
      sections: [
        { heading: '一、目标公司与岗位解读', body: '（待填：公司做什么、怎么赚钱；这个岗位为什么招人）' },
        { heading: '二、雇主看重什么', body: '（待填：关键词与能力要求；行业语言）' },
        { heading: '三、现简历对照结论', body: '（待填：匹配点；差距点）' },
        { heading: '四、修改建议（逐条）', body: '（待填：哪段经历前置；补什么关键词；删什么）' },
        { heading: '五、面试预判', body: '（待填：可能被问到的公司与行业问题）' },
      ],
    }),
  },
]

export function getArticleView(id: string): ArticleView {
  return ARTICLE_VIEWS.find((v) => v.id === id) ?? ARTICLE_VIEWS[0]!
}

export const ARTICLE_SYSTEM_PROMPT =
  '你是文章编辑，负责把原始素材整理成一篇结构清晰的文章草稿。只使用素材中出现的事实与观点，素材里没有的不要编造；语言平实，不用套话。只输出严格合法的 JSON，不要任何多余文字。'

export function buildArticleUserPrompt(opts: {
  /** 素材的时间范围（按周期聚合时传；按对象聚合时不传） */
  days?: number
  materials: ArticleMaterial[]
  view?: ArticleView
  /** 材料来源说明（如调研对象名） */
  scopeLabel?: string
}): string {
  const { days, materials, view = ARTICLE_VIEWS[0]!, scopeLabel } = opts
  const parts = materials.map((m, i) => {
    const body = m.body.length > MAX_NOTE_CHARS ? m.body.slice(0, MAX_NOTE_CHARS) + '（截断）' : m.body
    const kindLabel = m.kind === 'insight' ? '洞察卡' : (m.sourceLabel ?? '速记')
    return `【素材${i + 1}｜${kindLabel}｜${m.title}】\n${body}`
  })
  const scopeLine = scopeLabel
    ? `请把调研对象「${scopeLabel}」的以下材料整理成一份分析草稿。`
    : `请把以下 ${days} 天内的素材整理成一篇可直接修改发布的文章草稿。`
  return [
    scopeLine,
    `整理视角：${view.guide}`,
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

/** 导出 Word（.docx）：给客户的交付物形态。懒加载 docx 库，返回文件名 */
export async function exportArticleDocx(draft: ArticleDraft): Promise<string> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx')
  const para = (text: string, opts: { bold?: boolean; size?: number; heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel] } = {}) =>
    new Paragraph({
      ...(opts.heading ? { heading: opts.heading } : {}),
      alignment: opts.heading === HeadingLevel.TITLE ? AlignmentType.CENTER : undefined,
      children: [new TextRun({ text, bold: opts.bold, size: opts.size })],
    })
  const children = [
    para(draft.title, { heading: HeadingLevel.TITLE, bold: true }),
    para(draft.intro),
    ...draft.sections.flatMap((s) => [para(s.heading, { heading: HeadingLevel.HEADING_1, bold: true }), para(s.body)]),
    para('PWORK 文章草稿', { size: 18 }),
  ]
  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  const safe = draft.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || '文章草稿'
  const filename = `PWORK-文档-${safe}.docx`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return filename
}
