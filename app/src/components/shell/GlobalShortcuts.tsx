import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUi } from '../../store/ui'
import { loadKeybinds, comboFromEvent } from '../../engine/keybinds'
import { actionById } from '../../engine/actions'

/**
 * 全局快捷键（PRD §4.1 / §5.4；0.4-3 起键位可自定义，读 pwork-keybinds 配置）：
 * 命令面板（默认 Ctrl+K，/ 为固定别名）、速记浮层（默认 N）、帮助页（默认 ?）、设置（默认 Ctrl+,）。
 * 键位 → 动作的执行经动作注册表（2.3 收敛：行为只在注册表定义一处）。
 * 输入态（input/textarea/contenteditable）不触发单键快捷键（动作的 guardTyping 标记）；
 * 命令面板组合键在输入态也可用。
 */
export function GlobalShortcuts() {
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 首访引导（全屏遮罩）期间不响应全局快捷键：浮层会开在遮罩底下看不见，击键全进隐藏输入框
      if (document.querySelector('.welcome-veil')) return
      const el = document.activeElement
      const typing =
        el instanceof HTMLElement &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

      const combo = comboFromEvent(e)
      if (!combo) return
      const kb = loadKeybinds()
      const ctx = { navigate, openQuickNote: () => useUi.getState().openQuick(), openPalette: (via?: 'key' | 'littlep') => useUi.getState().openPalette(via) }
      const fire = (id: string) => {
        const a = actionById(id)
        if (!a) return
        if (a.guardTyping && typing) return
        e.preventDefault()
        a.run(ctx)
      }
      // 命令面板：配置键 + 固定别名 / + 默认 Ctrl+K / ⌘K（写进肌肉记忆的键位恒可用），输入态也可唤出
      if (combo === kb.palette || combo === 'ctrl+k' || combo === 'meta+k' || e.key === '/') {
        fire('open-palette')
        return
      }
      if (combo === kb.quickNote) fire('quick-note')
      else if (combo === kb.help) fire('open-help')
      else if (combo === kb.settings) fire('open-settings')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctx 由每次按键现取（store getState），navigate 稳定
  }, [navigate])

  return null
}
