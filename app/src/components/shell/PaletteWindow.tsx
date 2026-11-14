import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { MemoryRouter } from 'react-router-dom'
import { CommandPalette, PaletteNavBridge } from './CommandPalette'
import { useUi } from '../../store/ui'
import { useNotes } from '../../store/notes'

/**
 * 问小 P 独立窗（/palette 分流渲染，Spotlight 形态）：胶囊岛「问小 P」呼出，
 * 只承载命令面板本体——不进主窗路由与壳，不显示主窗内容。
 * 窗内搜索/问答/速记走同源 IndexedDB 与本地网关；页面跳转经 palette_goto
 * 桥接回主窗（隐藏自己→唤醒主窗→发 isle-goto，App 侧路由）。
 * 面板关闭（Esc/点窗外/动作执行）= useUi.paletteOpen 翻假 → 调 palette_hide 藏窗。
 */
export function PaletteWindow() {
  useEffect(() => {
    // 面板要用的最近速记与全文检索数据（同源 IndexedDB，本窗独立连接）
    void useNotes.getState().load()
    // 每次呼出（Rust show 后发 palette-open）→ 打开面板；
    // 面板以任何方式关闭（Esc/点窗外/动作执行）→ 藏起独立窗（窗常驻隐藏，呼出零启动成本）
    let unlisten: (() => void) | undefined
    void import('@tauri-apps/api/event').then(({ listen }) => {
      void listen('palette-open', () => {
        useUi.getState().openPalette('littlep')
      }).then((fn) => {
        unlisten = fn
      })
    })
    const unsub = useUi.subscribe((s, prev) => {
      if (prev.paletteOpen && !s.paletteOpen) {
        void invoke('palette_hide').catch(() => {})
      }
    })
    return () => {
      unsub()
      unlisten?.()
    }
  }, [])

  return (
    <MemoryRouter initialEntries={['/']}>
      <PaletteNavBridge.Provider
        value={(p) => {
          void invoke('palette_goto', { path: p }).catch(() => {})
        }}
      >
        <CommandPalette />
      </PaletteNavBridge.Provider>
    </MemoryRouter>
  )
}
