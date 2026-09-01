import { describe, expect, it } from 'vitest'
import { generateSummary } from './summary'
import { emptyClap, type ReviewRecord } from '../types/models'

function fixture(): ReviewRecord {
  const now = new Date().toISOString()
  const clap = emptyClap()
  clap.comparison.goals = [{ text: '季度营收 100 万', lockedAt: now, source: 'manual' }]
  clap.comparison.results = [{ text: '实际 80 万' }]
  clap.comparison.gaps = [{ goalRef: 0, resultRef: 0, delta: 'down', good: false }]
  clap.logic.causes = [
    {
      text: '获客渠道单一',
      gapRef: 0,
      controllability: 'full',
      tool: '5why',
      depth: ['预算都投在单一平台'],
    },
    { text: '行业整体下行', gapRef: 0, controllability: 'none', tool: 'none', depth: [] },
  ]
  clap.acknowledge.insights = [
    { text: '多渠道布局能对冲单一平台波动', kind: 'inductive', verified: false, confidence: 1 },
  ]
  clap.project.actions = [
    { kind: 'start', text: '新增一个获客渠道试点', ifThen: '如果下周一，就启动小红书渠道测试', confidence: 2 },
  ]
  return {
    id: 'rev_test',
    type: 'personal',
    scenario: 'weekly',
    templateId: 'personal-weekly',
    title: '测试复盘',
    createdAt: now,
    updatedAt: now,
    status: 'in-progress',
    quick: false,
    clap,
    summary: [],
  }
}

describe('小结自动生成', () => {
  it('生成 3 条小结，包含数字与文风要素', () => {
    const s = generateSummary(fixture())
    expect(s).toHaveLength(3)
    // ① 对比条：带数字
    expect(s[0]).toContain('1 个目标')
    expect(s[0]).toContain('低于')
    expect(s[0]).toContain('入口')
    // ② 逻辑条：强调可控范围
    expect(s[1]).toContain('2 条')
    expect(s[1]).toContain('可控')
    // ③ 认知+行动条：归纳结论带"待验证"提醒
    expect(s[2]).toContain('1 条认知更新')
    expect(s[2]).toContain('验证')
  })

  it('数据不足时给诚实的占位句，不编造', () => {
    const now = new Date().toISOString()
    const empty: ReviewRecord = {
      id: 'rev_empty',
      type: 'personal',
      scenario: 'daily',
      templateId: 'personal-daily',
      title: '空复盘',
      createdAt: now,
      updatedAt: now,
      status: 'in-progress',
      quick: true,
      clap: emptyClap(),
      summary: [],
    }
    const s = generateSummary(empty)
    expect(s).toHaveLength(3)
    expect(s[0]).toContain('还没有形成对比')
    expect(s[1]).toContain('还没有展开')
    expect(s[2]).toContain('还没有产出')
  })
})
