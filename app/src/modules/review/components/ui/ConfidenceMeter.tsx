import { CONFIDENCE_LABEL } from '../../content/copy'
import type { Confidence } from '../../types/models'
import './ui.css'

interface ConfidenceMeterProps {
  value: Confidence
  onChange: (v: Confidence) => void
  ariaLabel?: string
}

/** 信心指数四档（课程 02、12 讲原文措辞：没信心/不好说/有信心/非常有信心） */
export function ConfidenceMeter({ value, onChange, ariaLabel }: ConfidenceMeterProps) {
  return (
    <div className="seg" role="radiogroup" aria-label={ariaLabel ?? '信心指数'}>
      {CONFIDENCE_LABEL.map((label, i) => (
        <button
          key={label}
          type="button"
          role="radio"
          aria-checked={value === i}
          className={`seg-item ${value === i ? 'seg-item--on' : ''}`}
          onClick={() => onChange(i as Confidence)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
