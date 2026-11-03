import { useState } from 'react'
import { isDesktopApp, isMac } from '../../engine/platform'
import { toast } from '../../engine/toast'
import { wheelLabelLive } from '../../engine/keybinds'
import { applyDrop, loadWheelSlots, saveWheelSlots, DEFAULT_WHEEL_SLOTS, type WheelSlot } from '../../content/wheel'
import { Icon } from './icons'

/** 可拖入轮盘的动作卡：预设常用页面 + 功能动作；自定义网址拖入后填地址。
 *  置顶为 Windows 专属（macOS 公开 API 不支持置顶其他应用窗口），mac 上不出现该卡 */
const ACTION_CARDS: (WheelSlot & { note: string })[] = [
  { id: 'c_today', label: '今日', icon: 'today', kind: 'route', target: '/', note: '工作台首页' },
  { id: 'c_tasks', label: '待办', icon: 'tasks', kind: 'route', target: '/tasks', note: '任务库' },
  { id: 'c_goals', label: '目标', icon: 'goals', kind: 'route', target: '/goals', note: '目标库' },
  { id: 'c_notes', label: '速记页', icon: 'pen', kind: 'route', target: '/input/notes', note: '速记列表' },
  { id: 'c_digest', label: '信息日报', icon: 'fileText', kind: 'route', target: '/input/digest', note: '每天精选' },
  { id: 'c_sources', label: '信源', icon: 'rss', kind: 'route', target: '/input/sources', note: '信源管理' },
  { id: 'c_items', label: '条目库', icon: 'archive', kind: 'route', target: '/input/items', note: '全部条目' },
  { id: 'c_process', label: '工具箱', icon: 'grid', kind: 'route', target: '/process', note: '常用工具' },
  { id: 'c_report', label: '周报月报', icon: 'barChart', kind: 'route', target: '/output/report', note: '报告成稿' },
  { id: 'c_review', label: '新建复盘', icon: 'repeat', kind: 'route', target: '/review/new', note: '开始复盘' },
  { id: 'c_help', label: '帮助', icon: 'helpCircle', kind: 'route', target: '/help', note: '使用说明' },
  { id: 'c_quick', label: '速记浮层', icon: 'zap', kind: 'quick', note: '弹出随手记' },
  { id: 'c_fetch', label: '立即抓取', icon: 'rss', kind: 'fetch', note: '抓一轮信源' },
  { id: 'c_topmost', label: '置顶窗口', icon: 'target', kind: 'topmost', note: '钉住/取消钉住当前窗口（Windows）' },
  { id: 'c_url', label: '自定义网址', icon: 'globe', kind: 'url', target: '', note: '拖入后填地址' },
]

/** 置顶卡仅 Windows 展示（macOS 公开 API 不支持置顶其他应用窗口） */
const ACTION_CARDS_VISIBLE = ACTION_CARDS.filter((c) => c.kind !== 'topmost' || !isMac())

/**
 * 设置 → 工具轮盘（2026-10-28 拖拽版定稿）：左边是轮盘本身，右边是全部可选的动作卡片——
 * 把卡片拖到轮盘的格里即完成自定义；格子上 × 删除、空虚线格可继续拖入。零英文、零中间概念。
 */
