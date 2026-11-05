/**
 * 情绪粒度词库（PRD 2.3 / Barrett）：两层结构——核心情绪 → 细分词。
 * 能精确命名情绪的人，调节能力更强；所以存细分词而非"好/坏"。
 * 6 核心情绪 × 4-5 细分词，共 26 词。
 */
import lexiconData from './emotion-lexicon-data.json'

export interface EmotionFamily {
  core: string
  icon: string
  subs: string[]
}

export const EMOTION_LEXICON = lexiconData as EmotionFamily[]
