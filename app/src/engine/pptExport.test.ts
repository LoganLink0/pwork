import { describe, expect, it } from 'vitest'
import { buildReportSlides } from './pptExport'
import type { ReportSnapshot } from '../types/models'
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
    blocks: [],
    ...over,
  }
}

/** 幻灯片规格（纯函数）：PPT 渲染前的数据契约 */
describe('buildReportSlides', () => {
  it('外部数据块：每块追加一页（bullets），无内容块跳过', () => {
    const d = mkData({
      blocks: [
        { title: '销售周数据', kv: [{ k: '新增线索', v: '23' }], text: [] },
        { title: '空块', kv: [], text: [] },
      ],
    })
    const s = buildReportSlides(d)
    const blockSlide = s.find((x) => x.title === '销售周数据')
    expect(blockSlide).toBeDefined()
    expect(blockSlide!.kind).toBe('bullets')
    expect(blockSlide!.bullets).toEqual(['新增线索：23'])
    expect(s.find((x) => x.title === '空块')).toBeUndefined()
  })

  it('快照 ≥2 时插入趋势图表页（第 2 页），共 8 页', () => {
    const snaps: ReportSnapshot[] = [
      { id: 'snap_2026-08-25', day: '2026-08-25', closureRate: 20, closedCount: 2, openCount: 3, overdueCount: 0, goalsActive: 1, insightsCount: 2, notesCount: 5, createdAt: '2026-08-25T00:00:00.000Z' },
      { id: 'snap_2026-09-01', day: '2026-09-01', closureRate: 45, closedCount: 5, openCount: 2, overdueCount: 1, goalsActive: 1, insightsCount: 4, notesCount: 9, createdAt: '2026-09-01T00:00:00.000Z' },
    ]
    const s = buildReportSlides(mkData(), snaps)
    expect(s).toHaveLength(8)
    expect(s[1]!.kind).toBe('chart')
    expect(s[1]!.chart!.labels).toEqual(['08-25', '09-01'])
    expect(s[1]!.chart!.values).toEqual([20, 45])
  })

  it('封面与结尾为深色页（三明治结构）', () => {
    const s = buildReportSlides(mkData())
    expect(s[0]!.dark).toBe(true)
    expect(s[s.length - 1]!.dark).toBe(true)
    expect(s.slice(1, -1).every((x) => !x.dark)).toBe(true)
  })

  it('标题页 + 数据页 + 四个 bullets 页 + 结尾，顺序正确（无快照时 7 页）', () => {
    const s = buildReportSlides(mkData())
    expect(s).toHaveLength(7)
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
      '谢谢观看',
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
