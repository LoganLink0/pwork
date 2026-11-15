import { describe, expect, it } from 'vitest'
import { LexicalRelated } from './related'
import type { Note } from '../../../types/models'

function note(partial: Partial<Note>): Note {
  return {
    id: partial.id ?? 'n_x',
    title: partial.title ?? '',
    body: partial.body ?? '',
    tags: partial.tags ?? [],
    links: { items: [], reviews: [], actions: [] },
    source: 'manual',
    createdAt: '2026-11-15T00:00:00.000Z',
    updatedAt: '2026-11-15T00:00:00.000Z',
    deletedAt: null,
    ...partial,
  } as Note
}

const engine = new LexicalRelated()

describe('LexicalRelated（词法关联）', () => {
  it('至少 2 个不同词命中才入选（中文 2-gram 假关联门槛）', () => {
    const pool = [note({ id: 'a', title: '产品经理复盘', body: '需求评审的流程笔记' })]
    // 只有一个词「产品」命中标题——单词命中不入选
    const one = engine.related('产品', pool, 5)
    expect(one).toHaveLength(0)
    // 「产品」+「复盘」双词命中
    const two = engine.related('产品复盘怎么写', pool, 5)
    expect(one.length).toBe(0)
    expect(two.length).toBe(1)
    expect(two[0].id).toBe('a')
    expect(two[0].why.length).toBeGreaterThanOrEqual(2)
  })

  it('按候选文档长度归一：短文与长文同等相关度时分接近', () => {
    const shortDoc = note({ id: 's', title: '增长会议纪要', body: '讨论了增长实验的结果与下一步。' })
    const longDoc = note({
      id: 'l',
      title: '增长专题：从获客到留存的全链路复盘纪要',
      body: '增长会议纪要。'.repeat(60) + '增长实验、增长曲线、增长团队分工均已在文中覆盖。',
    })
    const [hs, hl] = engine.related('增长会议', [shortDoc, longDoc], 2)
    // 长文命中词更多但被长度归一压回——分差远小于未归一的原始差
    expect(hl.score).toBeGreaterThan(0)
    expect(hs.score / hl.score).toBeLessThan(8)
  })

  it('标签命中参与计分（词是标签子串）', () => {
    const pool = [note({ id: 't', title: '随便记一笔', body: '今天天气不错。', tags: ['产品经理'] })]
    const r = engine.related('产品经理要做哪些准备', pool, 3)
    expect(r).toHaveLength(1)
    expect(r[0].why).toContain('产品')
  })

  it('limit 生效且排序按分降序', () => {
    const pool = [
      note({ id: 'mid', title: '实验记录', body: '复盘笔记。' }),
      note({ id: 'high', title: '增长实验数据汇总', body: '复盘完成。' }),
      note({ id: 'none', title: '无关内容', body: '食谱与旅行。' }),
    ]
    const r = engine.related('增长实验复盘数据', pool, 2)
    expect(r).toHaveLength(2)
    expect(r[0].id).toBe('high') // 三词标题命中，分最高
    expect(r[1].id).toBe('mid')
    expect(r[0].score).toBeGreaterThan(r[1].score)
    // limit=1 只留最高
    expect(engine.related('增长实验复盘数据', pool, 1)).toHaveLength(1)
  })

  it('空问句/空词表返回空', () => {
    expect(engine.related('', [note({ id: 'a', title: '增长', body: '增长' })], 3)).toHaveLength(0)
    expect(engine.related('！！！', [note({ id: 'a', title: '增长', body: '增长' })], 3)).toHaveLength(0)
  })
})
