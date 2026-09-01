/**
 * 任务分类判定（纯函数，被页面与仓库共用）。
 * 用户三问分诊法：不问"重不重要"，问"不做的代价"——
 * ① 手动调整过 → 以手动为准（用户意志高于自动分诊，改错可再改回来）
 * ② 到期日已到 → 一类（窗口关闭，不可逆损失）
 * ③ 投标清单来源 → 二类（阻塞链路，非我不可）
 * ④ 其余 → 三类（可绕开：委派/推迟/删除）
 */
import type { TaskItem, TaskLane } from '../types/models'
import { todayLocal } from './datetime'

export function resolveLane(t: TaskItem, today = todayLocal()): TaskLane {
  const open = t.status === 'todo'
  if (!open) return t.lane ?? 3
  if (t.lane != null) return t.lane
  if (t.due && t.due <= today) return 1
  if (t.origin?.kind === 'bid') return 2
  return 3
}
