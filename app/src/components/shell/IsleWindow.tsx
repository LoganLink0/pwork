import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { syncThemeFromStore } from '../../engine/appearance'
import { readPref, refreshPrefsFile, writePref } from '../../engine/prefsFile'
import { recordError } from '../../engine/errorLog'

/** 定位/变形失败的统一留痕（岛会从屏幕上消失，绝不能静默） */
function reportIsleError(where: string, e: unknown): void {
  void recordError({ where, kind: 'app', message: e instanceof Error ? e.message : String(e) }, { silent: true })
}

/**
 * 胶囊岛窗（/isle 分流渲染）——三种停靠模式 + 自由驻留，统一「靠近展开 / 离开收回」：
 * 固定 520×140 透明画布，窗体从不变形（可见窗 resize 会白闪）。收起隐藏态=
 * 「藏进去、留把手」：缘停靠 logo 半探出屏幕外（屏内留约一半贴边可见），自由驻留
 * logo 半透明淡出原地——可见把手就是提醒/引导；Rust 以 SetWindowRgn 把命中区裁为
 * logo 屏内可见部分（region 外穿透给下层）；靠近把手滑出展开毛玻璃横条
 * （logo 滑至条内左侧 + 状态单行 + 问小 P / 打开 PWORK）。
 * 模式（拖拽落点由 Rust 按光标判定并落位，前端持久化）：
 *   top   灵动岛：横条零间距贴屏幕上缘居中；
 *   left/right 缘停靠：画布贴屏幕左/右缘，纵向跟随落点；
 *   free  自由驻留：拖到哪驻留到哪（全向钳回屏内），离开半透明淡出原地。
 * 单击=收回；按住=原生拖拽。位置/模式持久化在数据目录 prefs.json（pwork-isle-pos，
 * 配置文件化 2026-11-16；localStorage 双写为兼容期回落）；
 * 启用开关在主窗设置页（经 pwork-prefs-changed 事件实时响应显隐）。
 */

interface ActivityItem {
  id: string
  label: string
}

/** 活动结束瞬态（完成 ✓ / 失败 ✗）：展示数秒自动消失 */
interface ActivityNotice {
  ok: boolean
  label: string
}

const POS_KEY = 'pwork-isle-pos'
const SETTINGS_KEY = 'pwork-isle-settings'

interface SavedPos {
  mode: 'top' | 'left' | 'right' | 'free'
  x?: number
  y?: number
}

