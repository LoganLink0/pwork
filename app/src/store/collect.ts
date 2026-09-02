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
import {
  DEFAULT_COLLECT_CONFIG,
  loadCollectConfig,
  saveCollectConfig,
  SAMPLE_SOURCES,
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
  fetch: { running: false, summary: null, lastRunAt: null },
  loaded: false,

  load: async () => {
    // 例行维护：TTL 清理（铁律 3 允许的物理清理路径）
    void maintenance()
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
    set({ fetch: { running: true, summary: null, lastRunAt: get().fetch.lastRunAt } })
    const summary = await runCollect(active, config)
    const [allSources, items, items7d] = await Promise.all([listAllSources(), listRecentItems(), itemsPerSource7d()])
    set({ sources: allSources, items, items7d, fetch: { running: false, summary, lastRunAt: new Date().toISOString() } })
    set(await reloadDigest(get()))
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
    const order: NonNullable<Item['otFlag']>[] = ['opportunity', 'threat', 'trend']
    const next = cur?.otFlag ? order[(order.indexOf(cur.otFlag) + 1) % order.length]! : 'opportunity'
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

/** 全量备份（统一包裹 v2：notes + 采集 + 回路 + 任务库，02 §4） */
export async function buildBackupBundle() {
  const bundle = await exportNotesBundle()
  const [sources, items, config, reviews, actions, insights, tasks] = await Promise.all([
    listAllSources(),
    curatedItems(),
    Promise.resolve(useCollect.getState().config),
    db.reviews.toArray(),
    db.actions.toArray(),
    db.insights.toArray(),
    db.tasks.toArray(),
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
    },
  }
}

export { DEFAULT_COLLECT_CONFIG }
