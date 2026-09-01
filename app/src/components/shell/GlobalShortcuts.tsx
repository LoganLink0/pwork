import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUi } from '../../store/ui'

/**
 * 全局快捷键（PRD §4.1 / §5.4）：
 * ⌘K / Ctrl+K / 「/」→ 命令面板；N → 速记浮层（延续 FUPAN 键位习惯）；? → 帮助页（接管 FUPAN 键位）。
 * 输入态（input/textarea/contenteditable）不触发单键快捷键。
 */
export function GlobalShortcuts() {
  const openPalette = useUi((s) => s.openPalette)
  const openQuick = useUi((s) => s.openQuick)
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      const typing =
        el instanceof HTMLElement &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openPalette()
        return
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === '/') {
        e.preventDefault()
        openPalette()
      } else if (e.key.toLowerCase() === 'n') {
        e.preventDefault()
        openQuick()
      } else if (e.key === '?') {
        e.preventDefault()
        navigate('/help')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openPalette, openQuick, navigate])

  return null
}
