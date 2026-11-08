/**
 * 确认弹层 store（2026-11-08 走查第三批）：替代 window.confirm——
 * 原生弹窗样式与应用割裂、后果说明无层级、移动端观感差。
 * 与 toast 同款惯例：store 放 engine（非组件上下文可调），宿主组件挂 App 壳。
 */
import { create } from 'zustand'

export interface ConfirmSpec {
  title: string
  /** 后果与可恢复性说明（第二行小字） */
  body?: string
  /** 危险动作（不可恢复/删除类）确认键显红 */
  danger?: boolean
  confirmLabel?: string
  cancelLabel?: string
}

interface ConfirmState {
  spec: ConfirmSpec | null
  open: (spec: ConfirmSpec, resolve: (ok: boolean) => void) => void
  settle: (ok: boolean) => void
}

let resolveFn: ((ok: boolean) => void) | null = null

export const useConfirmStore = create<ConfirmState>((set) => ({
  spec: null,
  open: (spec, resolve) => {
    resolveFn = resolve
    set({ spec })
  },
  settle: (ok) => {
    set({ spec: null })
    resolveFn?.(ok)
    resolveFn = null
  },
}))

/** 危险操作确认的函数式入口：await confirmDialog({ title, danger: true }) → boolean */
export function confirmDialog(spec: ConfirmSpec): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.getState().open(spec, resolve)
  })
}
