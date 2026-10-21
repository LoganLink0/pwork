import { beforeEach, describe, expect, it } from 'vitest'
import {
  RESEARCH_TYPES,
  buildFramework,
  buildSectionPrompt,
  loadFramework,
  normalizeAiFramework,
  saveFramework,
  splitAnswerIntoSections,
  typeName,
} from './research'
import type { ResearchType } from './research'

beforeEach(() => localStorage.clear())

describe('调研任务引擎（2026-10-13 第一性原理版）', () => {
  it('三类模板齐全：每类恰好 3 节（2026-10-21 用户拍板瘦身），每节有问题与来源建议', () => {
    for (const t of RESEARCH_TYPES) {
      const fw = buildFramework(t.id as ResearchType, '测试目标')
      expect(fw.sections).toHaveLength(3)
      for (const s of fw.sections) {
        expect(s.heading).toMatch(/^[一二三四五六]/)
        expect(s.questions.length).toBeGreaterThanOrEqual(2)
        expect(s.sources.length).toBeGreaterThanOrEqual(1)
      }
      expect(fw.generatedBy).toBe('template')
      expect(typeName(t.id)).toBe(t.name)
    }
  })

  it('单节提示词：注入目标与全部问题，带核实要求', () => {
    const fw = buildFramework('company', '宁德时代')
    const prompt = buildSectionPrompt(fw, fw.sections[1]!)
    expect(prompt).toContain('宁德时代')
    expect(prompt).toContain('公司调研')
    for (const q of fw.sections[1]!.questions) expect(prompt).toContain(q)
    expect(prompt).toContain('未核实')
    expect(prompt).toContain('信息来源')
  })

  it('AI 框架规整：合法输入通过，字段缺失抛错；超过 3 节截到 3（节数=要问的次数）', () => {
    const ok = normalizeAiFramework(
      { sections: [{ heading: '一、画像', questions: ['成立时间？'], sources: ['官网'] }, { heading: '二、业务' }, { heading: '三、动态' }] },
      'company',
      '某公司',
    )
    expect(ok.generatedBy).toBe('ai')
    expect(ok.sections).toHaveLength(3)
    expect(ok.sections[1]!.questions).toEqual([])
    const capped = normalizeAiFramework(
      { sections: [1, 2, 3, 4, 5].map((i) => ({ heading: `第${i}节` })) },
      'free',
      'x',
    )
    expect(capped.sections).toHaveLength(3)
    expect(() => normalizeAiFramework({ sections: [{ heading: '' }] }, 'free', 'x')).toThrow()
    expect(() => normalizeAiFramework({ sections: [] }, 'free', 'x')).toThrow()
    expect(() => normalizeAiFramework({}, 'free', 'x')).toThrow()
  })

  it('框架持久化：存取往返、损坏数据返回 null', () => {
    const fw = buildFramework('position', '高级产品经理')
    saveFramework('p1', fw)
    expect(loadFramework('p1')?.target).toBe('高级产品经理')
    expect(loadFramework('p1')?.sections).toHaveLength(3)
    expect(loadFramework('不存在')).toBeNull()
    localStorage.setItem('pwork-research-fw:坏', '{oops')
    expect(loadFramework('坏')).toBeNull()
  })
})

describe('splitAnswerIntoSections（整篇回答自动拆分，2026-10-21）', () => {
  const fw = { sections: [{ heading: '一、公司画像与业务' }, { heading: '二、行业位置与近期动态' }, { heading: '三、切入判断' }] }

  it('按标题拆到对应节：容忍序号差异、markdown 加粗、标题前的开场白', () => {
    const answer = [
      '好的，以下是调研结果：',
      '**一、公司画像与业务**',
      '成立于 2011 年，员工约 2 万人。',
      '## 二、行业位置与近期动态',
      '行业增速 20%，竞品主要是 A 和 B。',
      '三、切入判断',
      '建议从供应链切入。',
    ].join('\n')
    const parts = splitAnswerIntoSections(answer, fw)
    expect(parts).toHaveLength(4) // 3 个匹配节 + 开场白进「补充发现」
    expect(parts[0]).toMatchObject({ heading: '一、公司画像与业务' })
    expect(parts[0]!.content).toContain('2 万人')
    expect(parts[1]!.content).toContain('竞品')
    expect(parts[2]!.content).toContain('供应链')
    expect(parts[3]).toMatchObject({ heading: '补充发现' })
    expect(parts[3]!.content).toContain('以下是调研结果')
  })

  it('对不上任何标题 → 全文进「补充发现」（出稿照样当素材）', () => {
    const parts = splitAnswerIntoSections('AI 没有按章节回答，\n就一大段内容。', fw)
    expect(parts).toHaveLength(1)
    expect(parts[0]!.heading).toBe('补充发现')
    expect(parts[0]!.content).toContain('一大段')
  })

  it('标题带括号注释（AI 定制框架常见），回答里省略括号也能对上', () => {
    const fwParens = { sections: [{ heading: '一、公司主体画像与商业模式（是谁、靠什么赚钱）' }, { heading: '二、行业位置' }] }
    const parts = splitAnswerIntoSections('一、公司主体画像与商业模式\n员工 2 万人。\n二、行业位置\n增速 20%。', fwParens)
    expect(parts).toHaveLength(2)
    expect(parts[0]!.heading).toContain('公司主体画像')
    expect(parts[0]!.content).toContain('2 万人')
    expect(parts[1]!.content).toContain('20%')
  })
})
