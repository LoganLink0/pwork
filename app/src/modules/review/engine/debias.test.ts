import { describe, expect, it } from 'vitest'
import { firstDebias, scanDebias } from './debias'

describe('防偏差规则引擎', () => {
  it('识别追责他人（blame）', () => {
    expect(firstDebias('这个项目失败，都是小王的错')).toBe('blame')
    expect(firstDebias('全怪市场环境，不是我们的问题')).toBe('blame')
    expect(firstDebias('他就是不行，能力太差')).toBe('blame')
  })

  it('识别自我否定（self-blame）', () => {
    expect(firstDebias('我太蠢了，居然犯这种错误')).toBe('self-blame')
    expect(firstDebias('我这人就是不行')).toBe('self-blame')
  })

  it('识别空洞承诺（empty-promise）——"下次注意"要被换成 if-then', () => {
    expect(firstDebias('下次注意一点就好了')).toBe('empty-promise')
    expect(firstDebias('以后我会更加努力')).toBe('empty-promise')
  })

  it('识别后见之明（hindsight）', () => {
    expect(firstDebias('早知道就多备一点库存了')).toBe('hindsight')
    expect(firstDebias('当时要是听了他的建议就不会这样')).toBe('hindsight')
  })

  it('识别万能借口（excuse）——课程 15 讲"价格太高"式答案', () => {
    expect(firstDebias('我们的产品卖不动，主要还是价格太高')).toBe('excuse')
    expect(firstDebias('市场不好，大家都难')).toBe('excuse')
    expect(firstDebias('这季度没时间做复盘')).toBe('excuse')
  })

  it('正常反思文本不误报', () => {
    expect(scanDebias('转化率比目标低 5 个点，落地页的加载时间可能是一个因素')).toEqual([])
    expect(scanDebias('')).toEqual([])
  })

  it('scanDebias 返回全部命中（同一句可含多种偏差）', () => {
    const hits = scanDebias('都是团队的错，早知道我就不采用了')
    const kinds = hits.map((h) => h.kind)
    expect(kinds).toContain('blame')
    expect(kinds).toContain('hindsight')
  })
})
