/**
 * 因果循环图引擎（课程 10 讲：圣吉《第五项修炼》系统思考）。
 * 三条课程规则的算法化：
 * ①回路检测——连线成环时自动高亮（"它是飞轮还是恶性循环？"）
 * ②极性判定——环上减弱关系为偶数则同向增强（飞轮/恶性由用户命名）
 * ③根因候选——"入口少出口多的，一般是因"（出度-入度排名），确认后打"没它不行"标记
 * 全部纯函数，不依赖 UI。
 */
import type { CldEdge, CldGraph, CldLoop, CldNode, CldPolarity } from '../types/models'

/** 节点上限保护：防止环检测在小图上指数爆炸 */
const MAX_PATH = 12

export function newGraph(): CldGraph {
  return { nodes: [], edges: [], loops: [] }
}

/* ------------------------------ 回路检测 ------------------------------ */

/** 找出全部初等环（按节点集合去重，旋转不重复计）；返回一条代表路径 */
export function detectLoops(nodes: CldNode[], edges: CldEdge[]): string[][] {
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to])
  }
  const ids = new Set(nodes.map((n) => n.id))
  const found = new Map<string, string[]>()

  const visit = (start: string, current: string, path: string[], onPath: Set<string>) => {
    if (path.length > MAX_PATH) return
    for (const next of adj.get(current) ?? []) {
      if (!ids.has(next)) continue
      if (next === start && path.length >= 2) {
        const key = [...path].sort().join('|')
        if (!found.has(key)) found.set(key, [...path])
        continue
      }
      if (onPath.has(next)) continue
      visit(start, next, [...path, next], new Set(onPath).add(next))
    }
  }

  for (const n of nodes) visit(n.id, n.id, [n.id], new Set([n.id]))
  return [...found.values()]
}

/** 环的极性：减弱关系为偶数 → 同向增强（飞轮/恶性由用户命名）；奇数 → 存在制衡 */
export function cyclePolarity(cycle: string[], edges: CldEdge[]): 'reinforcing' | 'balancing' {
  const key = (from: string, to: string) => `${from}>${to}`
  const polarity = new Map(edges.map((e) => [key(e.from, e.to), e.polarity]))
  let inhibits = 0
  for (let i = 0; i < cycle.length; i++) {
    const from = cycle[i]
    const to = cycle[(i + 1) % cycle.length]
    if (polarity.get(key(from, to)) === 'inhibit') inhibits++
  }
  return inhibits % 2 === 0 ? 'reinforcing' : 'balancing'
}

/** 环路径的中文串：A → B → C → A（供文案与导出复用） */
export function cyclePathLabel(cycle: string[], labelOf: (id: string) => string): string {
  return [...cycle, cycle[0]].map(labelOf).join(' → ')
}

/* ------------------------------ 根因候选 ------------------------------ */

export interface RootCandidate {
  nodeId: string
  label: string
  inLoop: boolean
  /** 出度 − 入度：越大越像"因"（课程：入口少出口多的，一般是因） */
  score: number
  /** 是否被用户确认为根因（"没它不行"） */
  confirmed: boolean
}

/** 参与任一环 且 出度>0 的节点参与排名，按"更像因"排序 */
export function rootCandidates(nodes: CldNode[], edges: CldEdge[]): RootCandidate[] {
  const out = new Map<string, number>()
  const inn = new Map<string, number>()
  for (const e of edges) {
    out.set(e.from, (out.get(e.from) ?? 0) + 1)
    inn.set(e.to, (inn.get(e.to) ?? 0) + 1)
  }
  const loops = detectLoops(nodes, edges)
  const loopNodeIds = new Set(loops.flat())
  return nodes
    .map((n) => ({
      nodeId: n.id,
      label: n.label,
      inLoop: loopNodeIds.has(n.id),
      score: (out.get(n.id) ?? 0) - (inn.get(n.id) ?? 0),
      confirmed: !!n.rootCause,
    }))
    .filter((c) => c.inLoop)
    .sort((a, b) => b.score - a.score || Number(b.confirmed) - Number(a.confirmed))
}

/* ------------------------------ 自动布局 ------------------------------ */

export interface NodePos {
  x: number
  y: number
}

export const CLD_VIEWBOX = { w: 800, h: 520 }

/** 环上节点排圆，环外节点排底部两行；确定性布局，白板拖拽留待 v2 */
export function autoLayout(nodes: CldNode[], loops: CldLoop[]): Record<string, NodePos> {
  const loopNodeIds = new Set(loops.flatMap((l) => l.nodeIds))
  const inLoop = nodes.filter((n) => loopNodeIds.has(n.id))
  const rest = nodes.filter((n) => !loopNodeIds.has(n.id))
  const pos: Record<string, NodePos> = {}
  const cx = CLD_VIEWBOX.w / 2
  const cy = 200
  const R = Math.max(150, 60 + inLoop.length * 14)

  // 环上顺序：优先按已存回路的顺序，否则按录入顺序
  const order: string[] = []
  const seen = new Set<string>()
  for (const loop of loops) {
    for (const id of loop.nodeIds) {
      if (!seen.has(id) && inLoop.some((n) => n.id === id)) {
        order.push(id)
        seen.add(id)
      }
    }
  }
  for (const n of inLoop) {
    if (!seen.has(n.id)) order.push(n.id)
  }
  order.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / Math.max(order.length, 1) - Math.PI / 2
    pos[id] = { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) }
  })

  const colCount = 4
  rest.forEach((n, i) => {
    const col = i % colCount
    const row = Math.floor(i / colCount)
    pos[n.id] = { x: 90 + col * 200, y: 392 + row * 62 }
  })
  return pos
}

/** 极性符号：+ / − / ⏱ */
export function polarityMark(p: CldPolarity): string {
  return p === 'enhance' ? '+' : p === 'inhibit' ? '−' : '⏱'
}

/* ------------------------------ 位置解析（v2 拖拽白板） ------------------------------ */

/**
 * 自定义坐标（node.x/y，用户拖拽过）优先，其余回落到自动布局。
 * CldCanvas 据此渲染；"整理布局" = 清空全部 x/y。
 */
export function resolvePositions(nodes: CldNode[], loops: CldLoop[]): Record<string, NodePos> {
  const auto = autoLayout(nodes, loops)
  const pos: Record<string, NodePos> = {}
  for (const n of nodes) {
    pos[n.id] = typeof n.x === 'number' && typeof n.y === 'number' ? { x: n.x, y: n.y } : auto[n.id]
  }
  return pos
}

/** 拖拽位移换算：屏幕像素 → 图坐标，并夹取到画布安全区 */
export function clampPosition(x: number, y: number): NodePos {
  const padX = 80
  const padTop = 28
  const padBottom = 30
  return {
    x: Math.min(CLD_VIEWBOX.w - padX, Math.max(padX, x)),
    y: Math.min(CLD_VIEWBOX.h - padBottom, Math.max(padTop, y)),
  }
}
