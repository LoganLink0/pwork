import { describe, expect, it } from 'vitest'
import { parseInterests, wantTitles, PROFILE_MIN_WANTS } from './interestProfile'

describe('wantTitles（「想要」投票的标题集合）', () => {
  it('只取 vote=want 且未删除，按时间倒序截断', () => {
    const mk = (title: string, vote: 'want' | 'meh' | null, dayOffset = 0, deleted = false) => ({
      title,
      fetchedAt: new Date(Date.now() - dayOffset * 86_400_000).toISOString(),
      deletedAt: deleted ? new Date().toISOString() : undefined,
      annotation: { vote },
    })
    const titles = wantTitles([
      mk('旧想要', 'want', 5),
      mk('新想要', 'want', 0),
      mk('一般', 'meh', 0),
      mk('未投', null, 0),
      mk('删掉的想要', 'want', 0, true),
    ])
    expect(titles).toEqual(['新想要', '旧想要'])
  })
})

describe('parseInterests（AI 回复容错解析）', () => {
  it('裸 JSON、前后带说明文字都能解析；去重、去空、截断 30', () => {
    expect(parseInterests('{"interests": ["独立开发", "增长打法"]}')).toEqual(['独立开发', '增长打法'])
    expect(parseInterests('好的，归纳如下：\n{"interests": ["AI 应用", "AI 应用", "", "前端工程化"]}\n以上。')).toEqual([
      'AI 应用',
      '前端工程化',
    ])
    const many = parseInterests(`{"interests": ${JSON.stringify(Array.from({ length: 40 }, (_, i) => `词${i}`))}}`)
    expect(many).toHaveLength(30)
  })

  it('缺 JSON 或缺 interests 数组 → 抛错（调用方保持现有词表）', () => {
    expect(() => parseInterests('完全没有 JSON')).toThrow()
    expect(() => parseInterests('{"foo": 1}')).toThrow()
    expect(() => parseInterests('{"interests": "不是数组"}')).toThrow()
  })

  it('启用门槛为常量（当前 20），防止意外改动破坏契约', () => {
    expect(PROFILE_MIN_WANTS).toBe(20)
  })
})
