/**
 * 知识胶囊卡片库（PRD 第 2 章 → 6.4 组件）。
 * 文风规范（PRD 3.1）：一句可背诵的加粗定义 + 一个生活类比 + 课程出处。
 * 每张卡控制在 60–120 字，出现在"被需要的那一刻"。
 */

import cardsData from './knowledge-cards-data.json'

export interface KnowledgeCard {
  id: string
  title: string
  /** 一句话加粗定义 */
  definition: string
  /** 生活类比 */
  analogy: string
  /** 课程出处（Reference 讲次） */
  source: string
}

export const KNOWLEDGE = cardsData as Record<string, KnowledgeCard>
