import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { MemoryRouter } from 'react-router-dom'
import { CommandPalette, PaletteNavBridge } from './CommandPalette'
import { ConfirmDialog } from './ConfirmDialog'
import { Toaster } from './Toast'
import { useUi } from '../../store/ui'
import { useConfirmStore } from '../../engine/confirm'
import { syncThemeFromStore } from '../../engine/appearance'
import { invalidatePrefsCache, readPrefsFile } from '../../engine/prefsFile'
import { useNotes } from '../../store/notes'

/**
 * 问小 P 独立窗（/palette 分流渲染，Spotlight 形态）：胶囊岛「问小 P」呼出，
 * 只承载命令面板本体——不进主窗路由与壳，不显示主窗内容。
 * 窗内搜索/问答/速记走同源 IndexedDB 与本地网关；页面跳转经 palette_goto
 * 桥接回主窗（隐藏自己→唤醒主窗→发 isle-goto，App 侧路由）。
 * 面板关闭（Esc/点窗外/动作执行）= useUi.paletteOpen 翻假 → 调 palette_hide 藏窗。
 * 必须挂 ConfirmDialog 与 Toaster 宿主（0.1.23 事故）：确认闸门与提示都是
 * zustand store + 宿主组件渲染——独立窗不挂宿主，确认弹层永不出现（「记一条」
 * 的 Promise 永等）、失败提示不可见（撤销失败用户看到的只是「没反应」）。
 * 写类动作完成后发 pwork-library-changed 广播——主窗监听刷新 store，
 * 否则主窗界面看不到独立窗写入的数据。
 */
export function PaletteWindow() {
  // 收起独立窗：未回答的确认先以「取消」结案（否则等待确认的 Promise 永挂），再藏窗
  function hideWithSettle() {
    const confirmState = useConfirmStore.getState()
    if (confirmState.spec) confirmState.settle(false)
    void invoke('palette_hide').catch(() => {})
  }

  useEffect(() => {
    // 主题跟随主窗（独立窗此前不挂 data-theme，深浅令牌分支不生效）；
    // 偏好变化经 pwork-prefs-changed 事件实时跟随（伴生窗桌面专属，Tauri 事件是唯一跨窗通道）
    syncThemeFromStore()
    // prefs.json 缓存预热（main.tsx 只在主窗跑；伴生窗独立进程视图，读偏好前自行预热）
    void readPrefsFile()
    let unlistenTheme: (() => void) | undefined
    let themeDisposed = false
    void import('@tauri-apps/api/event').then(({ listen }) => {
      void listen<{ keys?: string[] }>('pwork-prefs-changed', (e) => {
        // 先失效本窗缓存再读（stale cache 教训同 IsleWindow），主题读文件最新值
        invalidatePrefsCache()
        const keys = e.payload?.keys
        if (!keys || keys.includes('pwork-theme')) syncThemeFromStore()
      }).then((fn) => {
        if (themeDisposed) fn()
        else unlistenTheme = fn
      })
    })
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
        hideWithSettle()
      }
    })
    // 失焦即关（Spotlight 惯例）：点击窗格外的任何地方都会让本窗失去焦点，
    // 立即收起——用户不需要先把焦点移回窗格再按 Esc。
    // 收起前若有未回答的确认弹层，先以「取消」结案——否则等待确认的 Promise 永挂
    // （记一条的写入流程会永远停在 await 上）。
    const onBlur = () => {
      hideWithSettle()
    }
    window.addEventListener('blur', onBlur)
    return () => {
      unsub()
      themeDisposed = true
      unlistenTheme?.()
      window.removeEventListener('blur', onBlur)
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
        <Toaster />
        <ConfirmDialog />
      </PaletteNavBridge.Provider>
    </MemoryRouter>
  )
}
