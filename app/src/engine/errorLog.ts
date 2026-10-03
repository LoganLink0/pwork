/**
 * 错误日志系统（2026-10 用户要求：一旦出错立即暴露，并记录"哪里发生了什么"供迭代）。
 *
 * 分工：
 * - recordError：写 IndexedDB errorLog 表（上限 300 条，最旧先删——日志属 Raw 暂存层，物理清理合规）；
 * - useErrorBar：任何 recordError 立刻顶出红色错误条（"立即崩溃"= 不可能没注意到，但不白屏——
 *   白屏会让人读不到日志）；
 * - installErrorCapture：接管 window error / unhandledrejection；应用加载前（index.html 内联钩子）
 *   的单槽记录在启动时搬运入库，不丢引导期错误；
 * - track：给 fire-and-forget 调用兜底——`void load()` 一律改 `track(load(), 'App 挂载')`，
 *   拒绝静默吞错。
 */
import { create } from 'zustand'
import { db } from '../db/schema'
import { newId } from '../db/repo'
import type { ErrorLogEntry } from '../types/models'

const MAX_ROWS = 300
const MAX_STACK = 2000
const MAX_DETAIL = 800
/** index.html 内联钩子的单槽键——保留兼容（它在我们加载前就已在记录） */
const LASTERR_KEY = '__pwork-lasterr'
const LASTERR_COPIED_KEY = '__pwork-lasterr-copied'

export type ErrorKind = 'render' | 'promise' | 'window' | 'app'

export interface RecordInput {
  where: string
  kind: ErrorKind
  message: string
  stack?: string
  detail?: unknown
}

/* ---------- 错误条（立即暴露的可见层） ---------- */

interface ErrorBarState {
  entry: ErrorLogEntry | null
  show: (e: ErrorLogEntry) => void
  dismiss: () => void
}

export const useErrorBar = create<ErrorBarState>((set) => ({
  entry: null,
  show: (entry) => set({ entry }),
  dismiss: () => set({ entry: null }),
}))

/* ---------- 记录 ---------- */

function clip(s: string | undefined, max: number): string | undefined {
  if (!s) return undefined
  return s.length > max ? `${s.slice(0, max)}…（已截断）` : s
}

function stringifyDetail(d: unknown): string | undefined {
  if (d === undefined || d === null) return undefined
  try {
    return clip(typeof d === 'string' ? d : JSON.stringify(d), MAX_DETAIL)
  } catch {
    return clip(String(d), MAX_DETAIL)
  }
}

/** 记录一条错误：入库 + 顶出错误条。silent=true 只入库不弹条（历史搬运用）。
 *  本函数自身绝不抛错（错误系统不能制造新错误）。 */
export async function recordError(input: RecordInput, opts?: { silent?: boolean }): Promise<void> {
  const entry: ErrorLogEntry = {
    id: newId('err'),
    at: new Date().toISOString(),
    where: input.where,
    kind: input.kind,
    message: clip(input.message, 500) ?? '(空消息)',
    stack: clip(input.stack, MAX_STACK),
    detail: stringifyDetail(input.detail),
  }
  if (!opts?.silent) useErrorBar.getState().show(entry)
  try {
    await db.errorLog.put(entry)
    // 上限淘汰：最旧先删
    const count = await db.errorLog.count()
    if (count > MAX_ROWS) {
      const overflow = count - MAX_ROWS
      const oldest = await db.errorLog.orderBy('at').limit(overflow).primaryKeys()
      await db.errorLog.bulkDelete(oldest)
    }
  } catch {
    // IndexedDB 不可用（隐私模式降级）：退回单槽 localStorage，至少留一条线索
    try {
      localStorage.setItem(LASTERR_KEY, `[${entry.at}] ${entry.where}: ${entry.message}`)
    } catch {
      /* localStorage 也炸时放弃——错误条已经显示给用户了 */
    }
  }
}

/** fire-and-forget 的统一出口：吞错到此为止，全部入日志 */
export function track(p: Promise<unknown>, where: string): void {
  void p.catch((err: unknown) => {
    void recordError({
      where,
      kind: 'app',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
  })
}

/* ---------- 读取 / 清理（设置页查看器用） ---------- */

export async function listErrors(limit = 50): Promise<ErrorLogEntry[]> {
  return (await db.errorLog.orderBy('at').reverse().limit(limit).toArray()) ?? []
}

export async function clearErrors(): Promise<void> {
  await db.errorLog.clear()
}

export function formatErrorLog(entries: ErrorLogEntry[]): string {
  const kindLabel: Record<ErrorKind, string> = {
    render: '页面渲染崩溃',
    promise: '未处理的异步错误',
    window: '全局脚本错误',
    app: '应用内部错误',
  }
  const lines = ['# PWORK 错误日志', '', `导出时间：${new Date().toLocaleString('zh-CN')}`, `条数：${entries.length}`, '']
  for (const e of entries) {
    lines.push(`## ${e.at.replace('T', ' ').slice(0, 19)} · ${kindLabel[e.kind]} · ${e.where}`)
    lines.push('', `- 消息：${e.message}`)
    if (e.detail) lines.push(`- 上下文：${e.detail}`)
    if (e.stack) lines.push('', '```', e.stack, '```')
    lines.push('')
  }
  return lines.join('\n')
}

/* ---------- 全局捕获安装 ---------- */

function describeReason(reason: unknown): { message: string; stack?: string } {
  if (reason instanceof Error) return { message: reason.message, stack: reason.stack }
  return { message: String(reason) }
}

let captureInstalled = false

/** 应用启动时调用一次（main.tsx，渲染前）；幂等——重复调用不叠加监听器 */
export function installErrorCapture(): void {
  if (captureInstalled) return
  captureInstalled = true
  // ① 搬运引导期错误：index.html 的内联钩子先于一切代码运行，它的单槽记录复制入库。
  //    静默搬运——那是上次会话的历史，不该每次刷新都弹红条打扰当前会话。
  try {
    const boot = localStorage.getItem(LASTERR_KEY)
    if (boot && localStorage.getItem(LASTERR_COPIED_KEY) !== boot) {
      localStorage.setItem(LASTERR_COPIED_KEY, boot)
      void recordError({ where: '引导阶段（应用代码加载前）', kind: 'window', message: boot }, { silent: true })
    }
  } catch {
    /* localStorage 不可用就跳过搬运 */
  }

  // ② 全局脚本错误
  window.addEventListener('error', (e) => {
    const err = e.error
    void recordError({
      where: '全局脚本错误',
      kind: 'window',
      message: err instanceof Error ? err.message : e.message || '未知错误',
      stack: err instanceof Error ? err.stack : undefined,
      detail: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined,
    })
  })

  // ③ 未处理的 Promise 拒绝
  window.addEventListener('unhandledrejection', (e) => {
    const { message, stack } = describeReason(e.reason)
    void recordError({ where: '未处理的异步错误', kind: 'promise', message, stack })
  })
}
