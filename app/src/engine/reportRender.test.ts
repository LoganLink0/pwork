import { describe, expect, it } from 'vitest'
import { reportToHtml, reportToMarkdown, reportTitle } from './reportRender'
import type { ReportData } from './reportData'

function mkData(over: Partial<ReportData> = {}): ReportData {
  return {
    mode: 'weekly',
    rangeLabel: '近 7 天 · 至 2026-09-06',
    sinceLocal: '2026-08-31',
    today: '2026-09-06',
    tasks: {
      closed: [{ title: '完成任务甲', closedAt: '2026-09-02T08:00:00.000Z' }],
      openCount: 2,
      overdueCount: 1,
      closureRate: 33,
    },
    goals: { active: [{ title: '完成周复盘闭环验证', due: '2026-09-06' }], doneInRange: 0 },
    insights: [{ text: '外部机会要进 SWOT 才能变成策略' }],
    topItems: [{ title: 'AI 周刊', url: 'https://e.com/1', score: 82, sourceName: '阮一峰', otFlag: 'opportunity' }],
    reviews: { count: 1, titles: ['日复盘 · 2026/9/1'] },
    notesCount: 4,
    signals: [{ kind: 'review-due', message: '距上次复盘已经 7 天' }],
    ...over,
  }
}

describe('reportToMarkdown（输出 O1）', () => {
  it('五大板块齐全，数据正确嵌入', () => {
    const md = reportToMarkdown(mkData())
    expect(md).toContain('# PWORK 周报（近 7 天 · 至 2026-09-06）')
    expect(md).toContain('闭环率 **33%**')
    expect(md).toContain('✅ 完成任务甲')
    expect(md).toContain('◎ 完成周复盘闭环验证（期限 2026-09-06）')
    expect(md).toContain('💡 外部机会要进 SWOT 才能变成策略')
    expect(md).toContain('[AI 周刊](https://e.com/1)（评分 82 · 阮一峰）')
    expect(md).toContain('⚡ 距上次复盘已经 7 天')
  })

  it('空数据 → 各板块优雅占位', () => {
    const md = reportToMarkdown(mkData({ insights: [], topItems: [], tasks: { closed: [], openCount: 0, overdueCount: 0, closureRate: 0 } }))
    expect(md).toContain('（本期没有任务记录）')
    expect(md).toContain('（本期没有新洞察卡）')
    expect(md).toContain('（本期没有高分信息条目）')
  })

  it('月报标题正确', () => {
    expect(reportTitle({ ...mkData(), mode: 'monthly' })).toContain('月报')
  })
})

describe('reportToHtml（自包含 HTML）', () => {
  it('统计卡与板块渲染，HTML 转义生效', () => {
    const html = reportToHtml(mkData({ tasks: { closed: [{ title: '<b>注入</b>', closedAt: '2026-09-02T00:00:00.000Z' }], openCount: 0, overdueCount: 0, closureRate: 100 } }))
    expect(html).toContain('100%')
    expect(html).toContain('&lt;b&gt;注入&lt;/b&gt;')
    expect(html).not.toContain('<b>注入</b>')
    expect(html).toContain('任务闭环率')
  })
})
