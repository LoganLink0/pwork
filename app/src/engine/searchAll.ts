/**
 * 跨模块检索（C-4 落地，W5 处理模块起步；2026-10-29 升到正文级）：统一只读接口——
 * 命令面板与 AI 全库问答共用。命中范围：标题优先，正文类字段（速记 body、条目摘要
 * 与批注、洞察全文、任务执行意图）同样参与——存过的东西要找得回来；这也是 AI 问答
 * 上下文装配的同一套检索（10-23 回撤的"答非所问"根因就是上下文只有标题）。
 * 5 万条量级内全量扫描够用（毫秒级），不做全文索引。
 */
import { db } from '../db/schema'
import { todayLocal, fmtCompact } from './datetime'
import { GLOSSARY } from '../content/help'

export type SearchKind = 'note' | 'task' | 'item' | 'review' | 'insight' | 'term'

export interface SearchHit {
  kind: SearchKind
  id: string
  title: string
  sub: string
  to: string
  /** 命中发生在正文（标题未命中）时截取的上下文片段，供界面展示"为什么命中" */
  snippet?: string
}

export const KIND_LABEL: Record<SearchKind, string> = {
  note: '速记',
  task: '任务',
  item: '条目',
  review: '复盘',
  insight: '洞察',
  term: '术语',
}

/** 标题命中 → 命中；正文命中 → 命中并截取关键词前后各 20 字的片段 */
function hit(
  kind: SearchKind, id: string, title: string, sub: string, to: string,
  q: string, bodies: string[] = [],
): SearchHit | null {
  if (title.toLowerCase().includes(q)) return { kind, id, title: title.slice(0, 60), sub, to }
  for (const b of bodies) {
    const idx = b.toLowerCase().indexOf(q)
    if (idx >= 0) {
      const start = Math.max(0, idx - 20)
      return {
        kind, id, title: title.slice(0, 60), sub, to,
        snippet: `${start > 0 ? '…' : ''}${b.slice(start, idx + q.length + 20)}…`,
      }
    }
  }
  return null
}

