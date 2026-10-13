/**
 * 轻通知 store（2026-10-13 用户要求：操作结果/报错像通知一样出现在页面右上角）。
 * 与 ErrorBar 的分工：ErrorBar = 程序错误（崩溃级红条置顶）；Toast = 操作反馈
 * （成功提示、可自行处理的服务端报错），右上角浮出、自动消失、可手动关。
 * store 放 engine（与 useErrorBar 同层）：任何模块（含非组件上下文）都能发通知。
 */
import { create } from 'zustand'

export interface ToastEntry {
  id: string
  kind: 'info' | 'ok' | 'error'
  text: string
}

interface ToastState {
  toasts: ToastEntry[]
  push: (kind: ToastEntry['kind'], text: string) => void
  dismiss: (id: string) => void
}

/** 自动消失时长：错误给足阅读时间，成功提示短一些 */
export const TOAST_TTL: Record<ToastEntry['kind'], number> = { error: 8000, ok: 3500, info: 5000 }

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, text) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, kind, text }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, TOAST_TTL[kind])
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** 发通知的函数式入口（非组件上下文用） */
export function toast(kind: ToastEntry['kind'], text: string): void {
  useToast.getState().push(kind, text)
}
