import { create } from 'zustand'
import {
  createSource,
  deleteSource,
  digestDates,
  digestFor,
  findItemByFingerprint,
  putItem,
  softDeleteItem,
  getItem,
  importSources,
  itemsPerSource7d,
  listAllSources,
  listRecentItems,
  resetSourceHealth,
  updateAnnotation,
  updateSource,
  type SourceInput,
} from '../db/collect'
import { runCollect, maintenance, type RunSummary } from '../engine/collect'
import { backfillContentOnce, enqueueContent, onContentUpdate } from '../engine/articleContent'
import { fingerprintOf } from '../engine/fingerprint'
import { scoreByRules } from '../engine/rules'
import { newId } from '../db/repo'
import { recordError, track } from '../engine/errorLog'
import { toast } from '../engine/toast'
import {
  DEFAULT_COLLECT_CONFIG,
  loadCollectConfig,
  saveCollectConfig,
  RECOMMENDED_SOURCES,
} from '../content/collect'
import { exportBundle as exportNotesBundle } from '../db/repo'
import { curatedItems } from '../db/collect'
import { db } from '../db/schema'
import { todayLocal } from '../engine/datetime'
import type { CollectConfig, Item, Source } from '../types/models'

export interface FetchProgress {
  running: boolean
  summary: RunSummary | null
  lastRunAt: string | null
  /** 抓取中途失败的原因（成功为 null）——按钮永不卡在「抓取中」的保证 */
  error: string | null
}

interface CollectState {
  sources: Source[]
  items: Item[] // 近 30 天全部 stage（条目库视图）
  items7d: Record<string, number> // sourceId → 近 7 天产出
  digest: Item[] // 当前日期 Top N
  digestDate: string
  /** 用户手动选过日期后不再自动跟随"今天"（页面跨天长开时，未手选则 load() 自动翻到新的一天） */
  dateManuallySet: boolean
  digestDateOptions: string[]
  config: CollectConfig
  fetch: FetchProgress
  loaded: boolean

  load: () => Promise<void>
  setDigestDate: (date: string) => Promise<void>
  runFetchAll: () => Promise<void>
  addSource: (input: SourceInput) => Promise<void>
  editSource: (id: string, patch: Partial<SourceInput> & { active?: boolean }) => Promise<void>
  toggleActive: (id: string, active: boolean) => Promise<void>
  removeSource: (id: string) => Promise<void>
  importRecommended: () => Promise<{ imported: number; skipped: number }>
  importJson: (text: string) => Promise<{ imported: number; skipped: number }>
  importCatalog: (list: SourceInput[]) => Promise<{ imported: number; skipped: number }>
  setVote: (itemId: string, vote: 'want' | 'meh' | 'no' | null) => Promise<void>
  setNotes: (itemId: string, notes: string) => Promise<void>
  toggleKeep: (itemId: string) => Promise<void>
  deleteItem: (itemId: string) => Promise<void>
  cycleOt: (itemId: string) => Promise<void>
  /** 视频链接入库（C 路线·链接捕获）：解析后的元数据直接评分入库——手动捕获即明确意图，跳过预筛 */
  captureLink: (meta: { title: string; author: string; description: string; url: string }) => Promise<{ ok: boolean; error?: string; duplicated?: boolean }>
  /** 单条刷新（正文队列写回后，阅读视图/卡片即时看到全文，不重载全列表） */
  reloadItem: (itemId: string) => Promise<void>
  setConfig: (patch: Partial<CollectConfig>) => void
}

async function reloadDigest(state: { digestDate: string; config: CollectConfig }): Promise<Pick<CollectState, 'digest' | 'digestDateOptions'>> {
  const [digest, dates] = await Promise.all([digestFor(state.digestDate, state.config.topN), digestDates()])
  return { digest, digestDateOptions: dates }
}