/** 跨模块检索：q 为空返回空数组；各模块限 5 条 */
export async function searchAll(qRaw: string): Promise<SearchHit[]> {
  const q = qRaw.trim().toLowerCase()
  if (!q) return []
  const [notes, tasks, items, reviews, insights] = await Promise.all([
    db.notes.toArray(),
    db.tasks.toArray(),
    db.items.toArray(),
    db.reviews.toArray(),
    db.insights.toArray(),
  ])
  const today = todayLocal()
  const out: SearchHit[] = []

  for (const n of notes) {
    if (n.deletedAt) continue
    const h =
      hit('note', n.id, n.title || n.body.slice(0, 40), `${n.tags.map((t) => `#${t}`).join(' ') || '速记'}`, `/input/notes/${n.id}`, q, [n.body])
    if (h) out.push(h)
    if (out.filter((x) => x.kind === 'note').length >= 5) break
  }
  for (const t of tasks) {
    if (t.deletedAt || t.status === 'done' || t.status === 'dropped') continue
    const h = hit('task', t.id, t.title, t.due && t.due < today ? '已逾期' : (t.due ?? '待办'), '/tasks', q, t.ifThen ? [t.ifThen] : [])
    if (h) out.push(h)
    if (out.filter((x) => x.kind === 'task').length >= 5) break
  }
  for (const i of items) {
    if (i.deletedAt || i.stage === 'discarded') continue
    // 正文（G1 批回填的全文）参与命中——存过的东西要找得回来，摘要搜到不算搜到
    const h = hit('item', i.id, i.title, `${i.sourceName} · 入库 ${fmtCompact(i.fetchedAt)}`, '/input/items', q, [i.summary ?? '', i.annotation?.notes ?? '', i.content ?? ''])
    if (h) out.push(h)
    if (out.filter((x) => x.kind === 'item').length >= 5) break
  }
  // 术语表（2026-10-22 用户反馈"名词搜不到"）：词条与释义都可命中，跳到帮助页
  for (const g of GLOSSARY) {
    if (out.filter((x) => x.kind === 'term').length >= 5) break
    if (g.term.toLowerCase().includes(q) || g.def.toLowerCase().includes(q)) {
      out.push({ kind: 'term', id: `term:${g.term}`, title: g.term, sub: g.def.slice(0, 60), to: '/help' })
    }
  }
  for (const r of reviews) {
    const h = hit('review', r.id, r.title, r.status === 'archived' ? '已归档' : '进行中', `/review/archive/${r.id}`, q, r.summary ?? [])
    if (h) out.push(h)
    if (out.filter((x) => x.kind === 'review').length >= 5) break
  }
  for (const i of insights) {
    const h = hit('insight', i.id, i.text, '洞察卡', '/review/assets', q)
    if (h) out.push(h)
    if (out.filter((x) => x.kind === 'insight').length >= 5) break
  }
  return out
}

/**
 * 自然语言问句的检索词切分（2026-11-08）：searchAll 是整句子串匹配，AI 问答把
 * 自然语言长句整句丢进来永远零命中（正文里不可能存在完整问句子串）——这是
 * 「AI 问答真机验收」卡住的根因。此函数按标点与多字填充词把问句切成片段，
 * 再对 ≥2 字片段提取 2-gram 子串，得到一组检索词。不做真分词（backlog 13 的
 * FTS5+分词是性能与排序向的另一个触发项）；2-gram 在子串匹配下足够召回。
 */
export function askKeywords(question: string): string[] {
  let s = question.replace(/[？！。，、：；「」『』“”‘’（）<>《》\s]+/g, '|')
  const fillers = [
    '帮我', '请问', '一下', '现在', '最近', '之前', '之后', '哪些', '什么', '怎么', '如何',
    '为什么', '是不是', '有没有', '可以', '应该', '需要', '看看', '说说', '总结', '告诉',
    '关于', '这个', '那个', '这些', '或者', '并且', '如果', '那么', '以及',
  ]
  for (const w of fillers) s = s.split(w).join('|')
  const pieces = s.split('|').map((x) => x.trim()).filter((x) => x.length >= 2)
  const terms: string[] = []
  const seen = new Set<string>()
  for (const p of pieces) {
    for (let i = 0; i + 2 <= p.length; i++) {
      const gram = p.slice(i, i + 2)
      if (!seen.has(gram)) { seen.add(gram); terms.push(gram) }
    }
  }
  return terms
}

/**
 * 多词检索（AI 全库问答专用入口）：自然语言问句切词后逐词检索，命中合并——
 * 被越多词命中的实体排越前（更相关），同分保持词序。命令面板保持原 searchAll
 * （单词输入，行为零变化）。
 */
export async function searchMulti(qRaw: string): Promise<SearchHit[]> {
  const terms = askKeywords(qRaw)
  if (terms.length === 0) return searchAll(qRaw.trim())
  const results = await Promise.all(terms.map((t) => searchAll(t)))
  const order = new Map<string, number>()
  terms.forEach((t, i) => order.set(t.toLowerCase(), i))
  const merged = new Map<string, { h: SearchHit; words: Set<string> }>()
  for (let i = 0; i < results.length; i++) {
    const term = terms[i].toLowerCase()
    for (const h of results[i]) {
      const prev = merged.get(h.id)
      if (prev) prev.words.add(term)
      else merged.set(h.id, { h, words: new Set([term]) })
    }
  }
  return Array.from(merged.values())
    .sort((a, b) => b.words.size - a.words.size || Math.min(...Array.from(a.words).map((w) => order.get(w) ?? 99)) - Math.min(...Array.from(b.words).map((w) => order.get(w) ?? 99)))
    .map((x) => x.h)
}