export function WheelSettingsCard({ active }: { active: boolean }) {
  const [slots, setSlots] = useState<WheelSlot[]>(loadWheelSlots)
  const [msg, setMsg] = useState('')
  const [hoverSlot, setHoverSlot] = useState<string | null>(null)
  const [urlDraftFor, setUrlDraftFor] = useState<string | null>(null) // 拖入「自定义网址」后待填地址的格

  const save = () => {
    const ok = slots.filter((s) => s.kind === 'quick' || s.kind === 'fetch' || s.kind === 'topmost' || s.target?.trim())
    saveWheelSlots(ok)
    setSlots(ok)
    setMsg(`已保存 ${ok.length} 个格位（下次呼出生效）`)
    toast('ok', '工具轮盘格位已保存')
  }

  const dropOn = (slotId: string, e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setHoverSlot(null)
    setDragOverRing(false)
    try {
      const card = JSON.parse(e.dataTransfer.getData('text/plain')) as WheelSlot
      if (!card.kind) return
      setSlots((ss) => applyDrop(ss, slotId, card))
      if (card.kind === 'url' && !card.target) setUrlDraftFor(slotId)
    } catch {
      /* 拖的不是动作卡则忽略 */
    }
  }

  const removeSlot = (slotId: string) => setSlots((ss) => ss.filter((s) => s.id !== slotId))
  // 环空白处的拖放 = 新增格位（拖到已有格子上则是替换，格位层 stopPropagation 不冒泡到环）
  const [dragOverRing, setDragOverRing] = useState(false)

  const slotName = (s: WheelSlot) => s.label?.trim() || (s.kind === 'quick' ? '速记浮层' : s.kind === 'fetch' ? '立即抓取' : s.kind === 'url' ? '网址' : '页面')

  return (
    <div className="set-card" data-tab="wheel" style={{ display: active ? undefined : 'none' }}>
      <h2>工具轮盘</h2>
      <div className="desc">
        桌面版按 <kbd>{wheelLabelLive()}</kbd> 任何地方呼出的一圈快捷入口（呼出键在左侧导航「键盘快捷键」分类修改，这里同步显示）。
        <br />
        自定义方式：<b style={{ color: 'var(--accent-text)' }}>把右边的动作卡片拖进左边轮盘的格子里</b>——拖到已有格子上是替换，拖到环的空白处是新增；格子右上角 × 删除。
      </div>
      <div className="set-body">
        {!isDesktopApp() && (
          <div className="notice">
            当前是浏览器版：轮盘是桌面版功能，这里可以预设格位（两边配置各自存本地）。浏览器版的同等入口是 <kbd>Ctrl</kbd>+<kbd>K</kbd> 命令面板。
          </div>
        )}

        <div className="wheel-dnd">
          <div
            className={`wheel-ring wheel-edit-ring${dragOverRing ? ' drop-ready' : ''}`}
            onDragOver={(e) => {
              if (slots.length >= 8) return
              e.preventDefault()
              setDragOverRing(true)
            }}
            onDragLeave={() => setDragOverRing(false)}
            onDrop={(e) => slots.length < 8 && dropOn(`slot_${Date.now().toString(36)}`, e)}
          >
            {slots.map((s, i) => (
              <div
                key={s.id}
                className={`wheel-slot wheel-drop${hoverSlot === s.id ? ' drop-hover' : ''}`}
                style={{ '--i': i, '--n': slots.length } as React.CSSProperties}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setHoverSlot(s.id); setDragOverRing(false) }}
                onDragLeave={(e) => { e.stopPropagation(); setHoverSlot((h) => (h === s.id ? null : h)) }}
                onDrop={(e) => dropOn(s.id, e)}
                title="拖动作卡片到这里替换"
              >
                <Icon name={s.icon} size={20} />
                <span>{slotName(s)}</span>
                <button
                  type="button"
                  className="wheel-slot-del"
                  aria-label={`删除「${slotName(s)}」`}
                  onClick={() => removeSlot(s.id)}
                >
                  ×
                </button>
              </div>
            ))}
            <div className="wheel-edit-center">{slots.length} / 8 格</div>
          </div>

          <div className="wheel-actions">
            <div className="wgroup-title">可选动作——拖到左边轮盘里</div>
            {urlDraftFor && (
              <div className="chips" style={{ marginBottom: 'var(--sp-2)' }}>
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 200 }}
                  placeholder="这一格要打开的网址 https://…"
                  aria-label="自定义网址"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    const v = (e.target as HTMLInputElement).value.trim()
                    if (v) setSlots((ss) => ss.map((s) => (s.id === urlDraftFor ? { ...s, target: v } : s)))
                    setUrlDraftFor(null)
                  }}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v) setSlots((ss) => ss.map((s) => (s.id === urlDraftFor ? { ...s, target: v } : s)))
                    setUrlDraftFor(null)
                  }}
                />
              </div>
            )}
            <div className="wheel-action-grid">
              {ACTION_CARDS_VISIBLE.map((c) => (
                <div
                  key={c.id}
                  className="wheel-action-card"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', JSON.stringify({ kind: c.kind, target: c.target, label: c.label, icon: c.icon }))
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                >
                  <Icon name={c.icon} size={16} />
                  <b>{c.label}</b>
                  <span>{c.note}</span>
                </div>
              ))}
            </div>
            <div className="chips" style={{ marginTop: 'var(--sp-2)' }}>
              <button type="button" className="btn-primary" onClick={save}>保存格位</button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => { saveWheelSlots(DEFAULT_WHEEL_SLOTS); setSlots([...DEFAULT_WHEEL_SLOTS]); setMsg('已恢复默认格位') }}
              >
                恢复默认
              </button>
              {msg && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ok)' }}>{msg}</span>}
            </div>
            <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
              轮盘在鼠标位置弹出、不夺焦点（系统工具形态）：点格位执行、点空白处关闭、热键再按一次关闭，12 秒无操作自动隐藏。呼出键 <kbd>{wheelLabelLive()}</kbd>（在左侧导航「键盘快捷键」分类可改）。
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
