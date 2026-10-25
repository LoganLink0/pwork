/**
 * 采集域数据访问层（与速记 repo 分文件——模块边界）。
 * 治理（04 §3.4）：raw/discarded TTL 14 天不备份；scored/kept 为 Curated 随备份；
 * 标注（annotation 非空 / keepForever）永久保留。
 */
import { db } from './schema'
import { newId } from './repo'
import type { Item, Source } from '../types/models'
import { TIER_WEIGHT } from '../content/collect'
import { localDateOf } from '../engine/datetime'

export const SOURCE_SCHEMA_VERSION = 1
export const ITEM_SCHEMA_VERSION = 1
export const TTL_DAYS = 14

/* ------------------------------ 信源 ------------------------------ */

export interface SourceInput {
  name: string
  url: string
  domain: string
  tier: 1 | 1.5 | 2
  weight?: number
  checkEvery?: '6h' | 'daily' | 'weekly'
}

export async function createSource(input: SourceInput): Promise<Source> {
  const now = new Date().toISOString()
  const source: Source = {
    id: newId('src'),
    name: input.name.trim(),
    kind: 'rss',
    url: input.url.trim(),
    domain: input.domain,
    tier: input.tier,
    weight: input.weight ?? TIER_WEIGHT[input.tier] ?? 0.4,
    checkEvery: input.checkEvery ?? 'daily',
    active: true,
    health: { failStreak: 0, lastOkAt: null, lastError: null },
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    schemaVersion: SOURCE_SCHEMA_VERSION,
  }
  await db.sources.put(source)
  return source
}

/** 按 URL 查重（导入去重用） */
export async function findSourceByUrl(url: string): Promise<Source | undefined> {
  return db.sources.where('url').equals(url.trim()).first()
}

export async function listActiveSources(): Promise<Source[]> {
  const all = await db.sources.toArray()
  return all
    .filter((s) => s.active && s.deletedAt === null)
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))
}

/** 全部信源（含停用，管理页用） */
export async function listAllSources(): Promise<Source[]> {
  const all = await db.sources.toArray()
  return all
    .filter((s) => s.deletedAt === null).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))
}

export async function updateSource(id: string, patch: Partial<SourceInput> & { active?: boolean }): Promise<void> {
  const s = await db.sources.get(id)
  if (!s) return
  await db.sources.put({
    ...s,
    name: patch.name?.trim() ?? s.name,
    url: patch.url?.trim() ?? s.url,
    domain: patch.domain ?? s.domain,
    tier: patch.tier ?? s.tier,
    weight: patch.weight ?? (patch.tier ? TIER_WEIGHT[patch.tier] : s.weight),
    checkEvery: patch.checkEvery ?? s.checkEvery,
    active: patch.active ?? s.active,
    updatedAt: new Date().toISOString(),
  })
}

/** 条目软删除（铁律 3）：所有列表/日报/报告即刻过滤，TTL 清理时物理移除 */
export async function softDeleteItem(id: string): Promise<void> {
  const raw = await db.items.get(id)
  if (!raw || raw.deletedAt) return
  await db.items.put({ ...normalizeItem(raw), deletedAt: new Date().toISOString() })
}

