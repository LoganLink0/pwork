/**
 * 模板库（PRD 4.4）。M0 先定义数据；向导逐步接入（M1 个人，M3 会议模式）。
 * tagline 用课程文风写：一句话讲清这个模板解决什么。
 */
import type { ReviewType, ScenarioKey } from '../types/models'

export interface TemplateDef {
  id: string
  name: string
  type: ReviewType
  scenario: ScenarioKey
  tagline: string
  /** 支持 3 分钟快答版 */
  quick: boolean
  /** 模式：wizard 分步向导（M1）/ meeting 会议模式（M3） */
  mode: 'wizard' | 'meeting'
  /** 里程碑标记（M0 展示用，开发完成后移除） */
  milestone: 'M1' | 'M2' | 'M3' | 'M6'
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'personal-daily',
    name: '日复盘',
    type: 'personal',
    scenario: 'daily',
    tagline: '今天发生了什么？为什么？明天改变哪一件小事？',
    quick: true,
    mode: 'wizard',
    milestone: 'M1',
  },
  {
    id: 'personal-weekly',
    name: '周复盘',
    type: 'personal',
    scenario: 'weekly',
    tagline: '七天一次小小的"经营分析会"，主角是你自己。',
    quick: true,
    mode: 'wizard',
    milestone: 'M1',
  },
  {
    id: 'personal-aar',
    name: 'AAR 快速复盘',
    type: 'personal',
    scenario: 'aar',
    tagline: '美军任务后检视的简化版：3 分钟，一件事，走完全流程。',
    quick: true,
    mode: 'wizard',
    milestone: 'M1',
  },
  {
    id: 'personal-goal',
    name: '目标复盘',
    type: 'personal',
    scenario: 'goal',
    tagline: '当初的目标本身对吗？先答这一问，再看达成率。',
    quick: false,
    mode: 'wizard',
    milestone: 'M2',
  },
  {
    id: 'personal-emotion',
    name: '情绪复盘',
    type: 'personal',
    scenario: 'emotion',
    tagline: '给情绪建档：事件、细分的情绪词、强度、触发点——粒度越细，调节越强。',
    quick: false,
    mode: 'wizard',
    milestone: 'M6',
  },
  {
    id: 'personal-habit',
    name: '习惯复盘',
    type: 'personal',
    scenario: 'habit',
    tagline: '用习惯回路拆解：提示 → 行为 → 奖赏。改环境，比靠意志力有用。',
    quick: false,
    mode: 'wizard',
    milestone: 'M6',
  },
  {
    id: 'personal-decision',
    name: '决策复盘',
    type: 'personal',
    scenario: 'decision',
    tagline: '只审决策质量，不审运气好坏——偏差检查单替你复盘当时的心智。',
    quick: false,
    mode: 'wizard',
    milestone: 'M6',
  },
  {
    id: 'team-project',
    name: '项目/迭代回顾',
    type: 'team',
    scenario: 'project',
    tagline: '一场不跑题、不追责的复盘会：角色、议程、复盘墙都替你备好了。',
    quick: false,
    mode: 'meeting',
    milestone: 'M3',
  },
  {
    id: 'team-aar',
    name: '事件复盘（团队 AAR）',
    type: 'team',
    scenario: 'aar',
    tagline: '事情刚结束时最好用：离现场越近，记忆越诚实。',
    quick: false,
    mode: 'meeting',
    milestone: 'M3',
  },
]

export function getTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id)
}
