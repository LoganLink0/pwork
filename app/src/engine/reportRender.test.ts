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
    blocks: [],
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

  it('条目标题的中括号被转义，链接劫持注入不成立', () => {
    const md = reportToMarkdown(mkData({ topItems: [
      { title: 'AI 周刊](https://evil.com', url: 'https://e.com/1', score: 80, sourceName: '阮一峰', otFlag: null },
    ] }))
    expect(md).toContain('AI 周刊\\](https://evil.com')
    expect(md).not.toMatch(/\[AI 周刊\]\(https:\/\/evil\.com\)/)
  })

  it('条目 url 只放行 http(s)：javascript: 与含引号的 URL 降级为纯文本', () => {
    const md = reportToMarkdown(mkData({ topItems: [
      { title: '正常', url: 'https://a.com/x', score: 70, sourceName: '源甲', otFlag: null },
      { title: '脚本', url: 'javascript:alert(1)', score: 69, sourceName: '源乙', otFlag: null },
      { title: '断引号', url: 'https://a.com/x" onmouseover="alert(1)', score: 68, sourceName: '源丙', otFlag: null },
      { title: '圆括号', url: 'https://a.com/(x)', score: 67, sourceName: '源丁', otFlag: null },
    ] }))
    expect(md).toContain('[正常](https://a.com/x)')
    expect(md).not.toContain('(javascript:')
    expect(md).not.toContain('onmouseover')
    expect(md).toContain('[圆括号](https://a.com/%28x%29)')
  })
})

describe('外部数据块（输出扩展）', () => {
  const blocks = [{ title: '销售周数据', kv: [{ k: '新增线索', v: '23' }], text: ['备注：CRM 周一导出'] }]
  it('Markdown：块标题 + 指标行 + 文本行，空块不出章节', () => {
    const md = reportToMarkdown(mkData({ blocks }))
    expect(md).toContain('## 六、外部数据')
    expect(md).toContain('### 销售周数据')
    expect(md).toContain('- 新增线索：**23**')
    expect(md).toContain('- 备注：CRM 周一导出')
    expect(reportToMarkdown(mkData({ blocks: [] }))).not.toContain('外部数据')
  })
  it('HTML：章节渲染且转义生效', () => {
    const html = reportToHtml(mkData({ blocks: [{ title: '<x>', kv: [], text: ['a<b'] }] }))
    expect(html).toContain('外部数据')
    expect(html).toContain('&lt;x&gt;')
    expect(html).toContain('a&lt;b')
  })
  it('parseBlockLines：中英冒号混排，超长键归文本', async () => {
    const { parseBlockLines } = await import('./reportData')
    const r = parseBlockLines('新增线索: 23\n成交金额：86万\n普通备注一行')
    expect(r.kv).toEqual([
      { k: '新增线索', v: '23' },
      { k: '成交金额', v: '86万' },
    ])
    expect(r.text).toEqual(['普通备注一行'])
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
  it('条目外链只放行 http(s)：javascript: 与含引号的 URL 不进 href', () => {
    const html = reportToHtml(mkData({ topItems: [
      { title: '正常', url: 'https://a.com/x', score: 70, sourceName: '源甲', otFlag: null },
      { title: '脚本', url: 'javascript:alert(1)', score: 69, sourceName: '源乙', otFlag: null },
      { title: '断引号', url: 'https://a.com/x" onmouseover="alert(1)', score: 68, sourceName: '源丙', otFlag: null },
    ] }))
    expect(html).toContain('href="https://a.com/x"')
    expect(html).not.toContain('href="javascript:')
    expect(html).not.toContain('onmouseover')
  })
  it('AI 摘要参数：提供时渲染在统计卡下方', () => {
    const html = reportToHtml(mkData({}), '本周节奏稳定，注意逾期项。')
    expect(html).toContain('AI 摘要')
    expect(html).toContain('本周节奏稳定')
  })
})
