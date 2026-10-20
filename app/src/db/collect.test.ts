import { describe, expect, it } from 'vitest'
import {
  cleanupExpired,
  createSource,
  deleteSource,
  digestDates,
  digestFor,
  findItemByFingerprint,
  findSourceByUrl,
  importSources,
  listActiveSources,
  listAllSources,
  markKept,
  markSourceFail,
  markSourceOk,
  mapStarsToVote,
  normalizeItem,
  putItem,
  updateAnnotation,
  updateSource,
} from './collect'
import { newId } from './repo'
import type { Item, Source } from '../types/models'
import { todayLocal } from '../engine/datetime'

async function seedSource(name = '测试源', url = 'https://a.com/rss'): Promise<Source> {
  return createSource({ name, url, domain: 'ai', tier: 1 })
}

function mkItem(over: Partial<Item> = {}): Item {
  const now = new Date().toISOString()
  return {
    id: newId('itm'),
    sourceId: 'src_x',
    sourceName: '测试源',
    url: 'https://a.com/x',
    title: '标题足够长的条目',
    summary: '摘要',
    fingerprint: newId('fp'),
    eventGroup: null,
    publishedAt: null,
    fetchedAt: now,
    stage: 'scored',
    score: { total: 70, source: 1, novelty: 1, relevance: 0.5, utility: 0.3 },
    scoreReason: '源1.0·新信息',
    aiBy: 'rules',
    tags: [],
    otFlag: null,
    expiresAt: null,
    annotation: { notes: '', vote: null, keepForever: false, linkedReviewId: null },
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
    ...over,
  }
}

describe('信源 CRUD 与 health', () => {
  it('tier → 默认权重映射；列表按 tier 排序', async () => {
    await seedSource('T1 源')
    await createSource({ name: 'T2 源', url: 'https://b.com/rss', domain: 'ai', tier: 2 })
    const list = await listAllSources()
    expect(list[0]!.name).toBe('T1 源')
    expect(list[0]!.weight).toBe(1.0)
    expect(list[1]!.weight).toBe(0.4)
    expect(await listActiveSources()).toHaveLength(2)
  })

  it('失败计数：failStreak≥3 自动停用并置 inactive；成功重置', async () => {
    const s = await seedSource()
    expect(await markSourceFail(s.id, 'HTTP 500')).toBe(false)
    expect(await markSourceFail(s.id, 'HTTP 500')).toBe(false)
    expect(await markSourceFail(s.id, 'HTTP 500')).toBe(true) // 第三次触发自动停用
    const stopped = (await listAllSources()).find((x) => x.id === s.id)!
    expect(stopped.active).toBe(false)
    expect(stopped.health.failStreak).toBe(3)
    expect(stopped.health.lastError).toContain('HTTP')

    await markSourceOk(s.id)
    const ok = (await listAllSources()).find((x) => x.id === s.id)!
    expect(ok.health.failStreak).toBe(0)
    expect(ok.active).toBe(false) // 自动停用不因成功而自动恢复——需人工重新启用
  })

  it('updateSource / deleteSource（软删除）', async () => {
    const s = await seedSource()
    await updateSource(s.id, { tier: 2 })
    expect((await listAllSources()).find((x) => x.id === s.id)!.tier).toBe(2)
    await deleteSource(s.id)
    expect(await listAllSources()).toHaveLength(0)
  })

  it('importSources：按 URL 去重、缺字段跳过', async () => {
    await seedSource('已有源', 'https://a.com/rss')
    const r = await importSources([
      { name: '已有源', url: 'https://a.com/rss' }, // 重复
      { name: '新源', url: 'https://c.com/rss', domain: 'ai', tier: 1 },
      { name: '', url: 'https://d.com/rss' }, // 缺名
      { url: 'https://e.com/rss' }, // 缺名
    ])
    expect(r).toEqual({ imported: 1, skipped: 3 })
    expect(await findSourceByUrl('https://c.com/rss')).toBeTruthy()
  })
})

