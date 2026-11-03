/**
 * 采集流水线编排（C1：Fetch → Dedup → PreFilter → 规则评分 → Distribute，04 §4）。
 * 约束（04 §10）：并发 ≤5、单源超时 10s；AI 层 C2 接入，当前恒走规则链（aiBy='rules'）。
 */
import {
  cleanupExpired,
  digestFor,
  findItemByFingerprint,
  itemsOfLocalDay,
  markKept,
  markSourceFail,
  markSourceOk,
  putItem,
} from '../db/collect'
import { newId } from '../db/repo'
import { fetchFeed } from './rss'
import { fetchYtdlpPlaylist } from './ytdlp'
import { prefilter, scoreByRules } from './rules'
import { fingerprintOf } from './fingerprint'
import { todayLocal } from './datetime'
import type { CollectConfig, Item, Source } from '../types/models'

const CONCURRENCY = 5
const ITEM_TTL_MS = 14 * 86_400_000

export interface SourceRunResult {
  sourceId: string
  sourceName: string
  ok: boolean
  newCount: number
  duplicateCount: number
  discardedCount: number
  error: string | null
  autoStopped: boolean
  /** 本轮新入库的 scored 条目 id（rss 源才有；正文队列据此回填全文） */
  newIds: string[]
}

export interface RunSummary {
  results: SourceRunResult[]
  totalNew: number
  totalDiscarded: number
  digestIds: string[]
  /** 值得抓正文的新条目 id（rss 源的 scored 条目；ytdlp 视频无正文不进队列） */
  newContentIds: string[]
  /** 本轮总耗时（毫秒）——用户问"这次抓了多久"，界面直接回答 */
  elapsedMs: number
}

/** 单源处理：抓取 → 逐条去重 → 预筛 → 规则评分 → 入库 */
async function runSource(source: Source, config: CollectConfig, domainCount: Map<string, number>): Promise<SourceRunResult> {
  const base: SourceRunResult = {
    sourceId: source.id,
    sourceName: source.name,
    ok: false,
    newCount: 0,
    duplicateCount: 0,
    discardedCount: 0,
    error: null,
    autoStopped: false,
    newIds: [],
  }
  // 按信源类型分发抓取：rss 走标准 RSS/Atom；ytdlp 调本机 yt-dlp 拉平台投稿清单。
  // 两者输出同一契约（{ok, items, error}），去重/预筛/评分后续链路完全共享
  const feed =
    source.kind === 'ytdlp'
      ? await fetchYtdlpPlaylist(source.url)
      : await fetchFeed(source.url, 10_000, config.relayBase)
  if (!feed.ok) {
    const autoStopped = await markSourceFail(source.id, feed.error ?? '未知错误')
    return { ...base, error: feed.error, autoStopped }
  }
  await markSourceOk(source.id)
  const now = new Date().toISOString()

  for (const raw of feed.items) {
    const fp = fingerprintOf(raw.url, raw.title)
    if (await findItemByFingerprint(fp)) {
      base.duplicateCount++
      continue
    }
    const verdict = prefilter({ title: raw.title, summary: raw.summary, config })
    const domainSeen = domainCount.get(source.domain) ?? 0
    const item: Item = verdict.pass
      ? buildScoredItem(source, raw, fp, domainSeen, config, now)
      : buildDiscardedItem(source, raw, fp, now, verdict.reason)
    await putItem(item)
    domainCount.set(source.domain, domainSeen + 1)
    if (verdict.pass) {
      base.newCount++
      // ytdlp 源的条目是视频投稿，正文队列不收（无正文可提）
      if (source.kind !== 'ytdlp') base.newIds.push(item.id)
    } else {
      base.discardedCount++
    }
  }
  return { ...base, ok: true }
}

function buildScoredItem(
  source: Source,
  raw: { title: string; url: string; summary: string; publishedAt: string | null },
  fp: string,
  domainSeen: number,
  config: CollectConfig,
  now: string,
): Item {
  const { score, reason, tags } = scoreByRules({
    source,
    title: raw.title,
    summary: raw.summary,
    domainCountToday: domainSeen,
    config,
  })
  return {
    id: newId('itm'),
    sourceId: source.id,
    sourceName: source.name,
    url: raw.url,
    title: raw.title,
    summary: raw.summary,
    fingerprint: fp,
    eventGroup: null,
    publishedAt: raw.publishedAt,
    fetchedAt: now,
    stage: 'scored',
    score,
    scoreReason: reason,
    aiBy: 'rules',
    tags,
    otFlag: null,
    expiresAt: null, // scored/kept 为 Curated，无 TTL（04 §3.4）
    annotation: { notes: '', vote: null, keepForever: false, linkedReviewId: null },
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
  }
}

function buildDiscardedItem(
  source: Source,
  raw: { title: string; url: string; summary: string; publishedAt: string | null },
  fp: string,
  now: string,
  reason: string,
): Item {
  return {
    id: newId('itm'),
    sourceId: source.id,
    sourceName: source.name,
    url: raw.url,
    title: raw.title,
    summary: raw.summary,
    fingerprint: fp,
    eventGroup: null,
    publishedAt: raw.publishedAt,
    fetchedAt: now,
    stage: 'discarded',
    score: { total: 0, source: 0, novelty: 0, relevance: 0, utility: 0 },
    scoreReason: `预筛拒绝：${reason}`,
    aiBy: 'rules',
    tags: [],
    otFlag: null,
    expiresAt: new Date(Date.now() + ITEM_TTL_MS).toISOString(), // 14 天后物理清理
    annotation: { notes: '', vote: null, keepForever: false, linkedReviewId: null },
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
  }
}

/** 简易并发闸（无依赖）：同时最多 CONCURRENCY 个源在跑 */
async function runLimited<T, R>(tasks: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const i = cursor++
      results[i] = await fn(tasks[i]!)
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * 「立即抓取」：活跃源全量跑一轮（C1 手动触发；C2 改为 Cron + 增量同步）。
 * 返回运行摘要；Top N 分发在 store 层据结果执行（markKept）。
 */
export async function runCollect(sources: Source[], config: CollectConfig): Promise<RunSummary> {
  const startedAt = Date.now()
  const today = todayLocal()
  const existing = await itemsOfLocalDay(today)
  // novelty 依据：同主题域今日已有条数（sourceId → domain 映射后累计）
  const domainCount = new Map<string, number>()
  for (const s of sources) domainCount.set(s.domain, 0)
  const domainOf = new Map(sources.map((s) => [s.id, s.domain]))
  for (const i of existing) {
    const d = domainOf.get(i.sourceId)
    if (d) domainCount.set(d, (domainCount.get(d) ?? 0) + 1)
  }

  const results = await runLimited(sources, CONCURRENCY, (s) => runSource(s, config, domainCount))

  const digest = await digestFor(today, config.topN)
  await markKept(digest.map((i) => i.id))

  return {
    results,
    totalNew: results.reduce((n, r) => n + r.newCount, 0),
    totalDiscarded: results.reduce((n, r) => n + r.discardedCount, 0),
    digestIds: digest.map((i) => i.id),
    newContentIds: results.flatMap((r) => r.newIds),
    elapsedMs: Date.now() - startedAt,
  }
}

/** 应用打开时的例行维护：TTL 清理（后台静默） */
export async function maintenance(): Promise<number> {
  return cleanupExpired()
}
