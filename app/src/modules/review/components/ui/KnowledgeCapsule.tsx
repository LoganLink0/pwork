import { useState } from 'react'
import { KNOWLEDGE } from '../../content/knowledge'
import './ui.css'

interface KnowledgeCapsuleProps {
  /** 知识卡 id，见 content/knowledge.ts */
  id: keyof typeof KNOWLEDGE | string
}

/** 字段旁的"为什么？"胶囊：把课程知识放在被需要的那一刻（PRD 6.3 原则 5） */
export function KnowledgeCapsule({ id }: KnowledgeCapsuleProps) {
  const [open, setOpen] = useState(false)
  const card = KNOWLEDGE[id]
  if (!card) return null

  return (
    <span className="capsule">
      <button
        type="button"
        aria-label={`为什么：${card.title}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <span className="capsule-pop" role="note">
          <strong className="def">{card.title}：{card.definition}</strong>
          {card.analogy}
          <span className="src">{card.source}</span>
        </span>
      )}
    </span>
  )
}
