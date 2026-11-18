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
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  /** 驻留模式：Rust 拖拽判定/挂载恢复共同维护 */
  const [mode, setMode] = useState<SavedPos['mode']>('top')
  /** 收起隐藏态（缘停靠 logo 半探入边缘/free 半透明淡出；命中区=logo 屏内可见部分；四模式统一） */
  const [peek, setPeek] = useState(true)
  const openTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  const noticeTimer = useRef<number | null>(null)
  /** 拖放收起后的进入抑制：缩窗瞬间光标还在小窗上，合成 mouseenter 会让刚收回的岛立即弹回展开——
      抑制到下一次 mouseleave（离开后再靠近才正常展开） */
  const suppressEnter = useRef(false)
  /** 右键收纳菜单（画布内坐标；null=关闭） */
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const clearTimers = () => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null }
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
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

  useEffect(() => {
    let disposed = false
    // 先等 prefs.json 缓存预热再读位置——否则 mount 与预热竞速会回落 localStorage 旧值
    // （配置文件化后设置页重置只写 prefs.json，两处存储在真实档案里会分叉，回落值是过期的）
    void import('../../engine/prefsFile')
      .then((m) => m.readPrefsFile())
      .then(() => {
        if (disposed) return
        const pos = readPos()
        setMode(pos.mode)
        // 窗 visible:false 起始——先落位/缩成隐藏小窗再 show，变形过程不露帧（show 挂链尾）
        const show = () => {
          if (readEnabled()) void invoke('isle_show').catch(() => {})
        }
        if (pos.mode === 'free' && pos.x !== undefined && pos.y !== undefined) {
          // 自由驻留：先落位画布，再锚 logo 缩为隐藏小窗（2026-11-18 中央隐藏接入）
          void invoke('isle_place', { x: pos.x, y: pos.y })
            .then(() => invoke('isle_peek', { mode: 'free', y: 0 }))
            .then(show)
            .catch((e) => reportIsleError('岛.驻留定位', e))
        } else if (pos.mode === 'right') {
          void invoke('isle_peek', { mode: 'right', y: pos.y ?? 0 }).then(show).catch((e) => reportIsleError('岛.右缘隐藏', e))
        } else if (pos.mode === 'left') {
          void invoke('isle_peek', { mode: 'left', y: pos.y ?? 0 }).then(show).catch((e) => reportIsleError('岛.左缘隐藏', e))
        } else {
          void invoke('isle_peek', { mode: 'top', y: 0 }).then(show).catch((e) => reportIsleError('岛.顶缘隐藏', e))
        }
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
      if (!e.payload?.keys?.includes(SETTINGS_KEY)) return
      // 失效后同步读只会回落 localStorage 旧值（2026-11-18 开关「关了又自己开回来」根因：
      // 事件处理读了本窗 stale cache；置空缓存不重拉则回落值过期——必须 await 重拉文件再读）
      void refreshPrefsFile().then(() => {
        if (readEnabled()) {
          // 打开=直接展开完整横条（只 show 会停在 logo 小窗并被收回计时器收走——「闪现一下消失」根因）
          const pos = readPos()
          setOpen(true)
          setPeek(false)
          void invoke('isle_expand', { mode: pos.mode, y: pos.y ?? 0 }).catch(() => invoke('isle_show').catch(() => {}))
        } else {
          clearTimers()
          setOpen(false)
          void invoke('isle_hide').catch(() => {})
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
  // 模式；随即收起隐藏（logo 半探入边缘/半透明淡出，2026-11-18 四模式统一），松手即收起
  useEffect(() => {
    let un: (() => void) | undefined
    void listen<{ mode: SavedPos['mode']; x: number; y: number; moved: boolean }>('isle-drag-end', (e) => {
      const { mode: m, x, y, moved } = e.payload
      setOpen(false)
      setDragging(false)
      if (moved) {
        setMode(m)
        setPeek(true)
        // 热区在光标落点附近，合成 enter 会让刚收起的岛立即弹回展开——抑制到离开
        suppressEnter.current = true
        if (m === 'top') savePos({ mode: 'top' })
        else if (m === 'right') savePos({ mode: 'right', y })
        else if (m === 'left') savePos({ mode: 'left', y })
        else savePos({ mode: 'free', x, y })
        // 先让 peek 类生效（横条瞬间隐藏）再缩命中区，避免可见横条被裁块闪现
        requestAnimationFrame(() => {
          void invoke('isle_peek', { mode: m, y }).catch((err) => reportIsleError('岛.落位收回', err))
        })
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

  // 呼出/收回（2026-11-18 四模式统一：收起隐藏=把手可见+命中区裁为 logo 屏内可见部分）：
  // 鼠标进入把手即命中，先清命中裁剪（region 外不可见——不清则展开内容被裁在热区里），
  // 再展开——次序不能反。
  const onEnter = () => {
    if (dragging) return
    if (suppressEnter.current) return
    clearTimers()
    setMenu(null)
    if (peek) {
      const pos = readPos()
      void invoke('isle_expand', { mode, y: pos.y ?? 0 }).catch((e) => reportIsleError('岛.呼出恢复', e))
    }
    openTimer.current = window.setTimeout(() => {
      setOpen(true)
      setPeek(false)
    }, 200)
  }
  const onLeave = () => {
    if (dragging) return
    suppressEnter.current = false // 离开即解除落位抑制，下次靠近正常展开
    setMenu(null)
    clearTimers()
    closeTimer.current = window.setTimeout(() => {
      setOpen(false)
      const pos = readPos()
      setPeek(true)
      // 先让 peek 类生效（横条瞬间隐藏）再缩命中区——次序反了会把还可见的横条裁块闪现
      requestAnimationFrame(() => {
        void invoke('isle_peek', { mode, y: pos.y ?? 0 }).catch((e) => reportIsleError('岛.隐藏变形', e))
      })
    }, 1000)
  }
  // 右键收纳菜单：先清命中裁剪（菜单要在整窗内渲染，收起态 region 会裁掉它），
  // 菜单位置钳在画布内（画布只有 520×140，右缘/底部点击时向内收）
  const onContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault()
    if ((e.target as HTMLElement).closest('button')) return
    clearTimers()
    void invoke('isle_unclip').catch((e2) => reportIsleError('岛.菜单清裁剪', e2))
    const menuW = 148
    const menuH = 78
    setMenu({
      x: Math.max(6, Math.min(e.clientX, 520 - menuW - 6)),
      y: Math.max(6, Math.min(e.clientY, 140 - menuH - 6)),
    })
  }
  const closeMenu = () => {
    if (!menu) return
    setMenu(null)
    // 关闭即恢复收起命中裁剪（横条本就隐藏，region 回落无闪现风险）
    if (peek) {
      const pos = readPos()
      void invoke('isle_peek', { mode, y: pos.y ?? 0 }).catch((e) => reportIsleError('岛.菜单还原', e))
    }
  }
  // 收纳动作：Rust 落位+套收起裁剪并返回落位，前端持久化与状态收起
  const stashTo = (target: 'center' | 'right') => {
    setMenu(null)
    clearTimers()
    setOpen(false)
    setPeek(true)
    suppressEnter.current = true
    requestAnimationFrame(() => {
      void invoke('isle_stash_to', { target })
        .then((pos) => {
          const p = pos as { mode: SavedPos['mode']; x: number; y: number }
          setMode(p.mode)
          if (p.mode === 'right') savePos({ mode: 'right', y: p.y })
          else savePos({ mode: 'free', x: p.x, y: p.y })
        })
        .catch((e) => reportIsleError('岛.收纳', e))
    })
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
            <button type="button" role="menuitem" onClick={() => stashTo('center')}>隐藏到屏幕中央</button>
            <button type="button" role="menuitem" onClick={() => stashTo('right')}>隐藏到屏幕右侧</button>
          </div>
        </>
      )}
    </div>
  )
}
