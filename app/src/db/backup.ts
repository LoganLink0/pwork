/**
 * 统一导入（备份先行铁律 6 的另一半）：接受三种格式，按 id + updatedAt last-writer-wins 合并（02 §4）。
 * ① PWORK v2：{ version:2, entities: { notes, sources?, items?, collectConfig?, reviews?, actions?, insights?, tasks?, goals?, snapshots?, blocks?, profiles?, caseFiles? } }
 * ② PWORK v1：{ version:1, entities: { notes } }
 * ③ FUPAN v1（旧复盘工作台导出）：{ version:1, exportedAt, reviews[], actions[], insights[] }
 */
import { db } from './schema'
import { normalizeNote } from './repo'
import { normalizeItem } from './collect'
import { normalizeTask } from './tasksRepo'
import { normalizeGoal } from './goalsRepo'
import { normalizeBlock } from './blocksRepo'
import { normalizeProfile } from './profilesRepo'
import { normalizeCaseFile } from './caseFilesRepo'
import { saveCollectConfig } from '../content/collect'
import type { CaseFile, DataBlock, Goal, Item, Note, Profile, ReportSnapshot, Source, TaskItem } from '../types/models'
import type { ActionItem, InsightRecord, ReviewRecord } from '../modules/review/types/models'

export interface ImportResult {
  format: 'pwork-v2' | 'pwork-v1' | 'fupan-v1'
  counts: Record<string, number>
}

/* LWW 合并：updatedAt 更新（或不存在）才写入 */
async function merge<T extends { id: string; updatedAt?: string }>(
  table: { get(id: string): Promise<T | undefined>; put(v: T): Promise<unknown> },
  incoming: T[],
): Promise<number> {
  let n = 0
  for (const raw of incoming) {
    if (!raw?.id) continue
    const existing = await table.get(raw.id)
    if (!existing || (raw.updatedAt ?? '') > (existing.updatedAt ?? '')) {
      await table.put(raw)
      n++
    }
  }
  return n
}

export async function importBundle(text: string): Promise<ImportResult> {
  const data = JSON.parse(text) as Record<string, unknown>
  const entities = (data.entities ?? null) as Record<string, unknown> | null
  const counts: Record<string, number> = {}

  // ③ FUPAN v1：reviews/actions/insights 在顶层
  if (!entities && Array.isArray(data.reviews)) {
    counts.reviews = await merge<ReviewRecord>(db.reviews, data.reviews as ReviewRecord[])
    counts.actions = await merge<ActionItem>(db.actions, (data.actions ?? []) as ActionItem[])
    counts.insights = await merge<InsightRecord>(db.insights, (data.insights ?? []) as InsightRecord[])
    return { format: 'fupan-v1', counts }
  }
  if (!entities) throw new Error('无法识别的备份格式（缺少 entities 与 reviews）')

  // ①/② PWORK 包裹
  if (Array.isArray(entities.notes)) counts.notes = await merge<Note>(db.notes, (entities.notes as Note[]).map(normalizeNote))
  if (Array.isArray(entities.sources)) counts.sources = await merge<Source>(db.sources, entities.sources as Source[])
  if (Array.isArray(entities.items)) counts.items = await merge<Item>(db.items, (entities.items as Item[]).map(normalizeItem))
  if (Array.isArray(entities.tasks)) counts.tasks = await merge<TaskItem>(db.tasks, (entities.tasks as TaskItem[]).map(normalizeTask))
  if (Array.isArray(entities.reviews)) counts.reviews = await merge<ReviewRecord>(db.reviews, entities.reviews as ReviewRecord[])
  if (Array.isArray(entities.actions)) counts.actions = await merge<ActionItem>(db.actions, entities.actions as ActionItem[])
  if (Array.isArray(entities.insights)) counts.insights = await merge<InsightRecord>(db.insights, entities.insights as InsightRecord[])
  if (Array.isArray(entities.goals)) counts.goals = await merge<Goal>(db.goals, (entities.goals as Goal[]).map(normalizeGoal))
  if (Array.isArray(entities.blocks)) counts.blocks = await merge<DataBlock>(db.blocks, (entities.blocks as DataBlock[]).map(normalizeBlock))
  if (Array.isArray(entities.profiles)) counts.profiles = await merge<Profile>(db.profiles, (entities.profiles as Profile[]).map(normalizeProfile))
  if (Array.isArray(entities.caseFiles)) counts.caseFiles = await merge<CaseFile>(db.caseFiles, (entities.caseFiles as CaseFile[]).map(normalizeCaseFile))
  // 周趋势快照无 updatedAt 字段——只补缺，不覆盖（重复生成覆盖是生成侧的语义）
  if (Array.isArray(entities.snapshots)) counts.snapshots = await merge<ReportSnapshot>(db.snapshots, entities.snapshots as ReportSnapshot[])
  if (entities.collectConfig && typeof entities.collectConfig === 'object') {
    saveCollectConfig(entities.collectConfig as Parameters<typeof saveCollectConfig>[0])
    counts.collectConfig = 1
  }
  return { format: data.version === 2 ? 'pwork-v2' : 'pwork-v1', counts }
}
