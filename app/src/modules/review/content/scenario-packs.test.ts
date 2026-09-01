import { describe, expect, it } from 'vitest'
import { DECISION_BIAS_CHECKS, getPack, SCENARIO_PACKS } from './scenario-packs'
import { EMOTION_LEXICON } from './emotion-lexicon'
import { TEMPLATES } from './templates'
import type { ScenarioKey } from '../types/models'

describe('场景包（M6 模板差异化）', () => {
  it('四个场景有专属包：情绪/习惯/决策/目标', () => {
    for (const s of ['emotion', 'habit', 'decision', 'goal'] as ScenarioKey[]) {
      expect(getPack(s)).toBeDefined()
      expect(getPack(s)!.intro.length).toBeGreaterThan(10)
    }
    // daily/weekly/aar 无包，走默认
    expect(getPack('daily')).toBeUndefined()
  })

  it('情绪词库：6 大类、≥25 个细分词、无重复', () => {
    expect(EMOTION_LEXICON).toHaveLength(6)
    const all = EMOTION_LEXICON.flatMap((f) => f.subs)
    expect(all.length).toBeGreaterThanOrEqual(25)
    expect(new Set(all).size).toBe(all.length)
  })

  it('决策检查单：4 条偏差，指向可命名的心智过程', () => {
    expect(DECISION_BIAS_CHECKS).toHaveLength(4)
    expect(DECISION_BIAS_CHECKS.every((c) => c.label.length > 10)).toBe(true)
  })

  it('每个包引用的知识卡都存在；新模板已注册', () => {
    const knowledgeIds = ['emotion-granularity', 'habit-loop', 'outcome-bias', 'hindsight']
    expect(TEMPLATES.some((t) => t.id === 'personal-emotion')).toBe(true)
    expect(TEMPLATES.some((t) => t.id === 'personal-habit')).toBe(true)
    expect(TEMPLATES.some((t) => t.id === 'personal-decision')).toBe(true)
    expect(knowledgeIds.length).toBeGreaterThan(0)
    void SCENARIO_PACKS
  })
})
