import { describe, expect, it } from 'vitest'
import { clapAudit } from './doublecheck'
import { emptyClap, type ReviewRecord } from '../types/models'

function makeReview(quick: boolean): ReviewRecord {
  const now = new Date().toISOString()
  const clap = emptyClap()
  clap.comparison.goals = [{ text: '季度营收 100 万', lockedAt: now, source: 'manual' }]
  clap.comparison.results = [{ text: '实际 80 万' }]
  clap.comparison.gaps = [{ goalRef: 0, resultRef: 0, delta: 'down', good: false }]
  clap.logic.causes = [
    { text: '获客渠道单一', gapRef: 0, controllability: 'full', tool: 'none', depth: [] },
  ]
  clap.acknowledge.insights = [
    { text: '多渠道可对冲波动', kind: 'inductive', verified: false, confidence: 1, checkPlan: '下季度看渠道占比' },
  ]
  clap.acknowledge.goalValid = true
  clap.project.actions = [
    { kind: 'start', text: '新增渠道试点', ifThen: '如果下周一，就启动', due: '2026-09-05', confidence: 2 },
  ]
  return {
    id: 'rev_dc',
    type: 'personal',
    scenario: 'weekly',
    templateId: 'personal-weekly',
    title: 'DC 测试',
    createdAt: now,
    updatedAt: now,
    status: 'archived',
    quick,
    clap,
    summary: [],
  }
}

describe('Double Check 环节质量自检', () => {
  it('规范填写的完整版：全部通过', () => {
    const items = clapAudit(makeReview(false))
    expect(items.every((i) => i.pass)).toBe(true)
    // 完整版包含 SMART / 验证方式 / 期限 三项额外检查
    expect(items.some((i) => i.label.includes('SMART'))).toBe(true)
    expect(items.some((i) => i.label.includes('验证方式'))).toBe(true)
    expect(items.some((i) => i.label.includes('期限'))).toBe(true)
  })

  it('行动卡缺执行意图 → 对应项不通过', () => {
    const r = makeReview(false)
    r.clap.project.actions[0].ifThen = ''
    const item = clapAudit(r).find((i) => i.label.includes('执行意图'))
    expect(item?.pass).toBe(false)
  })

  it('归纳结论缺验证方式 → 仅完整版检查该项', () => {
    const r = makeReview(false)
    r.clap.acknowledge.insights[0].checkPlan = ''
    expect(clapAudit(r).find((i) => i.label.includes('验证方式'))?.pass).toBe(false)
    // 快答版没有这个字段，不检查
    const q = makeReview(true)
    q.clap.acknowledge.insights[0].checkPlan = ''
    expect(clapAudit(q).some((i) => i.label.includes('验证方式'))).toBe(false)
  })

  it('全部原因不可控 → 提示发力点缺失', () => {
    const r = makeReview(false)
    r.clap.logic.causes[0].controllability = 'none'
    expect(clapAudit(r).find((i) => i.label.includes('发力点'))?.pass).toBe(false)
  })

  it('目标需要调整但没写方向 → 双环检视不通过', () => {
    const r = makeReview(false)
    r.clap.acknowledge.goalValid = false
    r.clap.acknowledge.doubleLoopNote = ''
    expect(clapAudit(r).find((i) => i.label.includes('双环'))?.pass).toBe(false)
  })

  it('快答版跳过 SMART 与期限检查', () => {
    const q = makeReview(true)
    q.clap.project.actions[0].due = undefined
    q.clap.comparison.goals[0].text = '早睡'
    const items = clapAudit(q)
    expect(items.some((i) => i.label.includes('SMART'))).toBe(false)
    expect(items.some((i) => i.label.includes('期限'))).toBe(false)
    expect(items.every((i) => i.pass)).toBe(true)
  })
})
