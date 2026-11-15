import { describe, expect, it } from 'vitest'
import { fallbackPlan, normalizePlan } from './producePlan'

describe('producePlan（成稿计划）', () => {
  it('规则版计划：三产物齐全且 pending', () => {
    const p = fallbackPlan(new Date('2026-11-15T10:00:00'))
    expect(p.title).toContain('2026-11-15')
    expect(p.tasks.map((t) => t.kind)).toEqual(['report', 'ppt', 'article'])
    expect(p.tasks.every((t) => t.status === 'pending')).toBe(true)
  })

  it('normalizePlan 白名单：只取 title/focus，tasks 一律重建（不信任 AI 列表）', () => {
    const p = normalizePlan(
      { title: '  增长周报  ', focus: '突出实验数据', tasks: [{ id: 'x', kind: 'hacker', title: '越界产物' }] },
      new Date('2026-11-15T10:00:00'),
    )
    expect(p.title).toBe('增长周报')
    expect(p.focus).toBe('突出实验数据')
    expect(p.tasks.map((t) => t.kind)).toEqual(['report', 'ppt', 'article'])
  })

  it('normalizePlan clamp：超长 title/focus 截断', () => {
    const p = normalizePlan({ title: '长'.repeat(200), focus: '聚'.repeat(500) }, new Date())
    expect(p.title.length).toBeLessThanOrEqual(60)
    expect(p.focus.length).toBeLessThanOrEqual(200)
  })

  it('非对象/空 title 走兜底标题', () => {
    expect(normalizePlan(null, new Date()).title).toContain('一键成稿')
    expect(normalizePlan({ title: '   ' }, new Date()).title).toContain('一键成稿')
    expect(normalizePlan('string', new Date()).tasks).toHaveLength(3)
  })
})
