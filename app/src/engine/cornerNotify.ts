import { create } from 'zustand'
import { useNotifyHub } from './notifyCenter'

/**
 * 右下角完成通知（R 批用户需求：输出/处理的长任务返回结果后，右下角弹「已完成」，
 * 点击整卡跳回对应页面）。与右上角 toast 分工：toast = 即时反馈（几秒即逝）；
 * corner = 任务完成回执（停留更久、可点击跳转）。超时自动消失防堆积。
 */
export interface CornerEntry {
  id: string
  /** 完成事项标题 */
  title: string
  /** 补充说明（可选） */
  desc?: string
  /** 点击整卡跳回的页面路由 */
  to: string
  /** 跳转入口显示名 */
  actionLabel: string
}

interface CornerState {
  entries: CornerEntry[]
  notify: (n: Omit<CornerEntry, 'id'>) => void
  dismiss: (id: string) => void
}

/** 停留时长（毫秒）：比 toast 长——完成回执允许用户晚一点回来看 */
const CORNER_TTL = 12000

export const useCornerNotify = create<CornerState>((set, get) => ({
  entries: [],
  notify: (n) => {
    const id = `cn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    set((s) => ({ entries: [...s.entries.slice(-2), { id, ...n }] }))
    // 同步进通知中心历史：右下角弹完消失，铃铛里留底
    useNotifyHub.getState().push({ kind: 'done', title: n.title, desc: n.desc, to: n.to })
    setTimeout(() => get().dismiss(id), CORNER_TTL)
  },
  dismiss: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
}))

/** 函数式入口（非组件上下文用，如页面任务完成回调） */
export function cornerNotify(n: Omit<CornerEntry, 'id'>): void {
  useCornerNotify.getState().notify(n)
}
