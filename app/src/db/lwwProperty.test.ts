import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { merge } from './backup'
import { pickBlocks, ASK_TOTAL_BUDGET } from '../engine/askAi'

/**
 * 纯函数性质测试（PBT 起步批，2026-11-24 外部审核建议）：
 * 把「合并语义不丢数据」「预算截断不超限」从样例断言升级为性质断言——
 * 用 fast-check 随机生成数百组输入，断言在全部输入上成立的不变量。
 * 选取标准：纯函数、无时钟依赖、出错即数据损失（最高价值标的）。
 */

describe('LWW 合并性质（merge）', () => {
  /** 内存表实现：与 memory 后端同型的真实现（接口行为的确定性替身） */
  function memTable<T extends { id: string }>(rows: Map<string, T>) {
    return {
      async get(id: string) {
        return rows.get(id)
      },
      async put(v: T) {
        rows.set(v.id, v)
      },
    }
  }

  const recArb = fc.record({
    id: fc.string({ minLength: 1, maxLength: 8 }),
    updatedAt: fc.option(fc.string({ minLength: 20, maxLength: 30 }), { nil: undefined }),
    body: fc.string({ maxLength: 20 }),
  })

  it('合并结果恒为两侧 updatedAt 较新者（同时间保留本地）', async () => {
    await fc.assert(
      fc.asyncProperty(
        recArb,
        recArb,
        async (local, incoming) => {
          const localRec = { ...local, id: 'x' }
          const incomingRec = { ...incoming, id: 'x' }
          const rows = new Map([['x', localRec]])
          const table = memTable(rows)
          await merge(table, [incomingRec])
          const stored = rows.get('x')!
          const key = (r: { updatedAt?: string }) => r.updatedAt ?? ''
          if (key(incomingRec) > key(localRec)) expect(stored).toEqual(incomingRec)
          else expect(stored).toEqual(localRec) // 同时间或本地更新：保留本地
        },
      ),
      { numRuns: 300 },
    )
  })

  it('计数守恒：added + updated + skipped = 输入条数，且不产生未登记写入', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ id: fc.string({ minLength: 1, maxLength: 8 }), updatedAt: fc.option(fc.string(), { nil: undefined }) }), {
          maxLength: 30,
        }),
        async (incoming) => {
          const rows = new Map<string, { id: string; updatedAt?: string }>()
          const table = memTable(rows)
          const r = await merge(table, incoming)
          expect(r.added + r.updated + r.skipped).toBe(incoming.length)
          expect(rows.size).toBe(r.added + r.updated)
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe('pickBlocks 预算截断性质', () => {
  it('总长不超总预算、块编号连续、内容为原文前缀（超长加省略号）', async () => {
    const textArb = fc.string({ maxLength: 200 })
    await fc.assert(
      fc.property(fc.array(textArb, { maxLength: 40 }), fc.integer({ min: 50, max: ASK_TOTAL_BUDGET }), (texts, budget) => {
        const blocks = pickBlocks(texts, budget, 80)
        const used = blocks.reduce((n, b) => n + b.length, 0)
        expect(used).toBeLessThanOrEqual(budget)
        blocks.forEach((b, i) => {
          expect(b.startsWith(`[${i + 1}] `)).toBe(true) // 编号从 1 连续
        })
        for (let i = 0; i < blocks.length; i++) {
          const raw = texts.filter((t) => t) // 空文本跳过的语义在实现侧；此处只断前缀
          const body = blocks[i]!.slice(`[${i + 1}] `.length)
          const src = raw.find((t) => body === t || body === `${t.slice(0, 80)}…`)
          expect(src).toBeTruthy()
        }
      }),
      { numRuns: 300 },
    )
  })

  it('空输入返回空；预算为零返回空', () => {
    expect(pickBlocks([], 100)).toEqual([])
    expect(pickBlocks(['abc'], 0)).toEqual([])
    expect(pickBlocks(['', ''], 100)).toEqual([])
  })
})
