import { describe, expect, it } from 'vitest'
import { parseInterests, wantTitles, underestimatedWants, PROFILE_MIN_WANTS } from './interestProfile'
import { newId } from '../db/repo'
import type { Item } from '../types/models'

function mkVoteItem(title: string, vote: 'want' | 'meh' | 'no' | null, day: string, score = 68): Item {
  return {
    id: newId('itm'),
    sourceId: 's',
    sourceName: '源',
    url: `https://a.com/${newId('x')}`,
    title,
    summary: '',
    fingerprint: newId('fp'),
    eventGroup: null,
    publishedAt: null,
    fetchedAt: `${day}T10:00:00.000Z`,
    stage: 'scored',
    score: { total: score, source: 1, novelty: 1, relevance: 0.5, utility: 0.3 },
    scoreReason: 'r',
    aiBy: 'rules',
    tags: [],
    otFlag: null,
    expiresAt: null,
    annotation: { notes: '', vote, keepForever: false, linkedReviewId: null },
    createdAt: `${day}T10:00:00.000Z`,
    updatedAt: `${day}T10:00:00.000Z`,
    schemaVersion: 1,
  }
}

describe('underestimatedWants（被低估样本：非当天前两名但你标了想要）', () => {
  it('只取 vote=want 且分层非必看的条目', () => {
    const items = [
      mkVoteItem('第一名标题', 'want', '2026-10-20', 90), // 必看 → 不算被低估
      mkVoteItem('第二名标题', 'want', '2026-10-20', 80), // 必看 → 不算
      mkVoteItem('被低估的好东西', 'want', '2026-10-20', 60), // 可看 → 算
      mkVoteItem('一般的想要', 'want', '2026-10-20', 55), // 可略 → 算
      mkVoteItem('不想要的低分', 'no', '2026-10-20', 50), // 非 want → 不算
    ]
    const under = underestimatedWants(items)
    expect(under).toHaveLength(2)
    expect(new Set(under)).toEqual(new Set(['被低估的好东西', '一般的想要']))
  })
})

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
