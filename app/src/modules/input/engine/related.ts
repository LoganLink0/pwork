/**
 * 轻量词法关联（2026-11-15 外部研读报告改动 4）：记速记时展示"相关的旧内容"。
 * 设计（报告 §4.6 核实结论）：searchAll 的 askKeywords 已建成切词（标点切分 + 停用词
 * + 中文 2-gram），关联引擎作为 RelatedProvider 接口的第一个实现——将来嵌入索引
 * （backlog）作为第二个 Provider 接入，排序混合在接口层完成。
 * 计分纪律：至少 2 个不同词命中才入选（防中文 2-gram 假关联）；按候选文档长度归一
 * （长文不吃词多便宜）；why 保留命中依据（可解释，与 rules.ts 评分同哲学）。
 * 性能：5 万条内全量扫描毫秒级（searchAll 同源结论）；调用方 debounce 即可，无需 Worker。
 */
import { askKeywords } from '../../../engine/searchAll'
import type { Note } from '../../../types/models'

export interface Scored {
  id: string
  score: number
  /** 命中依据（展示用）：命中的词 */
  why: string[]
}

/** 关联引擎接口：词法版为第一实现；嵌入索引将来作为第二实现接入 */
export interface RelatedProvider {
  readonly id: 'lexical'
  related(query: string, items: RelatedItem[], limit: number): Scored[]
}

export interface RelatedItem {
  id: string
  title: string
  body: string
  tags: string[]
}

const TITLE_WEIGHT = 3
const TAG_WEIGHT = 4
const BODY_WEIGHT = 1
/** 至少命中多少个不同词才入选：2-gram 单词命中太容易，双词起步防假关联 */
const MIN_DISTINCT_HITS = 2

function toItems(notes: Note[]): RelatedItem[] {
  return notes.map((n) => ({ id: n.id, title: n.title, body: n.body, tags: n.tags }))
}

export class LexicalRelated implements RelatedProvider {
  readonly id = 'lexical' as const

  related(query: string, items: RelatedItem[], limit: number): Scored[] {
    const words = askKeywords(query)
    if (words.length === 0) return []
    const wordSet = new Set(words)
    const scored: Scored[] = []
    for (const it of items) {
      const why = new Set<string>()
      let raw = 0
      // 标题：整词包含即算命中（标题短，权重高）
      for (const w of wordSet) {
        if (it.title.includes(w)) {
          why.add(w)
          raw += TITLE_WEIGHT
        }
      }
      // 标签：词是标签的子串（标签短，"产品"命中标签"产品经理"）；每个标签只记一次分，命中词都进 why
      for (const t of it.tags) {
        let hit = false
        for (const w of wordSet) {
          if (t.includes(w)) {
            why.add(w)
            hit = true
          }
        }
        if (hit) raw += TAG_WEIGHT
      }
      // 正文：整词包含
      for (const w of wordSet) {
        if (it.body.includes(w)) {
          if (!why.has(w)) why.add(w)
          raw += BODY_WEIGHT
        }
      }
      if (why.size < MIN_DISTINCT_HITS) continue
      // 按候选文档长度归一：长文命中多不占便宜（body 长度 + 词表长度平滑）
      const norm = raw / (1 + (it.title.length + it.body.length) / 400)
      scored.push({ id: it.id, score: Math.round(norm * 100) / 100, why: Array.from(why) })
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, Math.max(0, limit))
  }
}

let provider: RelatedProvider | null = null

export function getRelatedProvider(): RelatedProvider {
  if (!provider) provider = new LexicalRelated()
  return provider
}

/** 速记专用入口：排除自身，返回带理由的相关旧速记 */
export function relatedNotes(current: Note, pool: Note[], limit = 3): Array<Scored & { note: Note }> {
  const items = toItems(pool.filter((n) => n.id !== current.id && !n.deletedAt))
  const hits = getRelatedProvider().related(`${current.title}\n${current.body}`, items, limit)
  const byId = new Map(items.map((i) => [i.id, i]))
  return hits
    .map((h) => {
      const it = byId.get(h.id)
      return it ? { ...h, note: pool.find((n) => n.id === h.id)! } : null
    })
    .filter((x): x is Scored & { note: Note } => x !== null)
}
