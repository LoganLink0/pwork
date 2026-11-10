/**
 * 模板库（PRD 4.4）。0.4-6 内容数据文件化：模板本体在 review-templates.json
 * （社区可直接 PR 改数据，与 source-catalog.json 同模式），本文件只保留类型与查询函数。
 */
import data from './review-templates.json'

import type { ReviewType, ScenarioKey } from '../types/models'

export interface TemplateDef {
  id: string
  name: string
  type: ReviewType
  scenario: ScenarioKey
  tagline: string
  /** 什么时候用：真实生活里的那一刻（2026-11-10 用户反馈——缺场景与故事感） */
  when?: string
  /** 支持 3 分钟快答版 */
  quick: boolean
  /** 模式：wizard 分步向导（M1）/ meeting 会议模式（M3） */
  mode: 'wizard' | 'meeting'
  /** 里程碑标记（M0 展示用，开发完成后移除） */
  milestone: 'M1' | 'M2' | 'M3' | 'M6'
}

export const TEMPLATES = data as TemplateDef[]

export function getTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id)
}
