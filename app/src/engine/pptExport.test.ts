import { describe, expect, it } from 'vitest'
import { buildReportSlides } from './pptExport'
import type { ReportData } from './reportData'

function mkData(over: Partial<ReportData> = {}): ReportData {
  return {
    mode: 'weekly',
    rangeLabel: '近 7 天 · 至 2026-09-06',
    sinceLocal: '2026-08-31',
    today: '2026-09-06',
    tasks: { closed: [{ title: '完成任务甲', closedAt: '2026-09-02T00:00:00.000Z' }], openCount: 2, overdueCount: 1, closureRate: 33 },
    goals: { active: [{ title: '完成闭环验证', due: '2026-09-06' }], doneInRange: 1 },
    insights: [{ text: '洞察一' }, { text: '洞察二' }],
    topItems: [{ title: 'AI 周刊', url: 'https://e.com/1', score: 82, sourceName: '阮一峰', otFlag: null }],
    reviews: { count: 1, titles: [] },
    notesCount: 3,
    signals: [],
    ...over,
  }
}

/** 幻灯片规格（纯函数）：PPT 渲染前的数据契约 */
describe('buildReportSlides', () => {
  it('标题页 + 数据页 + 四个 bullets 页，共 6 页且顺序正确', () => {
    const s = buildReportSlides(mkData())
    expect(s).toHaveLength(6)
    expect(s[0]!.kind).toBe('title')
    expect(s[0]!.title).toBe('PWORK 周报')
    expect(s[1]!.kind).toBe('stats')
    expect(s[1]!.stats).toHaveLength(4)
    expect(s.map((x) => x.title)).toEqual([
      'PWORK 周报',
      '本期关键数字',
      '任务',
      '目标进展',
      '本周洞察',
      '外部环境（高分条目）',
    ])
  })

  it('bullets 内容与空值处理', () => {
    const s = buildReportSlides(mkData({ insights: [], topItems: [] }))
    const insight = s.find((x) => x.title === '本周洞察')!
    expect(insight.bullets).toHaveLength(0)
    const ext = s.find((x) => x.title === '外部环境（高分条目）')!
    expect(ext.bullets).toHaveLength(0)
  })

  it('月报标题正确', () => {
    const s = buildReportSlides(mkData({ mode: 'monthly' }))
    expect(s[0]!.title).toBe('PWORK 月报')
  })
})
