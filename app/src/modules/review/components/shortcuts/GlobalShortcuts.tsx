import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/** 正在输入时（输入框/多行文本/下拉/内容可编辑）不响应快捷键 */
export function isTypingContext(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
}

/**
 * 全局键盘快捷键（B 组）：
 * N → 新建复盘；? → 帮助；/ → 聚焦仪表盘搜索（在仪表盘时）。
 * 向导内的 ←→ 切步由 Wizard 自己监听。
 */
export function GlobalShortcuts() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingContext(e.target)) return
      const key = e.key

      if (key === 'n' || key === 'N') {
        e.preventDefault()
        navigate('/new')
        return
      }
      if (key === '?') {
        e.preventDefault()
        navigate('/help')
        return
      }
      if (key === '/') {
        if (location.pathname === '/') {
          const input = document.querySelector<HTMLInputElement>('input[aria-label="搜索复盘档案…"]')
          if (input) {
            e.preventDefault()
            input.focus()
          }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, location.pathname])

  return null
}

