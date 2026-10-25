import type {
  ActionItem,
  BackupBundle,
  InsightRecord,
  ReviewRecord,
} from '../types/models'
import { db } from './schema'

/** 生成本地唯一 ID（无需 uuid 依赖） */
export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}_${rand}`
}

/* ------------------------------ 复盘档案 ------------------------------ */

export async function saveReview(review: ReviewRecord): Promise<void> {
  await db.reviews.put({ ...review, updatedAt: new Date().toISOString() })
}

export async function getReview(id: string): Promise<ReviewRecord | undefined> {
  return db.reviews.get(id)
}

export async function listReviews(): Promise<ReviewRecord[]> {
  return db.reviews.orderBy('updatedAt').reverse().toArray()
}

export async function deleteReview(id: string): Promise<void> {
  await db.transaction('rw', db.reviews, db.actions, db.insights, db.notes, db.tasks, async () => {
    await db.reviews.delete(id)
    const actions = await db.actions.where('reviewId').equals(id).toArray()
    await db.actions.bulkDelete(actions.map((a) => a.id))
    const insights = await db.insights.where('reviewId').equals(id).toArray()
    await db.insights.bulkDelete(insights.map((i) => i.id))
    // 挂载过这份复盘的速记：剥离 reviewIds 引用（防悬空链接跳到不存在的档案）
    const allNotes = await db.notes.toArray()
    for (const n of allNotes) {
      if (n.links.reviewIds?.includes(id)) {
        await db.notes.put({ ...n, links: { ...n.links, reviewIds: n.links.reviewIds.filter((r) => r !== id) } })
      }
    }
    // 从被删行动项生成的任务：断开溯源（任务本身保留，退化为普通待办）
    const actionIds = new Set(actions.map((a) => a.id))
    const allTasks = await db.tasks.toArray()
    for (const t of allTasks) {
      if (t.origin.kind === 'review' && t.origin.refId && actionIds.has(t.origin.refId)) {
        await db.tasks.put({ ...t, origin: { kind: 'manual', refId: null }, updatedAt: new Date().toISOString() })
      }
    }
  })
}

/* ------------------------------ 行动项 ------------------------------ */

export async function upsertActions(reviewId: string, items: ActionItem[]): Promise<void> {
  await db.actions.bulkPut(items.map((a) => ({ ...a, reviewId })))
}

export async function listOpenActions(): Promise<ActionItem[]> {
  const all = await db.actions.where('status').equals('open').toArray()
  return all.sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
}

export async function listAllActions(): Promise<ActionItem[]> {
  return db.actions.toArray()
}

export interface ActionStats {
  open: number
  done: number
  dropped: number
  total: number
  /** 闭环率 = 已完成 / 全部行动项 */
  closureRate: number
}

export async function actionStats(): Promise<ActionStats> {
  const all = await db.actions.toArray()
  const open = all.filter((a) => a.status === 'open').length
  const done = all.filter((a) => a.status === 'done').length
  const dropped = all.filter((a) => a.status === 'dropped').length
  return {
    open,
    done,
    dropped,
    total: all.length,
    closureRate: all.length === 0 ? 0 : done / all.length,
  }
}

export async function closeAction(id: string, status: 'done' | 'dropped'): Promise<void> {
  await db.actions.update(id, { status, closedAt: new Date().toISOString() })
}

/* ------------------------------ 洞察卡 ------------------------------ */

export async function addInsight(insight: InsightRecord): Promise<void> {
  await db.insights.put(insight)
}

export async function listInsights(): Promise<InsightRecord[]> {
  return db.insights.orderBy('id').reverse().toArray()
}

/** 同主题（patternGroup）出现次数 —— 模式警示的依据 */
export async function countPattern(patternGroup: string): Promise<number> {
  return db.insights.where('patternGroup').equals(patternGroup).count()
}

/** 回访/修正洞察卡（整条覆盖写回） */
export async function updateInsight(insight: InsightRecord): Promise<void> {
  await db.insights.put(insight)
}

/** 删除洞察卡（写错/重复时） */
export async function deleteInsight(id: string): Promise<void> {
  await db.insights.delete(id)
}

/** 编辑行动项（改期/改内容），保留与复盘的溯源关系。
 *  改标题/期限时同步回写其生成的任务（a.taskId），两侧互不漂移 */
export async function updateAction(id: string, patch: Partial<ActionItem>): Promise<void> {
  await db.actions.update(id, patch)
  if (patch.text === undefined && patch.due === undefined) return
  const a = await db.actions.get(id)
  if (!a?.taskId) return
  const task = await db.tasks.get(a.taskId)
  if (!task) return
  const next = { ...task, updatedAt: new Date().toISOString() }
  if (patch.text !== undefined && patch.text.trim()) next.title = patch.text
  if (patch.due !== undefined) next.due = patch.due || undefined
  await db.tasks.put(next)
}

/** 某份复盘产生的全部行动项（详情页"下落"展示用） */
export async function listActionsByReview(reviewId: string): Promise<ActionItem[]> {
  return db.actions.where('reviewId').equals(reviewId).toArray()
}

/* --------------------------- 导出 / 导入 --------------------------- */

export async function exportAll(): Promise<BackupBundle> {
  const [reviews, actions, insights] = await Promise.all([
    db.reviews.toArray(),
    db.actions.toArray(),
    db.insights.toArray(),
  ])
  return { version: 1, exportedAt: new Date().toISOString(), reviews, actions, insights }
}

export async function importAll(bundle: BackupBundle, mode: 'merge' | 'overwrite' = 'merge'): Promise<void> {
  if (bundle.version !== 1) throw new Error(`不支持的备份版本：${bundle.version}`)
  await db.transaction('rw', db.reviews, db.actions, db.insights, async () => {
    if (mode === 'overwrite') {
      await Promise.all([db.reviews.clear(), db.actions.clear(), db.insights.clear()])
    }
    await db.reviews.bulkPut(bundle.reviews)
    await db.actions.bulkPut(bundle.actions)
    await db.insights.bulkPut(bundle.insights)
  })
}
