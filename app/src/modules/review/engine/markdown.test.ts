import { describe, expect, it } from 'vitest'
import { reviewToMarkdown } from './markdown'
import { hashTheme } from './theme'
import { emptyClap, type ReviewRecord } from '../types/models'

function fixture(): ReviewRecord {
  const now = new Date().toISOString()
  const clap = emptyClap()
  clap.comparison.goals = [{ text: '季度营收 100 万', lockedAt: now, source: 'manual' }]
  clap.comparison.results = [{ text: '实际 80 万', evidence: 'ERP 导出' }]
  clap.comparison.gaps = [{ goalRef: 0, resultRef: 0, delta: 'down', good: false }]
  clap.logic.causes = [
    {
      text: '获客渠道单一',
      gapRef: 0,
      controllability: 'full',
      tool: '5why',
      depth: ['预算都投在单一平台'],
    },
  ]
  clap.acknowledge.insights = [
    { text: '多渠道布局能对冲波动', kind: 'inductive', verified: false, confidence: 1, checkPlan: '下季度看渠道占比' },
  ]
  clap.acknowledge.goalValid = false
  clap.acknowledge.doubleLoopNote = '目标本身定得偏高'
  clap.project.actions = [
    { kind: 'start', text: '新增获客渠道试点', ifThen: '如果下周一，就启动测试', owner: '我', due: '2026-09-05', confidence: 2 },
  ]
  return {
    id: 'rev_md',
    type: 'personal',
    scenario: 'weekly',
    templateId: 'personal-weekly',
    title: '第 35 周周复盘',
    createdAt: now,
    updatedAt: now,
    status: 'archived',
    quick: false,
    clap,
    summary: [],
  }
}

describe('Markdown 导出', () => {
  it('包含四环节 + 小结 + 思考题的完整结构', () => {
    const rec = fixture()
    rec.summary = ['一', '二', '三']
    rec.thinkingQuestion = '你在陈述记忆，还是在核对事实？'
    const md = reviewToMarkdown(rec)
    expect(md).toContain('# 第 35 周周复盘')
    expect(md).toContain('## 一、对比：目标与结果')
    expect(md).toContain('↓ 低于')
    expect(md).toContain('● 可控｜获客渠道单一')
    expect(md).toContain('为什么一层：预算都投在单一平台')
    expect(md).toContain('【归纳·待验证】多渠道布局能对冲波动')
    expect(md).toContain('当初的目标本身需要调整：目标本身定得偏高')
    expect(md).toContain('🚀 开始 新增获客渠道试点')
    expect(md).toContain('执行意图：如果下周一，就启动测试')
    expect(md).toContain('信心：有信心')
    expect(md).toContain('## 小结')
    expect(md).toContain('## 思考题')
    expect(md).toContain('导出自 复盘工作台')
  })

  it('目标文本中的竖线被转义，不破坏表格', () => {
    const rec = fixture()
    rec.clap.comparison.results[0] = { text: 'A|B 两个结果' }
    rec.clap.comparison.gaps = [{ goalRef: 0, resultRef: 0, delta: 'down', good: false }]
    const md = reviewToMarkdown(rec)
    expect(md).toContain('A｜B 两个结果')
  })
})

describe('主题指纹', () => {
  it('同类表述得到同一指纹，不同主题不同指纹', () => {
    expect(hashTheme('复盘要留缓冲时间！')).toBe(hashTheme('复盘要留缓冲时间'))
    expect(hashTheme('复盘要留缓冲时间')).not.toBe(hashTheme('先说结论能省一半时间'))
  })
})
