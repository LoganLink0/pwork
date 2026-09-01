import { describe, expect, it } from 'vitest'
import { hitInterests, prefilter, scoreByRules } from './rules'
import type { CollectConfig, Source } from '../types/models'
import { TIER_WEIGHT } from '../content/collect'

const CONFIG: CollectConfig = {
  interests: ['AI 应用', '独立开发'],
  dislikes: ['融资', '八卦'],
  context: '',
  topN: 10,
}

function src(weight = 1): Source {
  return {
    id: 'src_t',
    name: '测试源',
    kind: 'rss',
    url: 'https://a.com/rss',
    domain: 'ai',
    tier: 1,
    weight,
    checkEvery: 'daily',
    active: true,
    health: { failStreak: 0, lastOkAt: null, lastError: null },
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    schemaVersion: 1,
  }
}

describe('prefilter（04 §4 ③）', () => {
  it('dislikes 命中 → 拒绝并给原因', () => {
    const v = prefilter({ title: '某公司完成 A 轮融资', summary: '', config: CONFIG })
    expect(v.pass).toBe(false)
    if (!v.pass) expect(v.reason).toContain('融资')
  })

  it('标题过短 → 拒绝', () => {
    expect(prefilter({ title: '短', summary: '', config: CONFIG }).pass).toBe(false)
  })

  it('正常条目 → 通过', () => {
    expect(prefilter({ title: '新模型开源并商用可用', summary: '描述', config: CONFIG }).pass).toBe(true)
  })
})

describe('scoreByRules（04 §4.1 公式的规则近似）', () => {
  it('命中兴趣词 + 工具词 + T1 源 → 高分且理由含提示', () => {
    const { score, reason, tags } = scoreByRules({
      source: src(TIER_WEIGHT[1]!),
      title: 'AI 应用新开源工具发布',
      summary: '可直接借鉴的实践案例',
      domainCountToday: 0,
      config: CONFIG,
    })
    expect(score.total).toBeGreaterThanOrEqual(80)
    expect(reason).toContain('兴趣×1')
    expect(reason.length).toBeLessThanOrEqual(30)
    expect(tags).toContain('AI 应用')
    expect(tags).toContain('ai') // 域标签
  })

  it('无命中 + T2 源 → 低分', () => {
    const { score } = scoreByRules({
      source: src(TIER_WEIGHT[2]!),
      title: '本周行业动态汇总',
      summary: '若干消息',
      domainCountToday: 0,
      config: CONFIG,
    })
    expect(score.total).toBeLessThan(60)
  })

  it('同域密集（≥5）→ novelty 衰减拉低总分', () => {
    const calm = scoreByRules({ source: src(1), title: 'AI 应用新开源工具发布', summary: '', domainCountToday: 0, config: CONFIG })
    const dense = scoreByRules({ source: src(1), title: 'AI 应用新开源工具发布', summary: '', domainCountToday: 6, config: CONFIG })
    expect(dense.score.novelty).toBe(0.6)
    expect(dense.score.total).toBeLessThan(calm.score.total)
  })

  it('total 严格按公式四舍五入', () => {
    const { score } = scoreByRules({ source: src(0.7), title: '标题足够长的普通条目', summary: '', domainCountToday: 0, config: CONFIG })
    const expectTotal = Math.round(100 * (0.3 * 0.7 + 0.25 * 1 + 0.25 * score.relevance + 0.2 * score.utility))
    expect(score.total).toBe(expectTotal)
  })
})

describe('hitInterests', () => {
  it('大小写不敏感命中', () => {
    expect(hitInterests('New AI App Launch', ['ai app'])).toEqual(['ai app'])
    expect(hitInterests('无关内容', ['AI 应用'])).toEqual([])
  })
})