/** localStorage 兼容期回落（读取失败返回 null） */
function readLocal(key: string): unknown {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function readPos(): SavedPos {
  try {
    // 配置文件化：prefs.json 优先（null=已重置），兼容期回落 localStorage 旧键
    const raw = readPref<unknown>(POS_KEY, undefined) ?? readLocal(POS_KEY)
    if (raw == null || raw === 'null' || raw === '') return { mode: 'top' }
    const p = (typeof raw === 'string' ? JSON.parse(raw) : raw) as SavedPos
    if (p.mode === 'right' && typeof p.y === 'number') return { mode: 'right', y: p.y }
    if (p.mode === 'left' && typeof p.y === 'number') return { mode: 'left', y: p.y }
    if (p.mode === 'free' && typeof p.x === 'number' && typeof p.y === 'number') return { mode: 'free', x: p.x, y: p.y }
    return { mode: 'top' }
  } catch {
    return { mode: 'top' }
  }
}

function savePos(pos: SavedPos) {
  localStorage.setItem(POS_KEY, JSON.stringify(pos))
  writePref(POS_KEY, pos)
}

function readEnabled(): boolean {
  try {
    const raw = readPref<unknown>(SETTINGS_KEY, undefined) ?? readLocal(SETTINGS_KEY)
    if (raw == null) return true
    const p = (typeof raw === 'string' ? JSON.parse(raw) : raw) as { enabled?: boolean }
    return p.enabled !== false
  } catch {
    return true
  }
}

/** 驻留模式的容器类名；peek=收起隐藏态（缘停靠 logo 半探入/free 半透明，四模式统一；展开态永不叠加） */
function dockClass(mode: SavedPos['mode'], peek: boolean, open: boolean): string {
  const base = mode === 'top' ? 'dock-top' : mode === 'left' ? 'dock-left' : mode === 'right' ? 'dock-right' : 'free'
  return [base, peek && !open ? 'peek' : ''].filter(Boolean).join(' ')
}

export function IsleWindow() {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [notice, setNotice] = useState<ActivityNotice | null>(null)
  const [open, setOpenState] = useState(false)
  const [dragging, setDragging] = useState(false)
  /** 驻留模式：Rust 拖拽判定/挂载恢复共同维护 */
  const [mode, setMode] = useState<SavedPos['mode']>('top')
  /** 收起隐藏态（缘停靠 logo 半探入边缘/free 半透明淡出；命中区=logo 屏内可见部分；四模式统一） */
  const [peek, setPeek] = useState(true)
  const openTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  const noticeTimer = useRef<number | null>(null)
  const slideTimer = useRef<number | null>(null)
  /** 拖放收起后的进入抑制：缩窗瞬间光标还在小窗上，合成 mouseenter 会让刚收回的岛立即弹回展开——
      抑制到下一次 mouseleave（离开后再靠近才正常展开） */
  const suppressEnter = useRef(false)
  /** 右键收纳菜单（画布内坐标；null=关闭） */
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  /** 驻留模式实时值：收起计时器等异步回调若读 state，拿到的是旧渲染的闭包值——
      曾致右键收纳后 1 秒收起计时器用旧模式把窗口拉回原位（陈旧闭包回写） */
  const modeRef = useRef<SavedPos['mode']>('top')
  const applyMode = (m: SavedPos['mode']) => {
    modeRef.current = m
    setMode(m)
  }
  /** 展开态实时值：拖拽结束回调需区分「单击把手」与「单击展开横条」——读 state 同样是旧闭包值 */
  const openRef = useRef(false)
  const applyOpen = (v: boolean) => {
    openRef.current = v
    setOpenState(v)
  }

  const clearTimers = () => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null }
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
    if (slideTimer.current) { clearTimeout(slideTimer.current); slideTimer.current = null }
  }

  // 探边条滑动动画（2026-11-20 探边条形态）：窗体只做原子定位（位置跳变），横条的
  // 滑入/滑出由条内 translate 承担——呼出时窗体跳到展开位的同时条内先反向偏移到与
  // 探边条相同的屏幕像素，再过渡回原位；收回时反向。偏移量与 Rust 探边几何同源：
  // top=窗体上下差 (BAR_TOP+BAR_H-STRIP)-LOGO_Y=40；right/left=画布宽-探边条=496。
  const barEl = () => document.querySelector('#isle-dock .isle-bar') as HTMLElement | null
  const slideOffset = (m: SavedPos['mode']): { x: number; y: number } =>
    m === 'top' ? { x: 0, y: -40 } : m === 'right' ? { x: 496, y: 0 } : m === 'left' ? { x: -496, y: 0 } : { x: 0, y: 0 }
  const resetBar = () => {
    const bar = barEl()
    if (bar) {
      bar.style.transition = ''
      bar.style.transform = ''
    }
  }

  // 首帧：按持久化模式恢复窗位（越界由 Rust 钳回屏内）→ 按启用开关决定显示。
  // 停靠模式直接以完全隐藏态（整条边缘热区条）出场——呼出即展开（靠近即滑出）。
  // 主题跟随主窗（视觉·MiniDock 学习：融入系统深浅外观）；偏好变化经 pwork-prefs-changed
  // 事件实时跟随（伴生窗只在桌面存在，Tauri 事件是唯一跨窗通道，主窗写 prefs.json 后广播）
  useEffect(() => {
    syncThemeFromStore()
    // prefs.json 缓存预热（main.tsx 只在主窗跑；伴生窗独立进程视图，读偏好前自行预热）
    void import('../../engine/prefsFile').then((m) => m.readPrefsFile())
    let unlisten: (() => void) | undefined
    let disposed = false
    void listen<{ keys?: string[] }>('pwork-prefs-changed', (e) => {
      const keys = e.payload?.keys
      if (!keys || keys.includes('pwork-theme')) {
        // 失效后同步读只会回落 localStorage 旧值——await 重拉文件拿到最新值再应用
        void refreshPrefsFile().then(() => syncThemeFromStore())
      }
    }).then((fn) => {
      if (disposed) fn()
      else unlisten = fn
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  // 按持久化模式重新落位（挂载与设置页「重置到屏幕顶部居中」共用）：
  // 模式对齐（modeRef 实时值）+ 画布定位 + 收起裁剪，全部走当前值
  const reposition = (): Promise<void> => {
    const pos = readPos()
    applyMode(pos.mode)
    if (pos.mode === 'free' && pos.x !== undefined && pos.y !== undefined) {
      // 自由驻留：先落位画布，再锚 logo 套收起裁剪（logo 半透明淡出原地）
      return invoke('isle_place', { x: pos.x, y: pos.y })
        .then(() => invoke('isle_peek', { mode: 'free', y: 0 }))
        .catch((e) => reportIsleError('岛.驻留定位', e))
        .then(() => {})
    }
    return invoke('isle_peek', { mode: pos.mode, y: pos.y ?? 0 })
      .catch((e) => reportIsleError('岛.' + pos.mode + '收起', e))
      .then(() => {})
  }

  useEffect(() => {
    let disposed = false
    // 先等 prefs.json 缓存预热再读位置——否则 mount 与预热竞速会回落 localStorage 旧值
    // （配置文件化后设置页重置只写 prefs.json，两处存储在真实档案里会分叉，回落值是过期的）
    void import('../../engine/prefsFile')
      .then((m) => m.readPrefsFile())
      .then(() => {
        if (disposed) return
        // 窗 visible:false 起始——先落位/缩成隐藏小窗再 show，变形过程不露帧（show 挂链尾）
        const show = () => {
          if (readEnabled()) void invoke('isle_show').catch(() => {})
        }
        reposition().then(show)
      })
      .catch((e) => reportIsleError('岛.挂载', e))
    return () => {
      disposed = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 挂载一次
  }, [])

  // 设置页启用开关实时生效（主窗写 prefs.json 后广播 pwork-prefs-changed）
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let disposed = false
    void listen<{ keys?: string[] }>('pwork-prefs-changed', (e) => {
      const keys = e.payload?.keys
      const hasSettings = keys?.includes(SETTINGS_KEY)
      const hasPos = keys?.includes(POS_KEY)
      if (!hasSettings && !hasPos) return
      // 失效后同步读只会回落 localStorage 旧值（2026-11-18 开关「关了又自己开回来」根因：
      // 事件处理读了本窗 stale cache；置空缓存不重拉则回落值过期——必须 await 重拉文件再读）
      void refreshPrefsFile().then(() => {
        if (hasPos) {
          // 设置页「重置到屏幕顶部居中」实时生效：收起 + 按持久化模式重新落位
          // （驻留模式状态经 applyMode 对齐——重置后呼出/收起不再沿用旧模式）
          clearTimers()
          resetBar()
          applyOpen(false)
          setPeek(true)
          suppressEnter.current = false // 光标在主窗设置页，不在岛把手上
          reposition()
        }
        if (hasSettings) {
          if (readEnabled()) {
            // 打开=直接展开完整横条（只 show 会停在 logo 小窗并被收回计时器收走——「闪现一下消失」根因）
            resetBar()
            const pos = readPos()
            applyOpen(true)
            setPeek(false)
            void invoke('isle_expand', { mode: modeRef.current, y: pos.y ?? 0 }).catch(() => invoke('isle_show').catch(() => {}))
          } else {
            clearTimers()
            applyOpen(false)
            void invoke('isle_hide').catch(() => {})
          }
        }
      })
    }).then((fn) => {
      if (disposed) fn()
      else unlisten = fn
    })
    return () => {
      disposed = true
      unlisten?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 挂载一次
  }, [])

  // 按下=启动原生拖拽（Rust 立即返回，拖拽结束经 isle-drag-end 事件异步通知）。
  // 抓着什么拖什么：按下不收起，横条保持展开跟随拖动，松手后才按模式收起/探边。
  // 按钮豁免（点击语义优先于拖拽）。
  const startDrag = (e: ReactMouseEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button')) return
    e.stopPropagation()
    setDragging(true)
    // 拖拽中解除完全隐藏（横条随抓起显示，拖动全程完整可见）
    setPeek(false)
    clearTimers()
    void invoke('isle_start_drag').catch(() => setDragging(false))
  }

  // 拖拽真正结束（Rust 轮询到左键松开+位置稳定）：Rust 已按判定模式落位，前端持久化
  // 模式。拖动过=收起隐藏（logo 半探入边缘/半透明淡出，四模式统一）；未拖动=单击——
  // 收起态单击把手=展开并保持（此前走拖拽收回：位置切换后首次点击表现为「弹出即消失」，
  // 2026-11-19 用户报）；展开态单击横条=收回（既有语义）。
  useEffect(() => {
    let un: (() => void) | undefined
    void listen<{ mode: SavedPos['mode']; x: number; y: number; moved: boolean }>('isle-drag-end', (e) => {
      const { mode: m, x, y, moved } = e.payload
      setDragging(false)
      if (moved) {
        applyOpen(false)
        applyMode(m)
        setPeek(true)
        // 热区在光标落点附近，合成 enter 会让刚收起的岛立即弹回展开——抑制到离开
        suppressEnter.current = true
        if (m === 'top') savePos({ mode: 'top' })
        else if (m === 'right') savePos({ mode: 'right', y })
        else if (m === 'left') savePos({ mode: 'left', y })
        else savePos({ mode: 'free', x, y })
        // 直接落位收回（禁 rAF：遮挡判定下 rAF 停摆会让指令被静默丢弃）；拖拽落位
        // 无滑入滑出观感需求，跳切即可（条内偏移同步清理防残留）
        resetBar()
        void invoke('isle_peek', { mode: m, y }).catch((err) => reportIsleError('岛.落位收回', err))
      } else if (!openRef.current) {
        // 收起态单击把手：展开并保持（光标就在横条上，不会被收回计时器收走）——滑入
        suppressEnter.current = false
        setPeek(false)
        applyOpen(true)
        const pos = readPos()
        const m2 = modeRef.current
        const bar = m2 !== 'free' ? barEl() : null
        if (bar) {
          const o = slideOffset(m2)
          bar.style.transition = 'none'
          bar.style.transform = `translate(${o.x}px, ${o.y}px)`
        }
        void invoke('isle_expand', { mode: modeRef.current, y: pos.y ?? 0 }).catch((e) => reportIsleError('岛.点击展开', e))
        if (bar) {
          requestAnimationFrame(() => {
            bar.style.transition = 'transform 0.22s ease-out'
            bar.style.transform = 'translate(0, 0)'
            slideTimer.current = window.setTimeout(() => {
              bar.style.transition = ''
              bar.style.transform = ''
            }, 240)
          })
        }
      } else {
        // 展开态单击=收回（既有语义）：完整收回——只隐藏横条不落位会把窗体留在展开位，
        // 成为一块不可见却拦截点击的空窗（左缘实测暴露）
        applyOpen(false)
        setPeek(true)
        suppressEnter.current = true
        resetBar()
        void invoke('isle_peek', { mode: modeRef.current, y: readPos().y ?? 0 }).catch((e) => reportIsleError('岛.单击收回', e))
      }
    }).then((fn) => {
      un = fn
    })
    return () => un?.()
  }, [])

  // 主窗推送活动列表 + 结果瞬态（瞬态 3.5 秒后自动消失）
  useEffect(() => {
    let un: (() => void) | undefined
    void listen<{ activities: ActivityItem[]; notice: ActivityNotice | null }>('isle-activities', (e) => {
      setActivities(e.payload.activities)
      // notice 空值也清（无 done 的结束不该让上一次瞬态复现）
      setNotice(e.payload.notice)
      if (e.payload.notice) {
        if (noticeTimer.current) clearTimeout(noticeTimer.current)
        noticeTimer.current = window.setTimeout(() => setNotice(null), 3500)
      }
    }).then((unlisten) => {
      un = unlisten
    })
    return () => {
      un?.()
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
    }
  }, [])

  // 呼出/收回（2026-11-20 探边条形态：缘停靠收起=横条探边条可见，展开=完整横条；
  // 自由驻留收起=logo 小窗）。靠近探边条即命中：窗体原子跳展开位，横条条内反向偏移
  // 起步再过渡回原位（滑出屏幕边缘的观感）；离开 1 秒收回（先滑出再落探边位）。
  const onEnter = () => {
    if (dragging) return
    if (suppressEnter.current) return
    clearTimers()
    setMenu(null)
    if (peek) {
      const pos = readPos()
      const m = modeRef.current
      if (m !== 'free') {
        // 滑入预备：条内反向偏移=探边条的屏幕位置（窗体即将跳展开位，像素连续）
        const bar = barEl()
        if (bar) {
          const o = slideOffset(m)
          bar.style.transition = 'none'
          bar.style.transform = `translate(${o.x}px, ${o.y}px)`
        }
      }
      void invoke('isle_expand', { mode: m, y: pos.y ?? 0 }).catch((e) => reportIsleError('岛.呼出恢复', e))
    }
    openTimer.current = window.setTimeout(() => {
      applyOpen(true)
      setPeek(false)
      const m = modeRef.current
      const bar = m !== 'free' ? barEl() : null
      if (bar) {
        // 过渡回原位=横条滑入（rAF 只为触发过渡起步，遮挡时退化为直接就位，无指令丢失）
        requestAnimationFrame(() => {
          bar.style.transition = 'transform 0.22s ease-out'
          bar.style.transform = 'translate(0, 0)'
          slideTimer.current = window.setTimeout(() => {
            bar.style.transition = ''
            bar.style.transform = ''
          }, 240)
        })
      }
    }, 200)
  }
  const onLeave = () => {
    if (dragging) return
    suppressEnter.current = false // 离开即解除落位抑制，下次靠近正常展开
    setMenu(null)
    clearTimers()
    closeTimer.current = window.setTimeout(() => {
      applyOpen(false)
      const pos = readPos()
      setPeek(true)
      const m = modeRef.current
      const bar = m !== 'free' ? barEl() : null
      if (bar) {
        // 滑出动画先行（窗体暂留展开位，横条滑向屏幕边缘），落定后原子落探边位
        const o = slideOffset(m)
        bar.style.transition = 'transform 0.22s ease-in'
        bar.style.transform = `translate(${o.x}px, ${o.y}px)`
        slideTimer.current = window.setTimeout(() => {
          void invoke('isle_peek', { mode: m, y: pos.y ?? 0 }).catch((e) => reportIsleError('岛.隐藏变形', e))
          resetBar()
        }, 230)
      } else {
        // 直接落位收回（禁 rAF：遮挡判定下 rAF 停摆会让指令被静默丢弃）
        void invoke('isle_peek', { mode: m, y: pos.y ?? 0 }).catch((e) => reportIsleError('岛.隐藏变形', e))
      }
    }, 1000)
  }
  // 右键收纳菜单：画布须完整可见（探边条/小窗内放不下菜单且菜单不得出屏）——
  // 缘停靠变形到展开位，自由驻留以 logo 为锚原位长回；菜单位置按点击点钳在画布内
  const onContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault()
    if ((e.target as HTMLElement).closest('button')) return
    clearTimers()
    resetBar()
    const pos = readPos()
    void invoke('isle_grow', { mode: modeRef.current, y: pos.y ?? 0 }).catch((e2) => reportIsleError('岛.菜单展开画布', e2))
    const menuW = 148
    const menuH = 112
    setMenu({
      x: Math.max(6, Math.min(e.clientX, 520 - menuW - 6)),
      y: Math.max(6, Math.min(e.clientY, 140 - menuH - 6)),
    })
  }
  const closeMenu = () => {
    if (!menu) return
    setMenu(null)
    if (!peek) return
    const pos = readPos()
    const m = modeRef.current
    const bar = m !== 'free' ? barEl() : null
    if (bar) {
      // 从展开位滑出回探边条
      const o = slideOffset(m)
      bar.style.transition = 'transform 0.22s ease-in'
      bar.style.transform = `translate(${o.x}px, ${o.y}px)`
      slideTimer.current = window.setTimeout(() => {
        void invoke('isle_peek', { mode: m, y: pos.y ?? 0 }).catch((e) => reportIsleError('岛.菜单还原', e))
        resetBar()
      }, 230)
    } else {
      void invoke('isle_peek', { mode: m, y: pos.y ?? 0 }).catch((e) => reportIsleError('岛.菜单还原', e))
    }
  }
  // 收纳动作：先滑出（横条滑向屏幕边缘），落定后 Rust 原子落探边位并返回落位持久化
  // （禁 rAF 包裹：遮挡判定下 rAF 停摆会让指令被静默丢弃）
  const stashTo = (target: 'top' | 'right' | 'left') => {
    setMenu(null)
    clearTimers()
    applyOpen(false)
    setPeek(true)
    suppressEnter.current = true
    const bar = barEl()
    const doStash = () => {
      void invoke('isle_stash_to', { target })
        .then((pos) => {
          const p = pos as { mode: SavedPos['mode']; x: number; y: number }
          applyMode(p.mode)
          if (p.mode === 'right') savePos({ mode: 'right', y: p.y })
          else if (p.mode === 'left') savePos({ mode: 'left', y: p.y })
          else savePos({ mode: 'top' })
          resetBar()
        })
        .catch((e) => reportIsleError('岛.收纳', e))
    }
    if (bar) {
      const o = slideOffset(target)
      bar.style.transition = 'transform 0.22s ease-in'
      bar.style.transform = `translate(${o.x}px, ${o.y}px)`
      slideTimer.current = window.setTimeout(doStash, 230)
    } else {
      doStash()
    }
  }

  useEffect(() => () => clearTimers(), [])

  const count = activities.length
  const firstLabel = activities[0]?.label ?? ''
  const idleNote = notice ? (notice.ok ? '✓ ' : '✗ ') + notice.label : '一切就绪'
  const dockCls = dockClass(mode, peek, open)

  return (
    <div
      id="isle-dock"
      className={[open ? 'open' : '', dockCls].filter(Boolean).join(' ')}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onMouseDown={startDrag}
      onContextMenu={onContextMenu}
    >
      <div className="isle-bar">
        <div className="isle-bar-content">
          <span className="isle-divider" aria-hidden />
          <span className={`isle-dot${count > 0 ? ' live' : ''}`} aria-hidden />
          <span className="isle-title">{count > 0 ? `小 P · 进行中（${count}）` : '小 P 在'}</span>
          <span className="isle-note">{count > 0 ? firstLabel : idleNote}</span>
          <div className="isle-acts">
            <button type="button" className="isle-pbtn isle-brand" onClick={(e) => { e.stopPropagation(); void invoke('isle_open_palette').catch(() => {}) }}>
              问小 P
            </button>
            <button type="button" className="isle-pbtn" onClick={(e) => { e.stopPropagation(); void invoke('isle_open_main').catch(() => {}) }}>
              打开 PWORK
            </button>
          </div>
        </div>
      </div>
      {/* logo 是收起态唯一可见物，必须是 #isle-dock 的直接子元素——
          放进 .isle-bar 内会被收起态的 opacity:0 连带压成全透明（opacity 压平后代）。
          拖拽在画布层统一处理（整条可拖），logo 无独立监听、无 title（悬停驱动的
          UI 里原生提示框是噪音，出现在横条正下方被误认为渲染缺陷） */}
      <img
        src="favicon.svg"
        alt="小 P"
        className="isle-logo"
        draggable={false}
      />
      {menu && (
        <>
          {/* 菜单开启期间罩住整张画布：点菜单外任意处即关闭并还原命中裁剪 */}
          <div className="isle-menu-overlay" onMouseDown={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu() }} />
          <div className="isle-menu" style={{ left: menu.x, top: menu.y }} role="menu">
            <button type="button" role="menuitem" onClick={() => stashTo('top')}>隐藏到屏幕上方</button>
            <button type="button" role="menuitem" onClick={() => stashTo('right')}>隐藏到屏幕右侧</button>
            <button type="button" role="menuitem" onClick={() => stashTo('left')}>隐藏到屏幕左侧</button>
          </div>
        </>
      )}
    </div>
  )
}