describe('条目：去重 / Digest / 标注 / kept', () => {
  it('findItemByFingerprint 命中', async () => {
    const it = mkItem()
    await putItem(it)
    expect((await findItemByFingerprint(it.fingerprint))?.id).toBe(it.id)
  })

  it('digestFor：按本地日过滤 + 分数排序 + Top N 硬顶', async () => {
    const today = todayLocal()
    await putItem(mkItem({ score: { total: 55, source: 0, novelty: 0, relevance: 0, utility: 0 } }))
    await putItem(mkItem({ score: { total: 90, source: 0, novelty: 0, relevance: 0, utility: 0 } }))
    await putItem(mkItem({ score: { total: 75, source: 0, novelty: 0, relevance: 0, utility: 0 } }))
    await putItem(mkItem({ stage: 'discarded', fetchedAt: `${today}T08:00:00.000Z` })) // 筛除不进 Digest
    await putItem(mkItem({ fetchedAt: '2020-01-01T00:00:00.000Z' })) // 别的日期
    const d = await digestFor(today, 2)
    expect(d.map((i) => i.score.total)).toEqual([90, 75])
    // digestDates 只收 scored/kept 的日期（2020 那条是 scored，合法出现）
    expect(await digestDates()).toEqual([today, '2020-01-01'])
  })

  it('markKept：scored → kept；已是 kept/discarded 不变', async () => {
    const a = mkItem()
    const b = mkItem({ stage: 'kept' })
    await putItem(a)
    await putItem(b)
    await markKept([a.id, b.id])
    const items = await digestFor(todayLocal(), 10)
    expect(items.find((i) => i.id === a.id)!.stage).toBe('kept')
    expect(items.find((i) => i.id === b.id)!.stage).toBe('kept')
  })

  it('updateAnnotation：「想要」投票/批注使 scored 升 kept；otFlag 可写', async () => {
    const a = mkItem()
    await putItem(a)
    await updateAnnotation(a.id, { vote: 'want', otFlag: 'opportunity' })
    const got = (await digestFor(todayLocal(), 10)).find((i) => i.id === a.id)!
    expect(got.stage).toBe('kept')
    expect(got.annotation.vote).toBe('want')
    expect(got.otFlag).toBe('opportunity')
  })
})

describe('TTL 清理（铁律 3：只清过 TTL 且无标注的 raw/discarded）', () => {
  it('过期 discarded 清理；有投票/keepForever/scored 的豁免', async () => {
    const past = new Date(Date.now() - 15 * 86_400_000).toISOString()
    const doomed = mkItem({ stage: 'discarded', expiresAt: past })
    const voted = mkItem({ stage: 'discarded', expiresAt: past, annotation: { notes: '', vote: 'meh', keepForever: false, linkedReviewId: null } })
    const forever = mkItem({ stage: 'discarded', expiresAt: past, annotation: { notes: '', vote: null, keepForever: true, linkedReviewId: null } })
    const notExpired = mkItem({ stage: 'discarded', expiresAt: new Date(Date.now() + 86_400_000).toISOString() })
    const scored = mkItem({ stage: 'scored', expiresAt: past })
    for (const i of [doomed, voted, forever, notExpired, scored]) await putItem(i)

    const n = await cleanupExpired()
    expect(n).toBe(1)
    expect(await findItemByFingerprint(doomed.fingerprint)).toBeUndefined()
    for (const i of [voted, forever, notExpired, scored]) {
      expect(await findItemByFingerprint(i.fingerprint)).toBeTruthy()
    }
  })
})

describe('旧 5 星数据迁移（2026-10-20：三档投票替代 5 星，读取时惰性映射）', () => {
  it('mapStarsToVote：4–5→want，2–3→meh，1→no，0/无→未投', () => {
    expect(mapStarsToVote(5)).toBe('want')
    expect(mapStarsToVote(4)).toBe('want')
    expect(mapStarsToVote(3)).toBe('meh')
    expect(mapStarsToVote(2)).toBe('meh')
    expect(mapStarsToVote(1)).toBe('no')
    expect(mapStarsToVote(0)).toBeNull()
    expect(mapStarsToVote(undefined)).toBeNull()
  })

  it('normalizeItem 对带旧 stars 字段的记录完成迁移；新 vote 字段优先', () => {
    const legacy = { ...mkItem(), annotation: { notes: '旧批注', stars: 4, keepForever: false, linkedReviewId: null } as unknown as Item['annotation'] }
    expect(normalizeItem(legacy).annotation.vote).toBe('want')
    expect(normalizeItem(legacy).annotation.notes).toBe('旧批注')
    const modern = mkItem({ annotation: { notes: '', vote: 'no', keepForever: false, linkedReviewId: null } })
    expect(normalizeItem(modern).annotation.vote).toBe('no')
  })
})
