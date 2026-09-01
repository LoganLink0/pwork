/**
 * 场景包（M6 模板差异化）：所有场景共享 CLAP 骨架，但每个场景注入自己的
 * 标签措辞、占位符、专属工具与引导语——"一法多用，一用多器"（课程案例篇）。
 * 组件按 draft.scenario 读取对应包；无包的场景走默认配置。
 */
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

export const SCENARIO_PACKS: Partial<Record<ScenarioKey, ScenarioPack>> = {
  emotion: {
    scenario: 'emotion',
    intro:
      '情绪复盘不是给情绪打分，而是给情绪建档：事件 → 细分的情绪词 → 强度 → 触发点。情绪粒度越细，调节能力越强。',
    goalLabel: '我原本希望自己',
    goalPlaceholder: '当时希望自己的反应是？',
    resultLabel: '实际上',
    resultPlaceholder: '实际上发生了什么？我的反应是？',
    cKnowledgeId: 'emotion-granularity',
    emotionPicker: true,
    aPrompt: '把触发点升华为一张洞察卡——下次同样的信号出现时，你会有备而来。',
    pPrompt: '给情绪装一个"如果 X，就 Y"的预案：预案比意志力可靠。',
  },
  decision: {
    scenario: 'decision',
    intro:
      '决策复盘的对象是"当时的决策质量"，而不是"结果好坏"——好决策也可能碰上坏结果，坏决策也可能侥幸赢。用偏差检查单审一遍当时的心智过程。',
    goalLabel: '当时的决策',
    goalPlaceholder: '当时做了什么决策？预期是什么？',
    resultLabel: '实际结果',
    resultPlaceholder: '实际结果如何？与预期的差距是？',
    cKnowledgeId: 'outcome-bias',
    decisionChecklist: true,
    aPrompt: '把避掉的偏差写成一张洞察卡——它保护的不是这一次，是今后的每一次决策。',
    pPrompt: '把"下次决策前要做的一件事"写成行动卡。',
  },
  habit: {
    scenario: 'habit',
    intro:
      '习惯复盘用"习惯回路"拆解：提示 → 行为 → 奖赏。行为反复失败时，先改环境，再谈意志力。',
    goalLabel: '想养成的习惯',
    goalPlaceholder: '想稳定下来的行为是？',
    resultLabel: '实际上',
    resultPlaceholder: '这周实际发生了什么？',
    cKnowledgeId: 'habit-loop',
    habitLoop: true,
    aPrompt: '回路拆清楚了，把"改造提示或环境"写成洞察卡。',
    pPrompt: '给下周的提示/环境设计一个具体动作。',
  },
  goal: {
    scenario: 'goal',
    intro: '目标复盘先回答"当初的目标本身对吗"（双环），再看达成率——顺序同样不能反。',
    smartCheck: true,
    cKnowledgeId: 'hindsight',
    aPrompt: '对照 SMART 检查的结果，更新你对"怎么定目标"的认知。',
    pPrompt: '修正后的目标，配上"如果 X，就 Y"的第一步。',
  },
}

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
