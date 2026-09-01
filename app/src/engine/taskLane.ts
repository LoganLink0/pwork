/**
 * 任务分类判定（纯函数，被页面与仓库共用）。
 * 用户三问分诊法：不问"重不重要"，问"不做的代价"——
 * ① 到期日已到 → 一类（窗口关闭，不可逆损失）
 * ② 投标清单来源 → 二类（阻塞链路，非我不可）
 * ③ 其余 → 三类（可绕开：委派/推迟/删除）
 */
import type { TaskItem, TaskLane } from '../types/models'
import { todayLocal } from './datetime'

export function resolveLane(t: TaskItem, today = todayLocal()): TaskLane {
  const open = t.status === 'todo' || t.status === 'doing'
  if (open && t.due && t.due <= today) return 1
  if (open && (t.origin?.kind === 'bid' || t.lane === 2)) return 2
  return t.lane ?? 3
}
