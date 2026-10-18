import { create } from 'zustand'
import {
  createTask,
  getTask,
  listTasks,
  setTaskStatus,
  dueStats,
  softDeleteTask,
  postponeTask,
  setTaskLane,
  type CreateTaskInput,
} from '../db/tasksRepo'
import type { TaskItem, TaskLane } from '../types/models'
import { toTodoTaskInputs } from '../engine/todoScan'
import {
  clearRootHandle,
  loadRootHandle,
  requestRootPermission,
  rootPermission,
  saveRootHandle,
  scanRootTodos,
} from '../engine/fsTodoScan'

export interface DueStats {
  today: number
  week: number
  open: number
  done: number
  total: number
}

export type TodoScanOutcome =
  | { ok: true; added: number; skipped: number; projects: number; rootName: string }
  | { ok: false; reason: 'no-root' | 'denied' | 'invalid' | 'not-supported' }

/** 任务库状态（Zustand）：列表 + 到期统计（首页瓦片/侧边栏共用） */
interface TasksState {
  tasks: TaskItem[]
  stats: DueStats
  loaded: boolean
  load: () => Promise<void>
  create: (input: CreateTaskInput) => Promise<TaskItem>
  setStatus: (id: string, status: TaskItem['status']) => Promise<void>
  postpone: (id: string, days?: number) => Promise<void>
  remove: (id: string) => Promise<void>
  setLane: (id: string, lane: TaskLane) => Promise<void>
  /** 扫描各项目 TODO.md → 导入未完成项（幂等）。trigger='open' 为开机静默（无手势不弹授权）；'manual' 可选目录/请求授权 */
  scanProjectTodos: (trigger: 'open' | 'manual') => Promise<TodoScanOutcome>
}

async function reload(): Promise<Pick<TasksState, 'tasks' | 'stats'>> {
  const [tasks, stats] = await Promise.all([listTasks(), dueStats()])
  return { tasks, stats }
}

export const useTasks = create<TasksState>((set) => ({
  tasks: [],
  stats: { today: 0, week: 0, open: 0, done: 0, total: 0 },
  loaded: false,

  load: async () => {
    set({ ...(await reload()), loaded: true })
  },

  create: async (input) => {
    const task = await createTask(input)
    set(await reload())
    return task
  },

  setStatus: async (id, status) => {
    await setTaskStatus(id, status)
    set(await reload())
  },

  postpone: async (id, days = 7) => {
    await postponeTask(id, days)
    set(await reload())
  },

  remove: async (id) => {
    await softDeleteTask(id)
    set(await reload())
  },

  setLane: async (id, lane) => {
    await setTaskLane(id, lane)
    set(await reload())
  },

  scanProjectTodos: async (trigger) => {
    let handle = await loadRootHandle()
    // 手动触发且还没有根目录：弹选择器（必须在用户手势内）
    if (!handle && trigger === 'manual') {
      const { fsAccessSupported, pickRootDirectory } = await import('../engine/fsTodoScan')
      if (!fsAccessSupported()) return { ok: false, reason: 'not-supported' }
      handle = await pickRootDirectory()
      if (!handle) return { ok: false, reason: 'no-root' }
      await saveRootHandle(handle)
    }
    if (!handle) return { ok: false, reason: 'no-root' }

    const perm = await rootPermission(handle)
    if (perm === 'invalid') {
      // 句柄失效（目录被删/浏览器清了授权）：清掉让下次重新选
      await clearRootHandle()
      return { ok: false, reason: 'invalid' }
    }
    if (perm === 'prompt') {
      // 开机静默场景没有用户手势，不能弹授权——等手动点按钮时再请求
      if (trigger === 'open') return { ok: false, reason: 'denied' }
      if (!(await requestRootPermission(handle))) return { ok: false, reason: 'denied' }
    }

    const result = await scanRootTodos(handle)
    const existing = new Set(
      useTasks
        .getState()
        .tasks.filter((t) => t.origin.kind === 'todo-file' && t.origin.refId)
        .map((t) => t.origin.refId!),
    )
    const inputs = toTodoTaskInputs(result.todos, existing)
    for (const input of inputs) await createTask(input)
    set(await reload())
    return {
      ok: true,
      added: inputs.length,
      skipped: result.todos.length - inputs.length,
      projects: result.projects.length,
      rootName: result.rootName,
    }
  },
}))

export { getTask }
