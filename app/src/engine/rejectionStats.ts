/**
 * 筛除原因聚合（2026-10-20，控制论"系统辨识"落地）：已筛除条目每条都带拒绝理由
 * （scoreReason），但没有去无回——聚合出"哪类原因最多、哪个屏蔽词杀得最多、哪个源
 * 独占垃圾产量"，让前馈（调源/调词）有依据，而不是凭感觉。
 *
 * 理由归一：本地前缀"预筛拒绝："剥掉；「命中屏蔽词「X」」归并为"命中屏蔽词"类
 * 并统计词频（X 才是要调的东西）；其余理由按原文分桶（AI 筛选理由是短自由文本）。
 */
import type { Item } from '../types/models'

export interface RejectionBucket {
  reason: string
  count: number
  /** 命中屏蔽词类的词频冠军（其他类为空） */
  topWord: { word: string; count: number } | null
}

export interface RejectionStats {
  total: number
  byReason: RejectionBucket[]
  /** 筛除量最大的信源（占比过半时页面会提示处理） */
  topSource: { name: string; count: number; share: number } | null
}

export function rejectionStats(items: Item[], days = 30): RejectionStats | null {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const rows = items.filter((i) => !i.deletedAt && i.stage === 'discarded' && (i.fetchedAt ?? '') >= since)
  if (rows.length === 0) return null

  const reasons = new Map<string, { count: number; words: Map<string, number> }>()
  const sources = new Map<string, { name: string; count: number }>()
  for (const i of rows) {
    const raw = (i.scoreReason || '').replace(/^预筛拒绝：/, '').trim() || '未记录原因'
    let key = raw
    let word: string | null = null
    const m = raw.match(/^命中屏蔽词「(.+?)」$/)
    if (m) {
      key = '命中屏蔽词'
      word = m[1] ?? null
    }
    const b = reasons.get(key) ?? { count: 0, words: new Map<string, number>() }
    b.count += 1
    if (word) b.words.set(word, (b.words.get(word) ?? 0) + 1)
    reasons.set(key, b)

    const s = sources.get(i.sourceId) ?? { name: i.sourceName, count: 0 }
    s.count += 1
    sources.set(i.sourceId, s)
  }

  const byReason: RejectionBucket[] = [...reasons.entries()]
    .map(([reason, b]) => {
      let topWord: { word: string; count: number } | null = null
      for (const [word, count] of b.words) {
        if (!topWord || count > topWord.count) topWord = { word, count }
      }
      return { reason, count: b.count, topWord }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  let topSource: RejectionStats['topSource'] = null
  for (const s of sources.values()) {
    if (!topSource || s.count > topSource.count) {
      topSource = { name: s.name, count: s.count, share: s.count / rows.length }
    }
  }

  return { total: rows.length, byReason, topSource }
}
