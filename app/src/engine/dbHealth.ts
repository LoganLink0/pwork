/**
 * 启动数据健康检查（0.3 数据主权批，2026-10-29）：数据不丢的第三道闸。
 * ① 库能打开吗——IndexedDB 物理损坏/配额异常时 open 失败，立刻给出恢复指引
 *   （错误条直达用户，不静默带病运行）；② 各核心表计数交给突变守卫（dbGuard）
 *   做比对与基准维护——「某表骤减」的判定、隔离与恢复都在那边。
 * 恢复路径：桌面版 应用数据目录\backups 的最近 JSON → 设置 → 数据 → 导入；
 * 网页版 最近下载的备份 JSON → 同一入口。配合持久化存储（第一道）与自动备份（第二道）。
 */
import { db } from '../db/schema'

export interface DbHealthResult {
  ok: boolean
  /** 打开失败的原因（ok=false 时有） */
  error?: string
  /** 核心表计数（ok=true 时有） */
  counts?: Record<string, number>
}

export const CORE_TABLES = ['notes', 'sources', 'items', 'tasks', 'reviews', 'actions', 'insights', 'goals'] as const

/** 核心表逐一计数（健康检查与突变守卫共用同一口径） */
export async function countCoreTables(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const t of CORE_TABLES) {
    counts[t] = await db.table<Record<string, unknown>>(t).count()
  }
  return counts
}

export async function runStartupHealthCheck(): Promise<DbHealthResult> {
  try {
    await db.open()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  return { ok: true, counts: await countCoreTables() }
}

/** 恢复指引（错误条/设置页共用文案） */
export function recoveryGuidance(isDesktop: boolean): string {
  const where = isDesktop
    ? '桌面版：关闭应用，在 应用数据目录的 backups 文件夹 找最近一份备份 JSON'
    : '网页版：找最近一次下载（或自动备份）的备份 JSON'
  return `${where}，然后在 设置 → 数据 → 导入 恢复。`
}
