import { describe, expect, it } from 'vitest'
import { autoLayout, cyclePolarity, detectLoops, polarityMark, rootCandidates, CLD_VIEWBOX } from './cld'
import type { CldEdge, CldNode } from '../types/models'

const n = (id: string, label = id): CldNode => ({ id, label })
const e = (from: string, to: string, polarity: CldEdge['polarity'] = 'enhance'): CldEdge => ({
  id: `${from}_${to}_${polarity}`,
  from,
  to,
  polarity,
})

describe('回路检测', () => {
  it('发现三元环：Uber 式增长飞轮', () => {
    const nodes = [n('a', '更多司机'), n('b', '更快接客'), n('c', '更多需求')]
    const edges = [e('a', 'b'), e('b', 'c'), e('c', 'a')]
    const loops = detectLoops(nodes, edges)
    expect(loops).toHaveLength(1)
    expect([...loops[0]].sort()).toEqual(['a', 'b', 'c'])
  })

  it('无环图（DAG）不产生误报', () => {
    const nodes = [n('a'), n('b'), n('c')]
    const edges = [e('a', 'b'), e('b', 'c')]
    expect(detectLoops(nodes, edges)).toEqual([])
  })

  it('同一环从不同起点被发现时去重（旋转不重复计）', () => {
    const nodes = [n('a'), n('b')]
    const edges = [e('a', 'b'), e('b', 'a')]
    expect(detectLoops(nodes, edges)).toHaveLength(1)
  })

  it('两个独立环都能被发现', () => {
    const nodes = [n('a'), n('b'), n('c'), n('d')]
    const edges = [e('a', 'b'), e('b', 'a'), e('c', 'd'), e('d', 'c')]
    const loops = detectLoops(nodes, edges)
    expect(loops).toHaveLength(2)
  })
})

describe('极性判定', () => {
  it('环上无减弱关系 → 同向增强（reinforcing）', () => {
    const cycle = ['a', 'b', 'c']
    const edges = [e('a', 'b'), e('b', 'c'), e('c', 'a')]
    expect(cyclePolarity(cycle, edges)).toBe('reinforcing')
  })

  it('环上有奇数个减弱关系 → 存在制衡（balancing）', () => {
    const cycle = ['a', 'b', 'c']
    const edges = [e('a', 'b'), e('b', 'c'), e('c', 'a', 'inhibit')]
    expect(cyclePolarity(cycle, edges)).toBe('balancing')
  })

  it('偶数个减弱关系回到增强', () => {
    const cycle = ['a', 'b']
    const edges = [e('a', 'b', 'inhibit'), e('b', 'a', 'inhibit')]
    expect(cyclePolarity(cycle, edges)).toBe('reinforcing')
  })
})

describe('根因候选排名', () => {
  it('参与环且出口多于入口的节点排在前（课程：入口少出口多是因）', () => {
    const nodes = [n('a'), n('b'), n('x')]
    // a 出 2 入 1（score 1）；b 出 1 入 1（score 0）；x 不在环上
    const edges = [e('a', 'b'), e('b', 'a'), e('a', 'x')]
    const ranked = rootCandidates(nodes, edges)
    expect(ranked[0].nodeId).toBe('a')
    expect(ranked[0].score).toBe(1)
    expect(ranked.some((c) => c.nodeId === 'x')).toBe(false)
  })

  it('已确认的根因在平分时排前', () => {
    const nodes = [n('a'), n('b')]
    const edges = [e('a', 'b'), e('b', 'a')]
    const confirmed = nodes.map((nd) => (nd.id === 'b' ? { ...nd, rootCause: true } : nd))
    const ranked = rootCandidates(confirmed, edges)
    expect(ranked.find((c) => c.nodeId === 'b')?.confirmed).toBe(true)
  })
})

describe('自动布局', () => {
  it('环上节点落在圆周上，环外节点在下方区域，全部有坐标', () => {
    const nodes = [n('a'), n('b'), n('c'), n('x')]
    const loops = [{ id: 'l1', nodeIds: ['a', 'b', 'c'], kind: 'reinforcing' as const, label: '飞轮' }]
    const pos = autoLayout(nodes, loops)
    expect(Object.keys(pos)).toHaveLength(4)
    const cx = CLD_VIEWBOX.w / 2
    for (const id of ['a', 'b', 'c']) {
      const d = Math.hypot(pos[id].x - cx, pos[id].y - 200)
      expect(d).toBeCloseTo(150, -1) // 半径 150（容差 10）
    }
    expect(pos.x.y).toBeGreaterThan(300)
  })
})

describe('极性符号', () => {
  it('+ / − / ⏱', () => {
    expect(polarityMark('enhance')).toBe('+')
    expect(polarityMark('inhibit')).toBe('−')
    expect(polarityMark('delay')).toBe('⏱')
  })
})

import { clampPosition, resolvePositions } from './cld'
import type { CldLoop } from '../types/models'

describe('位置解析（v2 拖拽白板）', () => {
  const nodes = [n('a'), n('b'), n('x')]
  const loops: CldLoop[] = [
    { id: 'l1', nodeIds: ['a', 'b'], kind: 'reinforcing', label: '环' },
  ]

  it('无自定义坐标时回落到自动布局', () => {
    const pos = resolvePositions(nodes, loops)
    expect(pos.a).toBeDefined()
    expect(pos.x).toBeDefined()
  })

  it('自定义坐标（用户拖拽过）优先于自动布局', () => {
    const custom = nodes.map((nd) => (nd.id === 'a' ? { ...nd, x: 500, y: 400 } : nd))
    const pos = resolvePositions(custom, loops)
    expect(pos.a).toEqual({ x: 500, y: 400 })
    // b 仍走自动布局
    expect(pos.b.x).not.toBe(500)
  })

  it('拖拽坐标被夹取到画布安全区', () => {
    expect(clampPosition(-50, -50)).toEqual({ x: 80, y: 28 })
    expect(clampPosition(9999, 9999)).toEqual({ x: 720, y: 490 })
  })
})

import { CLD_TEMPLATES } from '../content/cld-templates'

describe('CLD 模板库（先僵化，后优化）', () => {
  it('三个模板都有效：节点齐全、回路可被检测到', () => {
    for (const tpl of CLD_TEMPLATES) {
      expect(tpl.graph.nodes.length).toBeGreaterThanOrEqual(4)
      const loops = detectLoops(tpl.graph.nodes, tpl.graph.edges)
      expect(loops.length).toBeGreaterThanOrEqual(1)
      expect(tpl.graph.loops.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('模板 id 唯一', () => {
    const ids = CLD_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
