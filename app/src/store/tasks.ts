import { create } from 'zustand'
import {
  createTask,
  getTask,
  listTasks,
  setTaskStatus,
  dueStats,
  type CreateTaskInput,
} from '../db/tasksRepo'
import type { TaskItem } from '../types/models'

export interface DueStats {
  today: number
  week: number
  open: number
  done: number
  total: number
}

/** 任务库状态（Zustand）：列表 + 到期统计（首页瓦片/侧边栏共用） */
interface TasksState {
  tasks: TaskItem[]
  stats: DueStats
  loaded: boolean
  load: () => Promise<void>
  create: (input: CreateTaskInput) => Promise<TaskItem>
  setStatus: (id: string, status: TaskItem['status']) => Promise<void>
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
}))

export { getTask }