export const useCollect = create<CollectState>((set, get) => ({
  sources: [],
  items: [],
  items7d: {},
  digest: [],
  digestDate: todayLocal(),
  dateManuallySet: false,
  digestDateOptions: [],
  config: loadCollectConfig(),
  fetch: { running: false, summary: null, lastRunAt: null, error: null },
  loaded: false,

  load: async () => {
    // 例行维护：TTL 清理（铁律 3 允许的物理清理路径）；失败入错误日志，不再静默
    track(maintenance(), '采集例行清理 maintenance')
    // 正文回填：每次打开跑一次（内部有单次闸），缺正文的旧条目按队列上限渐进补齐
    track(
      backfillContentOnce().catch((e: unknown) => {
        throw new Error(`正文回填失败：${e instanceof Error ? e.message : String(e)}`)
      }),
      '正文回填 backfillContentOnce',
    )
    // 正文队列写回 → 单条刷新（阅读视图开着时即时看到全文）
    onContentUpdate((id) => void get().reloadItem(id))
    const [sources, items, items7d] = await Promise.all([listAllSources(), listRecentItems(60), itemsPerSource7d()])
    set({ sources, items, items7d, loaded: true })
    // 页面跨天长开：digestDate 在开页时求值一次会卡在昨天——未手动选过日期就自动翻到今天
    const today = todayLocal()
    if (!get().dateManuallySet && get().digestDate !== today) set({ digestDate: today })
    set(await reloadDigest(get()))
  },

  setDigestDate: async (date) => {
    set({ digestDate: date, dateManuallySet: true })
    set(await reloadDigest(get()))
  },

  deleteItem: async (itemId) => {
    await softDeleteItem(itemId)
    const [sources, items, items7d] = await Promise.all([listAllSources(), listRecentItems(), itemsPerSource7d()])
    set({ sources, items, items7d })
    set(await reloadDigest(get()))
  },

  runFetchAll: async () => {
    const { sources, config } = get()
    const active = sources.filter((s) => s.active)
    set({ fetch: { running: true, summary: null, lastRunAt: get().fetch.lastRunAt, error: null } })
    try {
      const summary = await runCollect(active, config)
      // 失败留痕（2026-10-27 用户明令：手动检查能发现的问题必须如实进错误日志）——
      // 横幅已有当轮反馈，这里静默入库供回查
      const failed = summary.results.filter((r) => !r.ok)
      if (failed.length > 0) {
        void recordError({
          where: '采集.抓取',
          kind: 'app',
          message: `${failed.length}/${summary.results.length} 个源失败：${failed.map((f) => `${f.sourceName}（${f.error ?? '未知'}）`).join('、').slice(0, 280)}`,
          detail: { failed: failed.map((f) => ({ name: f.sourceName, error: f.error })) },
        }, { silent: true })
      }
      const stopped = summary.results.filter((r) => r.autoStopped)
      if (stopped.length > 0) {
        void recordError({
          where: '采集.自动停用',
          kind: 'app',
          message: `连败 3 次自动停用：${stopped.map((f) => f.sourceName).join('、')}——换地址后到信源页点「启用」开关重启`,
        }, { silent: true })
      }
      const [allSources, items, items7d] = await Promise.all([listAllSources(), listRecentItems(), itemsPerSource7d()])
      set({ sources: allSources, items, items7d, fetch: { running: false, summary, lastRunAt: new Date().toISOString(), error: null } })
      set(await reloadDigest(get()))
      // 新条目进正文队列（串行限速后台跑；失败留空不重试，阅读视图可手动重抓）
      enqueueContent(summary.newContentIds)
      // 正文回填不再纯无声（2026-11-04 用户反馈）：本轮有可抓正文的新文章时给一句提示，
      // 让用户知道"阅读全文"会陆续亮起来；阅读视图打开即抓，不会扑空
      if (summary.newContentIds.length > 0) {
        toast('info', `新入库 ${summary.newContentIds.length} 篇，正文正在后台陆续抓取`)
      }
    } catch (err) {
      // 中途炸掉也必须复位 running 并留痕——2026-10 事故：拒绝穿透让按钮永久「抓取中」
      const message = err instanceof Error ? err.message : String(err)
      void recordError({
        where: '采集.立即抓取 runFetchAll',
        kind: 'app',
        message,
        stack: err instanceof Error ? err.stack : undefined,
        detail: { activeSources: active.length },
      })
      set({ fetch: { running: false, summary: null, lastRunAt: new Date().toISOString(), error: message } })
    }
  },

  addSource: async (input) => {
    await createSource(input)
    set({ sources: await listAllSources() })
  },

  editSource: async (id, patch) => {
    await updateSource(id, patch)
    set({ sources: await listAllSources() })
  },

  toggleActive: async (id, active) => {
    await updateSource(id, { active })
    if (active) await resetSourceHealth(id)
    set({ sources: await listAllSources() })
  },

  removeSource: async (id) => {
    await deleteSource(id)
    set({ sources: await listAllSources() })
  },

  importRecommended: async () => {
    const r = await importSources(RECOMMENDED_SOURCES)
    set({ sources: await listAllSources() })
    return r
  },

  importJson: async (text) => {
    const list = JSON.parse(text) as { name?: string; url?: string; domain?: string; tier?: number }[]
    const r = await importSources(Array.isArray(list) ? list : [])
    set({ sources: await listAllSources() })
    return r
  },

  // 目录导入（引导页/信源页的 SourceCatalog 用）：写库后刷新 store——
  // 2026-10-26 修复：组件曾直接调 db 层绕过 store，导入成功后信源页计数与列表不刷新
  importCatalog: async (list) => {
    const r = await importSources(list)
    set({ sources: await listAllSources() })
    return r
  },

  setVote: async (itemId, vote) => {
    await updateAnnotation(itemId, { vote })
    set({ items: await refreshItem(itemId, get().items) })
    set(await reloadDigest(get()))
  },

  setNotes: async (itemId, notes) => {
    await updateAnnotation(itemId, { notes })
    set({ items: await refreshItem(itemId, get().items) })
    set(await reloadDigest(get()))
  },

  toggleKeep: async (itemId) => {
    const cur = await getItem(itemId)
    await updateAnnotation(itemId, { keepForever: !cur?.annotation.keepForever })
    set({ items: await refreshItem(itemId, get().items) })
    set(await reloadDigest(get()))
  },

  cycleOt: async (itemId) => {
    const cur = await getItem(itemId)
    const order: (Item['otFlag'])[] = ['opportunity', 'threat', 'trend', null]
    const idx = cur?.otFlag ? order.indexOf(cur.otFlag) : order.length - 1
    const next = order[(idx + 1) % order.length]!
    await updateAnnotation(itemId, { otFlag: next })
    set({ items: await refreshItem(itemId, get().items) })
    set(await reloadDigest(get()))
  },

  captureLink: async (meta) => {
    const fp = fingerprintOf(meta.url, meta.title)
    if (await findItemByFingerprint(fp)) return { ok: false, duplicated: true }
    const now = new Date().toISOString()
    const config = get().config
    // 虚拟来源：手动捕获不属于任何订阅；weight 取 T1.5 档（用户主动捕获，置信高于普通信源）
    const virtualSource = {
      id: 'capture', name: '链接捕获', domain: 'other', tier: 1.5 as const, weight: 0.7, active: true,
      kind: 'rss' as const, checkEvery: 'daily' as const, health: { failStreak: 0, lastOkAt: null, lastError: null },
      createdAt: now, updatedAt: now, deletedAt: null, schemaVersion: 1,
    } as unknown as Source
    const { score, reason, tags } = scoreByRules({
      source: virtualSource,
      title: meta.title,
      summary: meta.description.length > 200 ? `${meta.description.slice(0, 200)}…` : meta.description,
      domainCountToday: 0,
      config,
    })
    await putItem({
      id: newId('itm'),
      sourceId: 'capture',
      sourceName: '链接捕获',
      url: meta.url,
      title: meta.title,
      summary: meta.description.length > 200 ? `${meta.description.slice(0, 200)}…` : meta.description,
      fingerprint: fp,
      eventGroup: null,
      publishedAt: null,
      fetchedAt: now,
      stage: 'scored',
      score,
      scoreReason: reason,
      aiBy: 'rules',
      tags: meta.author ? [...tags, meta.author] : tags,
      otFlag: null,
      expiresAt: null,
      annotation: { notes: '', vote: null, keepForever: false, linkedReviewId: null },
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
    })
    await useCollect.getState().load()
    return { ok: true }
  },

  reloadItem: async (itemId) => {
    set({ items: await refreshItem(itemId, get().items) })
    set(await reloadDigest(get()))
  },

  setConfig: (patch) => {
    const next = { ...get().config, ...patch }
    saveCollectConfig(next)
    set({ config: next })
  },
}))

