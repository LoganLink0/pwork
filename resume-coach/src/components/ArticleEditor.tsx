import type { ArticleDraft } from '../engine/articleWriter'

/** 文章草稿编辑器（共用）：标题/开头/逐节编辑/增删排序。文章草稿页与调研对象工作台共用 */
export function ArticleEditor({ draft, onChange }: { draft: ArticleDraft; onChange: (d: ArticleDraft) => void }) {
  const updateSection = (i: number, patch: Partial<{ heading: string; body: string }>) => {
    onChange({ ...draft, sections: draft.sections.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) })
  }
  const moveSection = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= draft.sections.length) return
    const sections = [...draft.sections]
    ;[sections[i], sections[j]] = [sections[j]!, sections[i]!]
    onChange({ ...draft, sections })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      <div className="row">
        <label>标题</label>
        <input
          className="input"
          style={{ flex: 1 }}
          value={draft.title}
          aria-label="文章标题"
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
        />
      </div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <label>开头</label>
        <textarea
          className="input"
          rows={3}
          value={draft.intro}
          aria-label="文章开头"
          onChange={(e) => onChange({ ...draft, intro: e.target.value })}
        />
      </div>
      {draft.sections.map((s, i) => (
        <div
          key={i}
          className="row"
          style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--sp-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)' }}
        >
          <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
            <span className="" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{i + 1}</span>
            <input
              className="input"
              style={{ flex: 1 }}
              value={s.heading}
              aria-label={`第 ${i + 1} 节标题`}
              onChange={(e) => updateSection(i, { heading: e.target.value })}
            />
            <button type="button" className="mini-btn" title="上移" onClick={() => moveSection(i, -1)}>↑</button>
            <button type="button" className="mini-btn" title="下移" onClick={() => moveSection(i, 1)}>↓</button>
            <button
              type="button"
              className="mini-btn"
              onClick={() => onChange({ ...draft, sections: draft.sections.filter((_, idx) => idx !== i) })}
            >
              删除
            </button>
          </div>
          <textarea
            className="input"
            rows={4}
            value={s.body}
            aria-label={`第 ${i + 1} 节内容`}
            onChange={(e) => updateSection(i, { body: e.target.value })}
          />
        </div>
      ))}
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={() => onChange({ ...draft, sections: [...draft.sections, { heading: '新的一节', body: '（待填）' }] })}
        >
          ＋ 加一节
        </button>
      </div>
    </div>
  )
}