/** 信源软删除（铁律 3） */
export async function deleteSource(id: string): Promise<void> {
  const s = await db.sources.get(id)
  if (!s || s.deletedAt) return
  await db.sources.put({ ...s, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
}

/** 抓取成功：重置 failStreak */
export async function markSourceOk(id: string): Promise<void> {
  const s = await db.sources.get(id)
  if (!s) return
  await db.sources.put({
    ...s,
    health: { failStreak: 0, lastOkAt: new Date().toISOString(), lastError: null },
    updatedAt: new Date().toISOString(),
  })
}

/** 抓取失败：failStreak++；≥3 自动停用（04 §3.1 死源治理）。返回是否触发自动停用 */
export async function markSourceFail(id: string, error: string): Promise<boolean> {
  const s = await db.sources.get(id)
  if (!s) return false
  const failStreak = s.health.failStreak + 1
  const autoStop = failStreak >= 3 && s.active
  await db.sources.put({
    ...s,
    active: autoStop ? false : s.active,
    health: { failStreak, lastOkAt: s.health.lastOkAt, lastError: error.slice(0, 80) },
    updatedAt: new Date().toISOString(),
  })
  return autoStop
}

/** 信源 JSON 导入（按 URL 去重，返回 {导入, 跳过}） */
export async function importSources(
  list: { name?: string; url?: string; domain?: string; tier?: number }[],
): Promise<{ imported: number; skipped: number }> {
  let imported = 0
  let skipped = 0
  for (const raw of list) {
    const url = raw.url?.trim()
    const name = raw.name?.trim()
    if (!url || !name) {
      skipped++
      continue
    }
    if (await findSourceByUrl(url)) {
      skipped++
      continue
    }
    const tier = raw.tier === 1 || raw.tier === 1.5 || raw.tier === 2 ? raw.tier : 2
    await createSource({ name, url, domain: raw.domain ?? 'other', tier })
    imported++
  }
  return { imported, skipped }
}

/** 信源 JSON 导出（管理页独立的信源清单交换，非备份包裹） */
export async function exportSourcesJson(): Promise<string> {
  const sources = await listAllSources()
  return JSON.stringify(
    sources.map((s) => ({ name: s.name, url: s.url, domain: s.domain, tier: s.tier, checkEvery: s.checkEvery })),
    null,
    2,
  )
}

/* ------------------------------ 条目 ------------------------------ */

export async function putItem(item: Item): Promise<void> {
  await db.items.put(item)
}

export async function getItem(id: string): Promise<Item | undefined> {
  const raw = await db.items.get(id)
  return raw ? normalizeItem(raw) : undefined
}

export async function findItemByFingerprint(fp: string): Promise<Item | undefined> {
  return db.items.where('fingerprint').equals(fp).first()
}

/** 近 N 天全部条目（条目库视图，updatedAt 倒序） */
export async function listRecentItems(days = 30): Promise<Item[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const all = await db.items.where('fetchedAt').above(since).toArray()
  return all
    .filter((i) => !i.deletedAt)
    .map(normalizeItem)
    .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))
}

/** 读取防御（铁律 2）：旧数据可能缺 annotation/score 细分 */
/** 旧 5 星 → 三档投票的一次性映射（读取时惰性迁移，写回后 stars 字段自然消亡） */
export function mapStarsToVote(stars: number | undefined | null): 'want' | 'meh' | 'no' | null {
  if (!stars || stars <= 0) return null
  if (stars >= 4) return 'want'
  if (stars >= 2) return 'meh'
  return 'no'
}

export function normalizeItem(raw: Item): Item {
  return {
    ...raw,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    otFlag: raw.otFlag ?? null,
    eventGroup: raw.eventGroup ?? null,
    expiresAt: raw.expiresAt ?? null,
    deletedAt: raw.deletedAt ?? undefined,
    annotation: {
      notes: raw.annotation?.notes ?? '',
      vote: raw.annotation?.vote ?? mapStarsToVote((raw.annotation as { stars?: number } | undefined)?.stars),
      keepForever: raw.annotation?.keepForever ?? false,
      linkedReviewId: raw.annotation?.linkedReviewId ?? null,
    },
    score: raw.score ?? { total: 0, source: 0, novelty: 0, relevance: 0, utility: 0 },
    scoreReason: raw.scoreReason ?? '',
    aiBy: 'rules',
    schemaVersion: raw.schemaVersion ?? ITEM_SCHEMA_VERSION,
  }
}

/** 今日 Digest（04 §4 ⑤ 分发：Top N 硬顶；无未读数） */
export async function digestFor(dateLocal: string, topN: number): Promise<Item[]> {
  const dayItems = await itemsOfLocalDay(dateLocal)
  return dayItems
    .filter((i) => i.stage === 'scored' || i.stage === 'kept')
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, topN)
}

/** 某本地日的全部条目（fetchedAt 本地日匹配） */
export async function itemsOfLocalDay(dateLocal: string): Promise<Item[]> {
  const all = await db.items.toArray()
  return all
    .filter((i) => !i.deletedAt && localDateOf(i.fetchedAt) === dateLocal)
    .map(normalizeItem)
}

