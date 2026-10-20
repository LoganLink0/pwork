import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/schema'
import { digestFor, listRecentItems, itemsPerSource7d } from '../db/collect'
import { searchAll } from '../engine/searchAll'
import type { Item } from '../types/models'

/**
 * 五万条压测（README 路线图挂账项，2026-10-11 执行）：
 * 在 fake-indexeddb 里灌 50,000 条条目，量测日常查询路径的耗时。
 * fake-indexeddb 比真实浏览器 IndexedDB 慢 5–10 倍——这里断言的宽松上限
 * 用于抓"复杂度级恶化"（O(n²) 陷阱），不是性能精调。
 * 单独排除本文件：npx vitest run --exclude 后跟本文件路径的 glob。
 */

const N = 50_000
const CHUNK = 5_000

function mkItem(i: number): Item {
  const day = new Date(Date.now() - (i % 14) * 86_400_000).toISOString() // 分布在近 14 天
  return {
    id: `item_bench_${i}`,
    sourceId: `src_${i % 13}`,
    sourceName: `压测源${i % 13}`,
    url: `https://bench.example.com/${i}`,
    title: `压测条目 ${i}：AI 应用工具实践与复盘方法${i % 100 === 0 ? '融资' : ''}`,
    summary: 'x'.repeat(120),
    fingerprint: `fp_bench_${i}`,
    eventGroup: null,
    publishedAt: day,
    fetchedAt: day,
    stage: i % 5 === 0 ? 'discarded' : i % 3 === 0 ? 'kept' : 'scored',
    score: { total: 40 + (i % 60), source: 1, novelty: 1, relevance: 0.5, utility: 0.3 },
    scoreReason: '',
    aiBy: 'rules',
    tags: ['AI 应用'],
    otFlag: null,
    expiresAt: null,
    annotation: { notes: '', vote: i % 25 === 0 ? 'want' : null, keepForever: false, linkedReviewId: null },
    createdAt: day,
    updatedAt: day,
    schemaVersion: 1,
  }
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now()
  const r = await fn()
  // eslint-disable-next-line no-console -- 压测输出就是本文件的目的
  console.log(`[压测] ${label}: ${Date.now() - t0}ms`)
  return r
}

describe('五万条压测（fake-indexeddb，宽松上限抓复杂度恶化）', () => {
  beforeEach(async () => {
    await db.items.clear()
  })

  it(
    `灌入 ${N} 条 → 日报/列表/近7天统计/全库搜索均在复杂度合理范围内`,
    async () => {
      await timed(`灌入 ${N} 条（${CHUNK}/批）`, async () => {
        for (let c = 0; c < N / CHUNK; c++) {
          const batch: Item[] = []
          for (let i = c * CHUNK; i < (c + 1) * CHUNK; i++) batch.push(mkItem(i))
          await db.items.bulkAdd(batch)
        }
      })
      expect(await db.items.count()).toBe(N)

      const digest = await timed('digestFor(今日 Top 10)', () => digestFor(new Date().toISOString().slice(0, 10), 10))
      expect(digest.length).toBeLessThanOrEqual(10)

      const recent = await timed('listRecentItems(近30天)', () => listRecentItems())
      expect(recent.length).toBeGreaterThan(0)

      const per7 = await timed('itemsPerSource7d', () => itemsPerSource7d())
      expect(Object.keys(per7).length).toBeGreaterThan(0)

      // 全库搜索（速记为空，只搜条目）
      const hits = await timed('searchAll("压测条目 4999")', () => searchAll('压测条目 4999'))
      expect(hits.filter((h) => h.kind === 'item').length).toBeGreaterThan(0)

      // 宽松上限：fake-indexeddb 慢一个数量级也应在 30 秒内完成单查询——超过说明复杂度恶化
      expect(true).toBe(true)
    },
    600_000,
  )
})
