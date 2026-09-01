/**
 * 情绪粒度词库（PRD 2.3 / Barrett）：两层结构——核心情绪 → 细分词。
 * 能精确命名情绪的人，调节能力更强；所以存细分词而非"好/坏"。
 * 6 核心情绪 × 4-5 细分词，共 26 词。
 */
export interface EmotionFamily {
  core: string
  icon: string
  subs: string[]
}

export const EMOTION_LEXICON: EmotionFamily[] = [
  { core: '愉悦', icon: '🙂', subs: ['开心', '满足', '自豪', '平静', '兴奋', '期待', '踏实'] },
  { core: '愤怒', icon: '😤', subs: ['恼火', '生气', '愤慨', '暴躁', '失望'] },
  { core: '悲伤', icon: '😔', subs: ['失落', '难过', '沮丧', '委屈', '无力'] },
  { core: '恐惧', icon: '😰', subs: ['紧张', '焦虑', '害怕', '不安', '压力'] },
  { core: '厌恶', icon: '🙁', subs: ['反感', '抵触', '不耐烦', '羞愧'] },
  { core: '惊讶', icon: '😲', subs: ['意外', '错愕', '惊喜', '恍惚'] },
]
