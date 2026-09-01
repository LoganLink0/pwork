import { DELTA_LABEL } from '../../content/copy'
import type { Delta } from '../../types/models'
import './ui.css'

/** 差异符号徽章（↑ ↓ 0 + −，课程 07、12 讲） */
export function DeltaBadge({ delta }: { delta: Delta }) {
  const { mark, name } = DELTA_LABEL[delta]
  return (
    <span className={`delta delta--${delta} tnum`} title={name} aria-label={name}>
      {mark}
    </span>
  )
}
