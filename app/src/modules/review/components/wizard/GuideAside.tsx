import { KNOWLEDGE } from '../../content/knowledge'

export interface GuideItem {
  label: string
  done: boolean
}

interface GuideAsideProps {
  kicker: string
  title: string
  purpose: string
  items: GuideItem[]
  tipId: keyof typeof KNOWLEDGE | string
}

/**
 * 引导师笔记侧栏（桌面端右栏）：这一步为什么存在 + 当前进度 + 一条小贴士。
 * 手机端不渲染（由调用方用 CSS 隐藏），保持"每屏一事"。
 */
export function GuideAside({ kicker, title, purpose, items, tipId }: GuideAsideProps) {
  const card = KNOWLEDGE[tipId]
  return (
    <aside className="guide" aria-label="引导师笔记">
      <div className="kicker">{kicker}</div>
      <h3 className="guide-title">{title}</h3>
      <p className="guide-purpose">{purpose}</p>
      <ul className="guide-list">
        {items.map((it) => (
          <li key={it.label} className={it.done ? 'done' : ''}>
            {it.label}
          </li>
        ))}
      </ul>
      {card && (
        <div className="guide-tip">
          <strong>小贴士 · {card.title}</strong>
          <p>{card.definition}</p>
          <p className="guide-tip-analogy">{card.analogy}</p>
        </div>
      )}
    </aside>
  )
}