/** 有条目的日期列表（倒序，历史 Digest 切换用） */
export async function digestDates(): Promise<string[]> {
  const all = await db.items.toArray()
  const dates = new Set(
    all.filter((i) => !i.deletedAt && (i.stage === 'scored' || i.stage === 'kept')).map((i) => localDateOf(i.fetchedAt)),
  )
  return [...dates].sort().reverse()
}

/** 标注更新（投票/批注/keepForever/otFlag 手动标记）。
 *  get+put 包在同一个读写事务里：IndexedDB 事务按库串行，读-改-写原子化——
 *  否则两个快速操作（如投票与批注同时落盘）在 await 让出后可能用旧读互相覆盖。 */
export async function updateAnnotation(
  id: string,
  patch: Partial<Item['annotation']> & { otFlag?: Item['otFlag'] },
): Promise<void> {
  await db.transaction('rw', db.items, async () => {
    const raw = await db.items.get(id)
    if (!raw) return
    const item = normalizeItem(raw)
    await db.items.put({
      ...item,
      annotation: { ...item.annotation, ...patch },
      otFlag: patch.otFlag !== undefined ? patch.otFlag : item.otFlag,
      // 「多推」投票 = 明确的价值信号 → 升 kept（Curated，随备份）；没想好/少推留在 scored 参与统计
      stage: item.stage === 'scored' && ((patch.notes ?? '') !== '' || patch.vote === 'want' || patch.keepForever) ? 'kept' : item.stage,
      updatedAt: new Date().toISOString(),
    })
  })
}

/** 将进 Top N 的条目标记 kept（04 §3.2 状态机：scored --进TopN--> kept） */
export async function markKept(ids: string[]): Promise<void> {
  await db.transaction('rw', db.items, async () => {
    for (const id of ids) {
      const raw = await db.items.get(id)
      if (raw && raw.stage === 'scored') {
        await db.items.put({ ...raw, stage: 'kept' })
      }
    }
  })
}

/**
 * TTL 物理清理（铁律 3：只清"已过 TTL 且无标注"的 raw/discarded 层）。
 * 打开应用时后台跑一次。返回清理条数。
 */
export const DELETE_GRACE_DAYS = 14

export async function cleanupExpired(now = new Date()): Promise<number> {
  const nowMs = now.getTime()
  const all = await db.items.toArray()
  const doomed = all.filter((i) => {
    // 已软删除的条目：任意 stage，删除满 14 天后悔期才物理移除（页面文案与备份口径都按 14 天承诺）
    if (i.deletedAt) return nowMs > new Date(i.deletedAt).getTime() + DELETE_GRACE_DAYS * 86_400_000
    if (i.stage !== 'raw' && i.stage !== 'discarded') return false
    if (!i.expiresAt || i.expiresAt >= now.toISOString()) return false
    const a = i.annotation
    // 投票是校准燃料（信源信用/AI 画像都靠它）：有投票的条目不过期清理
    if (a && (a.keepForever || a.vote !== null || a.notes)) return false
    return true
  })
  if (doomed.length) await db.items.bulkDelete(doomed.map((i) => i.id))
  return doomed.length
}

/** 备份导出用：Curated 条目 + 带标注（投票/批注/保留）的其他条目——有标注即豁免 TTL 清理，必须随全量备份走（铁律 3） */
export async function curatedItems(): Promise<Item[]> {
  const all = await db.items.toArray()
  const kept = all.filter((i) => {
    if (i.deletedAt) return false
    if (i.stage === 'scored' || i.stage === 'kept') return true
    const a = i.annotation
    return !!(a && (a.keepForever || a.vote !== null || a.notes))
  })
  return kept.map(normalizeItem)
}

/** 统计：各源近 7 天产出（信源管理页"日均"列） */
export async function itemsPerSource7d(): Promise<Record<string, number>> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const rows = await db.items.where('fetchedAt').above(since).toArray()
  const count: Record<string, number> = {}
  for (const r of rows) {
    // 只数仍存在的条目：软删除的不算（页面向用户展示"近 7 天"应为可见条目数）
    if (r.deletedAt) continue
    count[r.sourceId] = (count[r.sourceId] ?? 0) + 1
  }
  return count
}
