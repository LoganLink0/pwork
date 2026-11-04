import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Item } from '../../types/models'
import { fetchContentForItem, isContentFailed } from '../../engine/articleContent'
import { useNotes } from '../../store/notes'
import { toast } from '../../engine/toast'

export interface ArticleReaderProps {
  item: Item
  onClose: () => void
  /** 正文写回后通知外层刷新单条目（条目卡上的"全文"状态跟着变） */
  onUpdated: (id: string) => void
}

/**
 * 条目阅读视图（G1 批）：把回填的正文纯文本当书读——固定浮层，标题/来源/原文链接齐备。
 * 正文只以纯文本渲染（段落来自提取时的 \n\n 结构），任何 HTML 都不进 DOM，XSS 无处落地。
 * 摘录（G2 批）：选中正文 → 存为带出处的速记，速记自动挂回本条目（links.itemIds）。
 */
export function ArticleReader({ item, onClose, onUpdated }: ArticleReaderProps) {
  // 手动抓到的正文与本条目的 store 状态渲染期取新：队列后台写回时 prop 更新，无需 effect 同步
  const [grabbed, setGrabbed] = useState<string | null>(null)
  const content = grabbed ?? item.content ?? null
  const [grabbing, setGrabbing] = useState(false)
  const [grabErr, setGrabErr] = useState<string | null>(null)
  const [hasSelection, setHasSelection] = useState(false)
  const createNote = useNotes((s) => s.create)

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const grab = async () => {
    setGrabbing(true)
    setGrabErr(null)
    const r = await fetchContentForItem(item.id)
    setGrabbing(false)
    if (r.ok && r.text) {
      setGrabbed(r.text)
      onUpdated(item.id)
    } else {
      setGrabErr(r.error ?? '抓取失败')
    }
  }

  /** 选中文字 → 带出处速记（G2 最小形态：引用块 + 出处行，挂回本条目） */
  const excerptSelection = async () => {
    const sel = (window.getSelection()?.toString() ?? '').trim()
    if (!sel) return
    const quoted = sel
      .split('\n')
      .map((l) => `> ${l.trim()}`.trimEnd())
      .join('\n')
    await createNote({
      body: `${quoted}\n\n摘自《${item.title}》 · ${item.sourceName}\n${item.url}`,
      tags: ['摘录'],
      source: 'manual',
      links: { itemIds: [item.id], reviewIds: [], taskIds: [] },
    })
    toast('ok', '已存入速记，速记里挂着本条目链接')
  }

  const trackSelection = () => {
    setHasSelection((window.getSelection()?.toString() ?? '').trim().length > 0)
  }

  const paragraphs = (content ?? '').split(/\n{2,}/).filter((p) => p.trim())

  return createPortal(
    <div className="reader-backdrop" onClick={onClose} role="presentation">
      <article
        className="reader"
        role="dialog"
        aria-modal="true"
        aria-label={`阅读：${item.title}`}
        onClick={(e) => e.stopPropagation()}
        onMouseUp={trackSelection}
        onKeyUp={trackSelection}
      >
        <header className="reader-head">
          <div>
            <h1 className="reader-title">{item.title}</h1>
            <div className="reader-meta">
              <span>{item.sourceName}</span>
              <a href={item.url} target="_blank" rel="noreferrer noopener">打开原链接 ↗</a>
            </div>
          </div>
          <button type="button" className="mini-btn" onClick={onClose} aria-label="关闭阅读视图">
            关闭 ✕
          </button>
        </header>

        {content ? (
          <>
            <div className="reader-body">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <footer className="reader-foot">
              <button type="button" className="mini-btn" disabled={!hasSelection} onClick={() => void excerptSelection()}>
                摘录选中 → 速记
              </button>
              <span className="ttl-note">
                {hasSelection ? '把选中的文字存为带出处的速记' : '用鼠标选中正文即可摘录'}
              </span>
            </footer>
          </>
        ) : (
          <div className="reader-body reader-empty">
            <p>
              {grabErr
                ? `手动抓取失败：${grabErr}。`
                : isContentFailed(item.id)
                  ? '这篇的正文上次自动抓取没有成功——通常是登录墙、纯视频页或源站拒绝了抓取。'
                  : '这篇的正文还没抓到——打开应用后后台会按队列自动补齐，不用等在这里。'}
            </p>
            <p className="ttl-note">抓到的正文只存在本机，用于阅读、检索和摘录。</p>
            <button type="button" className="btn-ghost" disabled={grabbing} onClick={() => void grab()}>
              {grabbing ? '抓取中…' : '抓取正文'}
            </button>
          </div>
        )}
      </article>
    </div>,
    document.body,
  )
}
