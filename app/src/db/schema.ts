import Dexie, { type Table } from 'dexie'
import type { Goal, Item, Note, Source, TaskItem } from '../types/models'
import type { CaseFile, DataBlock, Profile, ReportSnapshot } from '../types/models'
import type { ActionItem, InsightRecord, ReviewRecord } from '../modules/review/types/models'

/** 存储降级状态：探针失败后为 true，UI 据此显示"数据不会保留"横幅（FUPAN 降级方案延续） */
export let usingMemoryFallback = false

/** IndexedDB 不可用（隐私模式/禁存储）时，动态加载内存实现并重试 */
async function ensureIndexedDB(): Promise<void> {
  try {
    const probe = indexedDB.open('pwork-probe')
    await new Promise<void>((resolve, reject) => {
      probe.onsuccess = () => {
        probe.result.close()
        resolve()
      }
      probe.onerror = () => reject(probe.error ?? new Error('indexeddb blocked'))
      probe.onblocked = () => reject(new Error('indexeddb blocked'))
    })
  } catch {
    usingMemoryFallback = true
    // @ts-expect-error polyfill 包无类型声明（只在降级路径动态加载）
    await import('fake-indexeddb/auto')
  }
}

/**
 * 本地数据库：IndexedDB，库名即产品名；不可用时降级为内存模式（本次会话有效）。
 * 迁移规则（铁律 2）：字段只增不删；索引变化必须升 version。
 * v1：速记；v2：信息采集；v3：回路模块（W3 迁入，reviews/actions/insights）+ 任务库。
 */
export class PworkDB extends Dexie {
  notes!: Table<Note, string>
  sources!: Table<Source, string>
  items!: Table<Item, string>
  reviews!: Table<ReviewRecord, string>
  actions!: Table<ActionItem, string>
  insights!: Table<InsightRecord, string>
  tasks!: Table<TaskItem, string>
  goals!: Table<Goal, string>
  snapshots!: Table<ReportSnapshot, string>
  blocks!: Table<DataBlock, string>
  profiles!: Table<Profile, string>
  caseFiles!: Table<CaseFile, string>

  constructor() {
    super('pwork-workbench')
    this.version(1).stores({
      notes: 'id, source, deletedAt, updatedAt',
    })
    this.version(2).stores({
      notes: 'id, source, deletedAt, updatedAt',
      sources: 'id, url, active, updatedAt',
      items: 'id, sourceId, stage, fingerprint, fetchedAt, otFlag',
    })
    this.version(3).stores({
      reviews: 'id, scenario, type, status, updatedAt, createdAt',
      actions: 'id, reviewId, status, due',
      insights: 'id, reviewId, verified, patternGroup',
      tasks: 'id, status, due',
    })
    // v4（W5）：目标实体（C-2 最小形态）
    this.version(4).stores({
      goals: 'id, status, due',
    })
    // v5：周趋势快照（输出 O1 增补）
    this.version(5).stores({
      snapshots: 'id, day, createdAt',
    })
    // v6（输出扩展）：外部数据块——用户从工作台外带来的结构化片段，报告/朗读/PPT 管线并入
    this.version(6).stores({
      blocks: 'id, updatedAt',
    })
    // v7（外部数据推送）：blocks 加 extId 索引——云端 /api/ingest 增量拉取去重
    this.version(7).stores({
      blocks: 'id, updatedAt, extId',
    })
    // v8/v9（调研对象）：对象档案表 + 数据块归属对象
    this.version(8).stores({
      profiles: 'id, updatedAt',
    })
    this.version(9).stores({
      blocks: 'id, updatedAt, extId, profileId',
    })
    // v10（案例模块）：案例文件——简历版本/JD/公司资料，保持文件形态
    this.version(10).stores({
      caseFiles: 'id, caseId, kind, createdAt',
    })
  }
}

export const db = new PworkDB()

/** 应用入口在渲染前调用：不可用则先切内存实现再继续 */
export async function initStorage(): Promise<void> {
  await ensureIndexedDB()
  if (usingMemoryFallback) {
    // Dexie 已在构造时绑定原生 indexedDB；重开一次让它捡到 polyfill
    try {
      db.close()
    } catch {
      /* ignore */
    }
    db.open().catch(() => {
      /* 打开失败也继续——内存实现下 Dexie 会用 polyfill 的 indexedDB */
    })
  }
}
