/**
 * 跨模块检索（C-4 落地，W5 处理模块起步）：统一只读接口——
 * 命令面板与 /process 页共用；只查标题类字段，不做全文索引（5 万条量级内够用）。
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
}

export const KIND_LABEL: Record<SearchKind, string> = {
  note: '速记',
  task: '任务',
  item: '条目',
  review: '复盘',
  insight: '洞察',
  term: '术语',
}

function hit(kind: SearchKind, id: string, title: string, sub: string, to: string, q: string): SearchHit | null {
  if (!title.toLowerCase().includes(q)) return null
  return { kind, id, title: title.slice(0, 60), sub, to }
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
      hit('note', n.id, n.title || n.body.slice(0, 40), `${n.tags.map((t) => `#${t}`).join(' ') || '速记'}`, `/input/notes/${n.id}`, q)
    if (h) out.push(h)
    if (out.filter((x) => x.kind === 'note').length >= 5) break
  }
  for (const t of tasks) {
    if (t.deletedAt || t.status === 'done' || t.status === 'dropped') continue
    const h = hit('task', t.id, t.title, t.due && t.due < today ? '已逾期' : (t.due ?? '待办'), '/tasks', q)
    if (h) out.push(h)
    if (out.filter((x) => x.kind === 'task').length >= 5) break
  }
  for (const i of items) {
    if (i.deletedAt || i.stage === 'discarded') continue
    const h = hit('item', i.id, i.title, `${i.sourceName} · 入库 ${fmtCompact(i.fetchedAt)}`, '/input/items', q)
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
    const h = hit('review', r.id, r.title, r.status === 'archived' ? '已归档' : '进行中', `/review/archive/${r.id}`, q)
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
