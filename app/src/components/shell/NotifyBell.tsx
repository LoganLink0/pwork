import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifyHub, unreadCount, type NotifyItem } from '../../engine/notifyCenter'
import { Icon } from './icons'

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / 日期 */
function relTime(ts: number, now = Date.now()): string {
  const diff = now - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}

const KIND_MARK: Record<string, string> = { done: 'mark-input', remind: 'mark-review' }

/**
 * 通知铃铛（WorkBuddy 学习批，2026-11-06）：未读徽标 + 通知中心面板
 * （历史可回看、点条目跳来源页）。打开面板即全部已读。
 * 两种形态：topbar=true 顶栏图标按钮（面板右上下拉）；默认侧栏底部。
 */
export function NotifyBell({ topbar = false }: { topbar?: boolean }) {
  const items = useNotifyHub((s) => s.items)
  const panelOpen = useNotifyHub((s) => s.panelOpen)
  const setOpen = useNotifyHub((s) => s.setOpen)
  const markAllRead = useNotifyHub((s) => s.markAllRead)
  const markRead = useNotifyHub((s) => s.markRead)
  const clear = useNotifyHub((s) => s.clear)
  const navigate = useNavigate()
  const unread = unreadCount(items)
  const boxRef = useRef<HTMLDivElement>(null)

  // 点面板外关闭
  useEffect(() => {
    if (!panelOpen) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [panelOpen, setOpen])

  const openItem = (it: NotifyItem) => {
    if (!it.read) markRead(it.id)
    setOpen(false)
    if (it.to) navigate(it.to)
  }

  return (
    <div className={topbar ? 'bell-wrap bell-top' : 'bell-wrap'} ref={boxRef}>
      <button
        type="button"
        className={topbar ? 'bell-btn bell-btn-top' : 'bell-btn'}
        aria-label={`通知${unread > 0 ? `，${unread} 条未读` : ''}`}
        aria-expanded={panelOpen}
        title="通知"
        onClick={() => {
          if (!panelOpen) markAllRead() // 打开即已读
          setOpen(!panelOpen)
        }}
      >
        <Icon name="bell" size={17} />
        {unread > 0 && <span className="bell-badge tnum">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {panelOpen && (
        <div className={topbar ? 'bell-panel bell-panel-top' : 'bell-panel'} role="dialog" aria-label="通知中心">
          <div className="bell-head">
            <b>通知</b>
            {items.length > 0 && (
              <button type="button" className="bell-ghost" onClick={() => clear()}>
                清空
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="bell-empty">还没有通知。任务完成回执、待办到期提醒都会留在这里。</div>
          ) : (
            <ul className="bell-list">
              {items.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    className={`bell-item ${it.read ? '' : 'unread'} ${KIND_MARK[it.kind] ?? ''}`}
                    onClick={() => openItem(it)}
                  >
                    <span className="bi-title">
                      {it.title}
                      {!it.read && <span className="bi-dot" aria-hidden />}
                    </span>
                    {it.desc && <span className="bi-desc">{it.desc}</span>}
                    <span className="bi-time">{relTime(it.ts)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
