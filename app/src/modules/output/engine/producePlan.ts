/**
 * 成稿计划（2026-11-15 外部研读报告改动 1）：一键成稿的产物清单。
 * AI 只产出 title 与 focus（聚焦提示）；产物清单固定三种（周报/PPT/文章——三种都有
 * 真实引擎），「并发铺开」体现在执行阶段（LLM 调用串行、本地渲染并发）。
 * normalizePlan 字段白名单 + clamp：AI 返回的任何越界内容一律丢弃或截断。
 */
import { todayLocal } from '../../../engine/datetime'

export type AssetKind = 'report' | 'ppt' | 'article'

export interface AssetTask {
  id: string
  kind: AssetKind
  title: string
  status: 'pending' | 'running' | 'done' | 'failed'
  error?: string
  /** 产物文件名（done 后有） */
  fileName?: string
}

export interface ProducePlan {
  title: string
  /** 聚焦提示（LLM 产出的关注点；规则版为空） */
  focus: string
  tasks: AssetTask[]
}

/** 产物清单固定三种，顺序固定（kind → 默认标题） */
export const PLAN_KINDS: Array<{ kind: AssetKind; title: string }> = [
  { kind: 'report', title: '本周信息日报' },
  { kind: 'ppt', title: '本周回顾演示' },
  { kind: 'article', title: '本周文章草稿' },
]

/** 规则版计划（未配 AI / AI 失败的兜底）：标题带日期，三产物齐全 */
export function fallbackPlan(now: Date = new Date()): ProducePlan {
  return {
    title: `一键成稿 · ${todayLocal(now)}`,
    focus: '',
    tasks: PLAN_KINDS.map((p, i) => ({ id: `task-${i + 1}`, kind: p.kind, title: p.title, status: 'pending' as const })),
  }
}

const MAX_TITLE_LEN = 60
const MAX_FOCUS_LEN = 200

/** 白名单归一：AI 返回的 title/focus 截断；tasks 一律重建为固定三产物（不信任 AI 列表） */
export function normalizePlan(raw: unknown, now: Date = new Date()): ProducePlan {
  const base = fallbackPlan(now)
  if (raw === null || typeof raw !== 'object') return base
  const o = raw as { title?: unknown; focus?: unknown }
  const title = typeof o.title === 'string' ? o.title.trim().slice(0, MAX_TITLE_LEN) : ''
  const focus = typeof o.focus === 'string' ? o.focus.trim().slice(0, MAX_FOCUS_LEN) : ''
  return { ...base, title: title || base.title, focus }
}
