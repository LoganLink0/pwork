import type { CSSProperties } from 'react'
import './ui.css'

export type StickyKind = 'good' | 'need' | 'insight' | 'action'

interface StickyCardProps {
  kind: StickyKind
  title: string
  tagline?: string
  /** 里程碑占位标记（开发期） */
  milestone?: string
  onClick?: () => void
}

/** 进场轻微随机旋转，还原便利贴手感（PRD 6.2） */
function tilt(seed: string): string {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 7
  return `${h - 3}deg`
}

export function StickyCard({ kind, title, tagline, milestone, onClick }: StickyCardProps) {
  const style = { '--tilt': tilt(title) } as CSSProperties
  return (
    <div
      className={`sticky sticky--${kind}`}
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      <div className="sticky-title">{title}</div>
      {tagline && <div className="sticky-tagline">{tagline}</div>}
      {milestone && <span className="sticky-mile">{milestone} 开放</span>}
    </div>
  )
}