async function refreshItem(itemId: string, items: Item[]): Promise<Item[]> {
  const fresh = await getItem(itemId)
  if (!fresh) return items
  return items.map((i) => (i.id === itemId ? fresh : i))
}

/** 全量备份（统一包裹 v2：notes + 采集 + 回路 + 任务库 + 目标/快照/数据块/案例，02 §4） */
export async function buildBackupBundle() {
  const bundle = await exportNotesBundle()
  const [sources, items, config, reviews, actions, insights, tasks, goals, snapshots, blocks, profiles, caseFiles] = await Promise.all([
    listAllSources(),
    curatedItems(),
    Promise.resolve(useCollect.getState().config),
    db.reviews.toArray(),
    db.actions.toArray(),
    db.insights.toArray(),
    db.tasks.toArray(),
    db.goals.toArray(),
    db.snapshots.toArray(),
    db.blocks.toArray(),
    db.profiles.toArray(),
    db.caseFiles.toArray(),
  ])
  return {
    version: 2,
    exportedAt: bundle.exportedAt,
    entities: {
      ...bundle.entities,
      sources,
      items,
      collectConfig: config,
      reviews,
      actions,
      insights,
      tasks,
      goals,
      snapshots,
      blocks,
      profiles,
      caseFiles,
    },
  }
}

export { DEFAULT_COLLECT_CONFIG }
