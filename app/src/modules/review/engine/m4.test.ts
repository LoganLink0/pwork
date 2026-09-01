import { beforeEach, describe, expect, it } from 'vitest'
import { applyTheme, loadTheme } from './appearance'
import { collectReminders, remindersEnabled, disableReminders } from './reminders'
import { buildMonthlyReport } from './report'
import { emptyClap, type InsightRecord, type ReviewRecord } from '../types/models'

const DAY = 24 * 60 * 60 * 1000

function makeInsight(partial: Partial<InsightRecord>): InsightRecord {
  return {
    id: 'ins_t',
    reviewId: 'rev_t',
    text: '测试认知',
    tags: [],
    kind: 'inductive',
    verified: false,
    patternGroup: 't',
    createdAt: new Date().toISOString(),
    revisit: [],
    ...partial,
  }
}

describe('外观主题', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })

  it('深色：写入 data-theme 与偏好', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(loadTheme()).toBe('dark')
  })

  it('浅色与自动：auto 时移除 data-theme 交给系统', () => {
    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    applyTheme('auto')
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(loadTheme()).toBe('auto')
  })

  it('无偏好时默认跟随系统', () => {
    expect(loadTheme()).toBe('auto')
  })
})

describe('提醒收集', () => {
  const now = new Date('2026-08-29T10:00:00')

  it('逾期 / 今日到期 / 回访到期分别产生提醒；正常项不产生', () => {
    const actions = [
      { id: 'a1', reviewId: 'r', kind: 'start' as const, text: '逾期的事', due: '2026-08-27', status: 'open' as const, closedAt: null },
      { id: 'a2', reviewId: 'r', kind: 'stop' as const, text: '今天到期的事', due: '2026-08-29', status: 'open' as const, closedAt: null },
      { id: 'a3', reviewId: 'r', kind: 'continue' as const, text: '未来的事', due: '2026-09-15', status: 'open' as const, closedAt: null },
      { id: 'a4', reviewId: 'r', kind: 'start' as const, text: '已完成的逾期事', due: '2026-08-01', status: 'done' as const, closedAt: null },
      { id: 'a5', reviewId: 'r', kind: 'start' as const, text: '无期限', status: 'open' as const, closedAt: null },
    ]
    const insights = [
      makeInsight({ id: 'i1', text: '八天前沉淀', createdAt: new Date(now.getTime() - 8 * DAY).toISOString() }),
      makeInsight({ id: 'i2', text: '刚沉淀', createdAt: now.toISOString() }),
    ]
    const list = collectReminders(actions, insights, now)
    expect(list.map((r) => r.kind)).toEqual(['action-overdue', 'action-due-today', 'insight-revisit'])
    expect(list[0].body).toContain('逾期的事')
    expect(list[2].body).toContain('八天前沉淀')
  })

  it('空数据不产生提醒；提醒开关默认关闭', () => {
    expect(collectReminders([], [], now)).toEqual([])
    expect(remindersEnabled()).toBe(false)
    disableReminders()
    expect(remindersEnabled()).toBe(false)
  })
})

describe('月度 HTML 报告', () => {
  const now = '2026-08-15T10:00:00.000Z'

  function makeReview(id: string, createdAt = now): ReviewRecord {
    const clap = emptyClap()
    clap.project.actions = [
      { kind: 'start', text: '一件事', confidence: 2 },
    ]
    return {
      id,
      type: 'personal',
      scenario: 'weekly',
      templateId: 'personal-weekly',
      title: `${id} 的周复盘`,
      createdAt,
      updatedAt: createdAt,
      status: 'archived',
      quick: false,
      clap,
      summary: ['小结一', '小结二'],
    }
  }

  it('包含月份、统计与本月的复盘与洞察', () => {
    const html = buildMonthlyReport({
      month: '2026-08',
      reviews: [makeReview('r1'), makeReview('r2', '2026-07-01T00:00:00.000Z')],
      insights: [makeInsight({ id: 'i1', text: '先说结论', createdAt: now })],
      actions: [
        { id: 'a1', reviewId: 'r1', kind: 'start', text: 'x', status: 'done', closedAt: null },
        { id: 'a2', reviewId: 'r1', kind: 'stop', text: 'y', status: 'open', closedAt: null },
      ],
    })
    expect(html).toContain('复盘月报 · 2026-08')
    expect(html).toContain('<strong>1</strong> 份复盘')
    expect(html).toContain('r1 的周复盘')
    expect(html).not.toContain('r2 的周复盘')
    expect(html).toContain('先说结论')
    expect(html).toContain('50%')
    expect(html).toContain('<!doctype html>')
  })

  it('空月份给出诚实的占位文案；HTML 转义用户文本', () => {
    const html = buildMonthlyReport({
      month: '2026-07',
      reviews: [makeReview('r3')],
      insights: [],
      actions: [],
    })
    expect(html).toContain('本月还没有复盘档案')
    const xss = buildMonthlyReport({
      month: '2026-07',
      reviews: [{ ...makeReview('r4', '2026-07-20T00:00:00.000Z'), title: '<script>alert(1)</script>' }],
      insights: [],
      actions: [],
    })
    expect(xss).not.toContain('<script>alert(1)</script>')
    expect(xss).toContain('&lt;script&gt;')
  })
})
