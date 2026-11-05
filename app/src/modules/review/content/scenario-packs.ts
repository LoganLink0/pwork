/**
 * 场景包（M6 模板差异化）：所有场景共享 CLAP 骨架，但每个场景注入自己的
 * 标签措辞、占位符、专属工具与引导语——"一法多用，一用多器"（课程案例篇）。
 * 组件按 draft.scenario 读取对应包；无包的场景走默认配置。
 */
import packsData from './scenario-packs-data.json'
import type { ScenarioKey } from '../types/models'

export interface ScenarioPack {
  scenario: ScenarioKey
  /** 页面开场引导语 */
  intro: string
  /** C 步标签与占位符覆写 */
  goalLabel?: string
  goalPlaceholder?: string
  resultLabel?: string
  resultPlaceholder?: string
  cKnowledgeId?: string
  /** 目标字段启用 SMART 内联检查（目标复盘等） */
  smartCheck?: boolean
  /** 情绪复盘：启用情绪粒度词库选择器 */
  emotionPicker?: boolean
  /** 决策复盘：启用偏差检查单（勾选即生成原因卡） */
  decisionChecklist?: boolean
  /** 习惯复盘：启用习惯回路三问 */
  habitLoop?: boolean
  /** A/P 步引导语覆写 */
  aPrompt?: string
  pPrompt?: string
}

export const SCENARIO_PACKS = packsData as Partial<Record<ScenarioKey, ScenarioPack>>

export function getPack(scenario: ScenarioKey): ScenarioPack | undefined {
  return SCENARIO_PACKS[scenario]
}

/** 决策偏差检查单（决策复盘 L 步）：勾选即生成原因卡 */
export const DECISION_BIAS_CHECKS = [
  { id: 'confirmation', label: '确认偏误：当时只找了支持这个选项的证据，没有认真找反例' },
  { id: 'overconfidence', label: '过度自信：高估了自己控制结果的能力和计划的准确性' },
  { id: 'sunk-cost', label: '沉没成本：因为已经投入很多所以继续，而不是因为它仍然值得' },
  { id: 'social', label: '从众/权威压力：主要因为别人都这么说或领导这么定，而不是因为证据' },
]
