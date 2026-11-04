import { useEffect, useRef, useState } from 'react'
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

/** 选中浮窗的屏幕定位（fixed 坐标，随选区矩形计算并按视口收拢） */
interface SelAnchor {
  top: number
  left: number
}

/**
 * 条目阅读视图（G1 批）：把回填的正文纯文本当书读——固定浮层，标题/来源/原文链接齐备。
 * 正文只以纯文本渲染（段落来自提取时的 \n\n 结构），任何 HTML 都不进 DOM，XSS 无处落地。
 *
 * 交互（2026-11-04 用户反馈一轮改造）：
 * - 打开即抓：进来没有正文就当场抓取并显示进度（等在空态里让用户手点会劝退人）；
 *   上次失败过的条目不自动重试（避免反复打扰源站），留给手动按钮；
 * - 选中浮窗：划选文字后正上方浮出操作条（摘录到速记 / 复制），微信读书式就地操作，
 *   替代原先角落里的固定按钮。
 */
export function ArticleReader({ item, onClose, onUpdated }: ArticleReaderProps) {
  // 手动抓到的正文与本条目的 store 状态渲染期取新：队列后台写回时 prop 更新，无需 effect 同步
  const [grabbed, setGrabbed] = useState<string | null>(null)
  const content = grabbed ?? item.content ?? null
  const [grabbing, setGrabbing] = useState(false)
  const [grabErr, setGrabErr] = useState<string | null>(null)
  const [sel, setSel] = useState<SelAnchor | null>(null)
  const autoTriedRef = useRef(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const createNote = useNotes((s) => s.create)

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

  // 打开即抓：没有正文且上次没失败过才自动抓（失败过的不打扰源站，按钮留给用户决定）
  useEffect(() => {
    if (autoTriedRef.current) return
    autoTriedRef.current = true
    if (!content && !isContentFailed(item.id)) void grab()
    // eslint 按设计只在挂载时跑一次：grab 闭包读取的 item.id 固定不变
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /** 划选检测：选区落在正文里才浮出操作条（随选区矩形定位，贴顶部时翻到下方） */
  const trackSelection = () => {
    const s = window.getSelection()
    if (!s || s.isCollapsed || s.rangeCount === 0) {
      setSel(null)
      return
    }
    const origin = s.getRangeAt(0).commonAncestorContainer
    const el = origin.nodeType === 1 ? (origin as Element) : origin.parentElement
    if (!bodyRef.current || !el?.closest('.reader-body')) {
      setSel(null)
      return
    }
    const r = s.getRangeAt(0).getBoundingClientRect()
    if (!r.width && !r.height) {
      setSel(null)
      return
    }
    const below = r.top < 120
    // 浮窗按视口收拢：贴左右边缘时不被裁剪，垂直方向留出工具条自身高度
    const left = Math.min(Math.max(90, r.left + r.width / 2), window.innerWidth - 90)
    const top = Math.min(
      Math.max(8, below ? r.bottom + 10 : r.top - 46),
      window.innerHeight - 46,
    )
    setSel({ top, left })
  }

  /** 选中文字 → 带出处速记（G2：引用块 + 出处行，挂回本条目） */
  const excerptSelection = async () => {
    const text = (window.getSelection()?.toString() ?? '').trim()
    if (!text) return
    const quoted = text
      .split('\n')
      .map((l) => `> ${l.trim()}`.trimEnd())
      .join('\n')
    await createNote({
      body: `${quoted}\n\n摘自《${item.title}》 · ${item.sourceName}\n${item.url}`,
      tags: ['摘录'],
      source: 'manual',
      links: { itemIds: [item.id], reviewIds: [], taskIds: [] },
    })
    window.getSelection()?.removeAllRanges()
    setSel(null)
    toast('ok', '已存入速记，速记里挂着本条目链接')
  }

  const copySelection = async () => {
    const text = (window.getSelection()?.toString() ?? '').trim()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      toast('ok', '已复制')
    } catch {
      toast('error', '复制失败（剪贴板未授权）')
    }
    window.getSelection()?.removeAllRanges()
    setSel(null)
  }

  const paragraphs = (content ?? '').split(/\n{2,}/).filter((p) => p.trim())

  return createPortal(
    <div
      className="reader-backdrop"
      onClick={() => { setSel(null); onClose() }}
      onMouseUp={trackSelection}
      role="presentation"
    >
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
          <div
            className="reader-body"
            ref={bodyRef}
            onScroll={() => setSel(null)}
          >
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : grabbing ? (
          <div className="reader-body reader-empty">
            <div className="reader-spinner" aria-hidden />
            <p>正在抓取正文…</p>
            <p className="ttl-note">抓到的正文只存在本机，用于阅读、检索和摘录。</p>
          </div>
        ) : (
          <div className="reader-body reader-empty">
            <p>
              {grabErr
                ? `抓取失败：${grabErr}——可以稍后再试，或直接读原链接。`
                : '这篇的正文上次自动抓取没有成功（通常是登录墙或源站拒绝）。'}
            </p>
            <p className="ttl-note">抓到的正文只存在本机，用于阅读、检索和摘录。</p>
            <button type="button" className="btn-ghost" onClick={() => void grab()}>
              再试一次
            </button>
          </div>
        )}

        {sel && content && !grabbing && (
          <div
            className="sel-toolbar"
            style={{ top: sel.top, left: sel.left }}
            role="toolbar"
            aria-label="选中操作"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={() => void excerptSelection()}>＋ 摘录到速记</button>
            <span className="sel-sep" aria-hidden />
            <button type="button" onClick={() => void copySelection()}>复制</button>
          </div>
        )}
      </article>
    </div>,
    document.body,
  )
}
