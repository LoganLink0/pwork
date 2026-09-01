import { EMOTION_LEXICON } from '../../content/emotion-lexicon'
import { useDraft } from '../../store/draft'
import type { EmotionCheck } from '../../types/models'
import { KnowledgeCapsule } from '../ui/KnowledgeCapsule'

const DEFAULT: EmotionCheck = { words: [], intensity: 0, trigger: '' }

interface EmotionPickerProps {
  value: EmotionCheck | undefined
}

/** 情绪复盘专属：情绪粒度词库选择器（核心情绪 → 细分词）+ 强度 + 触发点 */
export function EmotionPicker({ value }: EmotionPickerProps) {
  const draft = useDraft((s) => s.draft)
  const updateClap = useDraft((s) => s.updateClap)
  if (!draft) return null
  const emotion = value ?? DEFAULT

  // 一律从最新 store 计算再写入——避免连续点击时的过期闭包互相覆盖
  function patchEmotion(patch: Partial<EmotionCheck>) {
    void updateClap((clap) => {
      const base = clap.comparison.emotion ?? DEFAULT
      return {
        ...clap,
        comparison: { ...clap.comparison, emotion: { ...base, ...patch } },
      }
    })
  }

  function toggleWord(word: string) {
    void updateClap((clap) => {
      const base = clap.comparison.emotion ?? DEFAULT
      const words = base.words.includes(word)
        ? base.words.filter((w) => w !== word)
        : base.words.length >= 3
          ? base.words
          : [...base.words, word]
      return {
        ...clap,
        comparison: { ...clap.comparison, emotion: { ...base, words } },
      }
    })
  }

  return (
    <div className="detail-section" aria-label="情绪档案">
      <div className="field-label">
        <h3>情绪档案</h3>
        <KnowledgeCapsule id="emotion-granularity" />
      </div>
      <p className="coach-say">选最贴近的细分词（最多 3 个）——越精确，越有信息量。</p>

      {EMOTION_LEXICON.map((family) => (
        <div key={family.core} style={{ marginBottom: 'var(--sp-2)' }}>
          <div className="field-label" style={{ margin: 'var(--sp-1) 0' }}>
            <span>
              {family.icon} {family.core}
            </span>
          </div>
          <div className="seg" role="group" aria-label={`${family.core}类细分情绪`}>
            {family.subs.map((sub) => (
              <button
                key={sub}
                type="button"
                aria-pressed={emotion.words.includes(sub)}
                className={`seg-item ${emotion.words.includes(sub) ? 'seg-item--on' : ''}`}
                onClick={() => toggleWord(sub)}
              >
                {sub}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="field-label">
        <span>强度（1–5）</span>
      </div>
      <div className="seg" role="radiogroup" aria-label="情绪强度">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={emotion.intensity === n}
            className={`seg-item ${emotion.intensity === n ? 'seg-item--on' : ''}`}
            aria-label={`强度 ${n}`}
            onClick={() => patchEmotion({ intensity: n })}
          >
            <span className="tnum" aria-hidden>
              {n}
            </span>
          </button>
        ))}
      </div>

      <div className="field-label">
        <span>触发它的是什么？</span>
      </div>
      <input
        className="input"
        value={emotion.trigger}
        placeholder="如：方案被当众否定，且没有给我解释的机会"
        aria-label="情绪触发点"
        onChange={(e) => patchEmotion({ trigger: e.target.value })}
      />
    </div>
  )
}
