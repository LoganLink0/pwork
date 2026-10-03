import { create } from 'zustand'
import {
  createSource,
  deleteSource,
  digestDates,
  digestFor,
  softDeleteItem,
  getItem,
  importSources,
  itemsPerSource7d,
  listAllSources,
  listRecentItems,
  updateAnnotation,
  updateSource,
  type SourceInput,
} from '../db/collect'
import { runCollect, maintenance, type RunSummary } from '../engine/collect'
import { recordError, track } from '../engine/errorLog'
import {
  DEFAULT_COLLECT_CONFIG,
  loadCollectConfig,
  saveCollectConfig,
  SAMPLE_SOURCES,
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
  importSample: () => Promise<{ imported: number; skipped: number }>
  importRecommended: () => Promise<{ imported: number; skipped: number }>
  importJson: (text: string) => Promise<{ imported: number; skipped: number }>
  setStars: (itemId: string, stars: number) => Promise<void>
  setNotes: (itemId: string, notes: string) => Promise<void>
  toggleKeep: (itemId: string) => Promise<void>
  deleteItem: (itemId: string) => Promise<void>
  cycleOt: (itemId: string) => Promise<void>
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
  digestDateOptions: [],
  config: loadCollectConfig(),
  fetch: { running: false, summary: null, lastRunAt: null, error: null },
  loaded: false,

  load: async () => {
    // 例行维护：TTL 清理（铁律 3 允许的物理清理路径）；失败入错误日志，不再静默
    track(maintenance(), '采集例行清理 maintenance')
    const [sources, items, items7d] = await Promise.all([listAllSources(), listRecentItems(), itemsPerSource7d()])
    set({ sources, items, items7d, loaded: true })
    set(await reloadDigest(get()))
  },

  setDigestDate: async (date) => {
    set({ digestDate: date })
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
      const [allSources, items, items7d] = await Promise.all([listAllSources(), listRecentItems(), itemsPerSource7d()])
      set({ sources: allSources, items, items7d, fetch: { running: false, summary, lastRunAt: new Date().toISOString(), error: null } })
      set(await reloadDigest(get()))
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
    set({ sources: await listAllSources() })
  },

  removeSource: async (id) => {
    await deleteSource(id)
    set({ sources: await listAllSources() })
  },

  importSample: async () => {
    const r = await importSources(SAMPLE_SOURCES)
    set({ sources: await listAllSources() })
    return r
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

  setStars: async (itemId, stars) => {
    await updateAnnotation(itemId, { stars })
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
