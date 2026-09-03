import { describe, expect, it } from 'vitest'
import { buildOutlineUserPrompt, defaultTemplate, outlineToSlides, parseOutline } from './pptWriter'

describe('parseOutline（AI 返回文本 → 大纲）', () => {
  it('标准 JSON 直接解析', () => {
    const o = parseOutline('{"title":"T","slides":[{"layout":"cover","title":"封面","sub":["x"]}]}')
    expect(o.title).toBe('T')
    expect(o.slides[0]!.layout).toBe('cover')
    expect(o.slides[0]!.sub).toEqual(['x'])
  })
  it('容忍代码块围栏与前后杂文字', () => {
    const text = '好的，以下是大纲：\n```json\n{"title":"T","slides":[{"layout":"bullets","title":"页","bullets":["a"]}]}\n```\n以上。'
    const o = parseOutline(text)
    expect(o.slides[0]!.bullets).toEqual(['a'])
  })
  it('未知 layout 归一为 bullets；无标题页跳过；空 slides 报错', () => {
    const o = parseOutline('{"slides":[{"layout":"weird","title":"甲"},{"layout":"bullets","title":""},{"layout":"bullets","title":"乙"}]}')
    expect(o.slides.map((s) => s.title)).toEqual(['甲', '乙'])
    expect(o.slides[0]!.layout).toBe('bullets')
    expect(() => parseOutline('{"slides":[]}')).toThrow()
    expect(() => parseOutline('抱歉我不会')).toThrow()
  })
  it('table 字段完整保留', () => {
    const o = parseOutline('{"slides":[{"layout":"table","title":"数据","table":{"headers":["a"],"rows":[["1"]]}}]}')
    expect(o.slides[0]!.table).toEqual({ headers: ['a'], rows: [['1']] })
  })
})

describe('outlineToSlides（确定性转换：大纲 → 幻灯片规格）', () => {
  it('cover 加深色；section/table/bullets 各归其位；footer 带报告标题', () => {
    const slides = outlineToSlides({
      title: '某公司业务分析',
      slides: [
        { layout: 'cover', title: '封面', sub: ['内部'] },
        { layout: 'section', title: '第一部分' },
        { layout: 'bullets', title: '概况', bullets: ['a'] },
        { layout: 'table', title: '数据', table: { headers: ['h'], rows: [['v']] } },
      ],
    })
    expect(slides[0]!.kind).toBe('title')
    expect(slides[0]!.dark).toBe(true)
    expect(slides[1]!.kind).toBe('section')
    expect(slides[2]!.kind).toBe('bullets')
    expect(slides[3]!.kind).toBe('table')
    expect(slides[3]!.table!.headers).toEqual(['h'])
    expect(slides.every((s) => s.footer.includes('某公司业务分析'))).toBe(true)
  })
})

describe('buildOutlineUserPrompt（提示词组装）', () => {
  it('含主题/受众指引/页数/材料全文与名称', () => {
    const p = buildOutlineUserPrompt(
      { topic: '某公司尽调', audience: 'external', pageTarget: 10 },
      [{ name: '工商信息.txt', text: '注册资本 100 万' }],
    )
    expect(p).toContain('某公司尽调')
    expect(p).toContain('外部客户或合作方')
    expect(p).toContain('约 10 页')
    expect(p).toContain('【材料1：工商信息.txt】')
    expect(p).toContain('注册资本 100 万')
    expect(p).toContain('不要编造')
  })
  it('超长材料截断并注明', () => {
    const p = buildOutlineUserPrompt({ topic: 't', audience: 'internal', pageTarget: 8 }, [{ name: 'm', text: '长'.repeat(20000) }])
    expect(p).toContain('材料过长已截断')
    expect(p.length).toBeLessThan(20000 + 2000)
  })
})

describe('defaultTemplate（无 AI 的手填兜底）', () => {
  it('业务分析骨架完整，内外部封面副题不同', () => {
    const internal = defaultTemplate('某业务', 'internal')
    expect(internal.slides.length).toBeGreaterThanOrEqual(7)
    expect(internal.slides[0]!.sub).toContain('内部汇报')
    const external = defaultTemplate('某业务', 'external')
    expect(external.slides[0]!.sub).toContain('对外交流')
    expect(internal.slides.some((s) => s.layout === 'table')).toBe(true)
  })
})
