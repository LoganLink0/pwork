import { useCallback, useEffect, useRef, useState } from 'react'
import { clampPosition, polarityMark, resolvePositions, type NodePos } from '../../engine/cld'
import type { CldEdge, CldGraph, CldLoop } from '../../types/models'

const VIEW_W = 800
const VIEW_H = 520

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}

interface CldCanvasProps {
  graph: CldGraph
  /** v2：PC 端拖拽回调（pointerup 时持久化）。未传则为静态渲染（帮助页） */
  onMoveNode?: (id: string, x: number, y: number) => void
}

/**
 * 因果循环图画布 v2 —— 混合层渲染：
 * SVG 层画边线（与节点同坐标系，百分比定位天然对齐），HTML 层画节点（拖拽/文本更好做）。
 * 拖拽仅响应鼠标（pointerType === 'mouse'），触屏保持列表交互；坐标持久化由 onMoveNode 完成。
 */
export function CldCanvas({ graph, onMoveNode }: CldCanvasProps) {
  const { nodes, edges, loops } = graph
  const boardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; startClientX: number; startClientY: number; orig: NodePos; scale: number } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [positions, setPositions] = useState<Record<string, NodePos>>(() => resolvePositions(nodes, loops))

  // 外部数据变化（加节点/切模板/整理布局）时重同步位置
  useEffect(() => {
    setPositions(resolvePositions(nodes, loops))
    // 位置随图结构整体刷新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, loops])

  const beginDrag = useCallback(
    (e: React.PointerEvent, id: string) => {
      if (!onMoveNode) return
      const rect = boardRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return
      const pos = positions[id]
      if (!pos) return
      dragRef.current = {
        id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        orig: pos,
        scale: VIEW_W / rect.width,
      }
      setDragId(id)
      const move = (ev: PointerEvent) => {
        const d = dragRef.current
        if (!d) return
        const dx = (ev.clientX - d.startClientX) * d.scale
        const dy = (ev.clientY - d.startClientY) * d.scale
        const next = clampPosition(d.orig.x + dx, d.orig.y + dy)
        setPositions((prev) => ({ ...prev, [d.id]: next }))
      }
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        const d = dragRef.current
        dragRef.current = null
        setDragId(null)
        if (!d) return
        const dx = (ev.clientX - d.startClientX) * d.scale
        const dy = (ev.clientY - d.startClientY) * d.scale
        const final = clampPosition(d.orig.x + dx, d.orig.y + dy)
        onMoveNode(d.id, final.x, final.y)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [positions, onMoveNode],
  )

  // ---------- 边线几何（SVG 坐标系） ----------
  const loopEdgeKeys = new Set<string>()
  for (const loop of loops) {
    for (let i = 0; i < loop.nodeIds.length; i++) {
      const from = loop.nodeIds[i]
      const to = loop.nodeIds[(i + 1) % loop.nodeIds.length]
      loopEdgeKeys.add(`${from}>${to}`)
    }
  }

  const edgePath = (edge: CldEdge) => {
    const p1 = positions[edge.from]
    const p2 = positions[edge.to]
    if (!p1 || !p2) return null
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const sx = p1.x + ux * 32
    const sy = p1.y + uy * 26
    const ex = p2.x - ux * 32
    const ey = p2.y - uy * 26
    const bend = Math.min(46, len * 0.18)
    const cxm = (sx + ex) / 2 - uy * bend
    const cym = (sy + ey) / 2 + ux * bend
    return {
      d: `M ${sx} ${sy} Q ${cxm} ${cym} ${ex} ${ey}`,
      mx: 0.25 * sx + 0.5 * cxm + 0.25 * ex,
      my: 0.25 * sy + 0.5 * cym + 0.25 * ey,
      inLoop: loopEdgeKeys.has(`${edge.from}>${edge.to}`),
    }
  }

  return (
    <div className="cld-board" ref={boardRef} style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="cld-edges" aria-hidden>
        <defs>
          <marker id="cld-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
            <path d="M0,0 L9,4.5 L0,9" fill="none" stroke="var(--ink-faint)" strokeWidth="1.6" />
          </marker>
          <marker id="cld-arrow-loop" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
            <path d="M0,0 L9,4.5 L0,9" fill="none" stroke="var(--accent-deep)" strokeWidth="1.8" />
          </marker>
        </defs>
        {edges.map((edge) => {
          const p = edgePath(edge)
          if (!p) return null
          return (
            <g key={edge.id}>
              <path
                d={p.d}
                fill="none"
                stroke={p.inLoop ? 'var(--accent-deep)' : 'var(--ink-faint)'}
                strokeWidth={p.inLoop ? 2.4 : 1.5}
                markerEnd={p.inLoop ? 'url(#cld-arrow-loop)' : 'url(#cld-arrow)'}
              />
              <circle cx={p.mx} cy={p.my} r="11" fill="var(--surface)" stroke="var(--line-strong)" />
              <text x={p.mx} y={p.my + 4.5} textAnchor="middle" fontSize="12" fill="var(--ink)">
                {polarityMark(edge.polarity)}
              </text>
            </g>
          )
        })}
        {loops.map((loop: CldLoop) => {
          const pts = loop.nodeIds.map((id) => positions[id]).filter(Boolean)
          if (pts.length === 0) return null
          const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
          const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
          return (
            <text key={loop.id} x={cx} y={cy - 8} textAnchor="middle" fontSize="13" fill="var(--accent-text)" fontWeight="700">
              {loop.label}
            </text>
          )
        })}
        {nodes.length === 0 && (
          <text x={VIEW_W / 2} y={VIEW_H / 2} textAnchor="middle" fontSize="14" fill="var(--ink-faint)">
            在上方添加节点后，回路图会出现在这里
          </text>
        )}
      </svg>

      {/* HTML 节点层：百分比定位与 SVG 坐标系线性对齐 */}
      {nodes.map((node) => {
        const p = positions[node.id]
        if (!p) return null
        return (
          <div
            key={node.id}
            className={`cld-node ${dragId === node.id ? 'cld-node--dragging' : ''} ${node.rootCause ? 'cld-node--root' : ''}`}
            style={{
              left: `${(p.x / VIEW_W) * 100}%`,
              top: `${(p.y / VIEW_H) * 100}%`,
            }}
            onPointerDown={(e) => beginDrag(e, node.id)}
            role="button"
            aria-label={`节点：${node.label}${node.rootCause ? '（根因）' : ''}`}
            title={onMoveNode ? '按住拖拽可调整位置' : node.label}
          >
            {node.rootCause ? '★ ' : ''}
            {truncate(node.label, 11)}
          </div>
        )
      })}
    </div>
  )
}
