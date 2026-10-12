import { beforeEach, describe, expect, it } from 'vitest'
import {
  RESEARCH_TYPES,
  buildFramework,
  buildSectionPrompt,
  loadFramework,
  normalizeAiFramework,
  saveFramework,
  typeName,
} from './research'
import type { ResearchType } from './research'

beforeEach(() => localStorage.clear())

describe('调研任务引擎（2026-10-13 第一性原理版）', () => {
  it('三类模板齐全：每类 ≥4 节，每节有问题与来源建议', () => {
    for (const t of RESEARCH_TYPES) {
      const fw = buildFramework(t.id as ResearchType, '测试目标')
      expect(fw.sections.length).toBeGreaterThanOrEqual(4)
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

  it('AI 框架规整：合法输入通过，字段缺失抛错', () => {
    const ok = normalizeAiFramework(
      { sections: [{ heading: '一、画像', questions: ['成立时间？'], sources: ['官网'] }, { heading: '二、业务' }, { heading: '三、动态' }] },
      'company',
      '某公司',
    )
    expect(ok.generatedBy).toBe('ai')
    expect(ok.sections).toHaveLength(3)
    expect(ok.sections[1]!.questions).toEqual([])
    expect(() => normalizeAiFramework({ sections: [{ heading: '' }] }, 'free', 'x')).toThrow()
    expect(() => normalizeAiFramework({ sections: [] }, 'free', 'x')).toThrow()
    expect(() => normalizeAiFramework({}, 'free', 'x')).toThrow()
  })

  it('框架持久化：存取往返、损坏数据返回 null', () => {
    const fw = buildFramework('position', '高级产品经理')
    saveFramework('p1', fw)
    expect(loadFramework('p1')?.target).toBe('高级产品经理')
    expect(loadFramework('p1')?.sections.length).toBeGreaterThanOrEqual(4)
    expect(loadFramework('不存在')).toBeNull()
    localStorage.setItem('pwork-research-fw:坏', '{oops')
    expect(loadFramework('坏')).toBeNull()
  })
})
