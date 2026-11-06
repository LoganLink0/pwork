import { create } from 'zustand'

/**
 * 通知中心（WorkBuddy 学习批，2026-11-06）：右下角完成通知弹完就没，
 * 系统提醒（待办到期/复盘节奏/日报就绪）发过也找不到——这里统一留一份
 * 历史清单（localStorage，上限 50 条最旧先删），侧栏铃铛带未读数。
 * 面板打开即全部已读。
 */
export type NotifyKind = 'done' | 'remind' | 'system'

export interface NotifyItem {
  id: string
  kind: NotifyKind
  title: string
  desc?: string
  /** 可点击跳转的页面路由（完成回执类有） */
  to?: string
  ts: number
  read: boolean
}

const STORE_KEY = 'pwork-notify-hub'
const MAX_ITEMS = 50

interface NotifyHubState {
  items: NotifyItem[]
  panelOpen: boolean
  push: (n: { kind: NotifyKind; title: string; desc?: string; to?: string }) => void
  markRead: (id: string) => void
  markAllRead: () => void
  clear: () => void
  setOpen: (open: boolean) => void
}

function load(): NotifyItem[] {
  try {
    const v = localStorage.getItem(STORE_KEY)
    return v ? (JSON.parse(v) as NotifyItem[]) : []
  } catch {
    return []
  }
}

function persist(items: NotifyItem[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)))
  } catch {
    // 存储满等异常静默跳过：通知历史丢了不影响主流程
  }
}

export const useNotifyHub = create<NotifyHubState>((set) => ({
  items: load(),
  panelOpen: false,
  push: (n) =>
    set((s) => {
      const items = [
        {
          id: `nh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          ts: Date.now(),
          read: false,
          ...n,
        },
        ...s.items,
      ].slice(0, MAX_ITEMS)
      persist(items)
      return { items }
    }),
  markRead: (id) =>
    set((s) => {
      const items = s.items.map((it) => (it.id === id ? { ...it, read: true } : it))
      persist(items)
      return { items }
    }),
  markAllRead: () =>
    set((s) => {
      const items = s.items.map((it) => ({ ...it, read: true }))
      persist(items)
      return { items }
    }),
  clear: () => {
    persist([])
    set({ items: [] })
  },
  setOpen: (panelOpen) => set({ panelOpen }),
}))

/** 未读条数（派生） */
export function unreadCount(items: NotifyItem[]): number {
  return items.filter((it) => !it.read).length
}
