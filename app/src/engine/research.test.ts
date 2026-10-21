import { beforeEach, describe, expect, it } from 'vitest'
import {
  FINDINGS_TITLE,
  RESEARCH_TYPES,
  buildFramework,
  buildSectionPrompt,
  loadFramework,
  mergeLegacySectionBlocks,
  normalizeAiFramework,
  saveFramework,
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

describe('mergeLegacySectionBlocks（旧分节发现 → 单一流水迁移，2026-10-21）', () => {
  const headings = ['一、公司画像与业务', '二、行业位置与近期动态', '三、切入判断']

  it('按框架顺序拼成一条流水，节标题转 "## " 分隔行；无关块（补充材料）不动', () => {
    const blocks = [
      { title: '三、切入判断', content: '从供应链切入。' },
      { title: '某招聘 JD', content: '材料……' }, // 补充材料：不在标题清单里
      { title: '一、公司画像与业务', content: '员工 2 万人。' },
    ]
    const r = mergeLegacySectionBlocks(blocks, headings)!
    expect(r.content).toBe('## 一、公司画像与业务\n员工 2 万人。\n\n## 三、切入判断\n从供应链切入。')
    expect(r.legacyTitles).toEqual(['三、切入判断', '一、公司画像与业务'])
  })

  it('没有旧分节块 → null（新任务/已迁移任务零动作）', () => {
    expect(mergeLegacySectionBlocks([{ title: '某文件', content: 'x' }], headings)).toBeNull()
    expect(mergeLegacySectionBlocks([], headings)).toBeNull()
  })

  it('发现流块标题约定为「发现」', () => {
    expect(FINDINGS_TITLE).toBe('发现')
  })
})
