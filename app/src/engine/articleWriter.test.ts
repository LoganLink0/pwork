import { describe, expect, it } from 'vitest'
import { articleToMarkdown, buildArticleUserPrompt, defaultArticleSkeleton, parseArticle } from './articleWriter'

describe('parseArticle（AI 返回文本 → 文章草稿）', () => {
  it('标准 JSON 解析', () => {
    const d = parseArticle('{"title":"T","intro":"开头","sections":[{"heading":"一、背景","body":"正文"}]}')
    expect(d.title).toBe('T')
    expect(d.intro).toBe('开头')
    expect(d.sections[0]!.heading).toBe('一、背景')
  })
  it('容忍代码块围栏与前后杂文字', () => {
    const d = parseArticle('好的：\n```json\n{"title":"T","sections":[{"heading":"甲","body":"b"}]}\n```\n完')
    expect(d.sections[0]!.heading).toBe('甲')
  })
  it('无标题页/空章节处理；异常输入报错', () => {
    const d = parseArticle('{"sections":[{"heading":"","body":"x"},{"heading":"保留","body":""}]}')
    expect(d.sections.map((s) => s.heading)).toEqual(['保留'])
    expect(d.title).toBe('未命名文章草稿')
    expect(() => parseArticle('{"sections":[]}')).toThrow()
    expect(() => parseArticle('我不会')).toThrow()
  })
})

describe('buildArticleUserPrompt', () => {
  it('含天数/素材全文/类型标注/JSON 格式说明', () => {
    const p = buildArticleUserPrompt(7, [
      { id: '1', kind: 'note', title: '速记甲', body: '素材正文', createdAt: '2026-09-01T08:00:00.000Z' },
      { id: '2', kind: 'insight', title: '洞察卡', body: '复盘结论', createdAt: '2026-09-02T08:00:00.000Z' },
    ])
    expect(p).toContain('7 天')
    expect(p).toContain('【素材1｜速记｜速记甲】')
    expect(p).toContain('【素材2｜洞察卡｜洞察卡】')
    expect(p).toContain('素材正文')
    expect(p).toContain('必须来自素材')
    expect(p).toContain('"sections"')
  })
  it('超长素材截断并注明', () => {
    const p = buildArticleUserPrompt(7, [{ id: '1', kind: 'note', title: '长素材', body: '长'.repeat(3000), createdAt: 'x' }])
    expect(p).toContain('（截断）')
  })
})

describe('defaultArticleSkeleton 与导出', () => {
  it('骨架四节齐全', () => {
    const d = defaultArticleSkeleton()
    expect(d.sections.map((s) => s.heading)).toEqual(['一、背景', '二、做了什么', '三、学到了什么', '四、接下来'])
  })
  it('articleToMarkdown 输出标题/开头/章节/表格化正文', () => {
    const md = articleToMarkdown({ title: 'T', intro: '开头段', sections: [{ heading: '一、背景', body: '第一段\n\n第二段' }] })
    expect(md).toContain('# T')
    expect(md).toContain('开头段')
    expect(md).toContain('## 一、背景')
    expect(md).toContain('第一段\n\n第二段')
    expect(md).toContain('PWORK 文章草稿')
  })
})
