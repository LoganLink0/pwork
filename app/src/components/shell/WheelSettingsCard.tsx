import { useState } from 'react'
import { isDesktopApp } from '../../engine/platform'
import { toast } from '../../engine/toast'
import { loadWheelSlots, saveWheelSlots, DEFAULT_WHEEL_SLOTS, type WheelSlot } from '../../content/wheel'
import { Icon } from './icons'

/** 可拖入轮盘的动作卡：预设常用页面 + 三个功能动作；自定义网址拖入后填地址 */
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
  { id: 'c_url', label: '自定义网址', icon: 'globe', kind: 'url', target: '', note: '拖入后填地址' },
]

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
    const ok = slots.filter((s) => s.kind === 'quick' || s.kind === 'fetch' || s.target?.trim())
    saveWheelSlots(ok)
    setSlots(ok)
    setMsg(`已保存 ${ok.length} 个格位（下次呼出生效）`)
    toast('ok', '工具轮盘格位已保存')
  }

  const dropOn = (slotId: string, e: React.DragEvent) => {
    e.preventDefault()
    setHoverSlot(null)
    try {
      const card = JSON.parse(e.dataTransfer.getData('text/plain')) as WheelSlot
      if (!card.kind) return
      const entry: WheelSlot = {
        id: slotId,
        label: card.label ?? '',
        icon: card.icon ?? 'zap',
        kind: card.kind,
        target: card.target,
      }
      setSlots((ss) => {
        const exists = ss.some((s) => s.id === slotId)
        return exists ? ss.map((s) => (s.id === slotId ? entry : s)) : [...ss, entry]
      })
      if (card.kind === 'url' && !card.target) setUrlDraftFor(slotId)
    } catch {
      /* 拖的不是动作卡则忽略 */
    }
  }

  const removeSlot = (slotId: string) => setSlots((ss) => ss.filter((s) => s.id !== slotId))

  const n = slots.length + (slots.length < 8 ? 1 : 0) // 实格与虚线空格一起均分——空格落位在下一档，不压任何实格
  const slotName = (s: WheelSlot) => s.label?.trim() || (s.kind === 'quick' ? '速记浮层' : s.kind === 'fetch' ? '立即抓取' : s.kind === 'url' ? '网址' : '页面')

  return (
    <div className="set-card" data-tab="wheel" style={{ display: active ? undefined : 'none' }}>
      <h2>工具轮盘</h2>
      <div className="desc">
        桌面版按 <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Q</kbd> 任何地方呼出的一圈快捷入口。
        自定义方式：<b>把右边的动作卡片拖进左边轮盘的格子里</b>；格子右上角 × 删除，空的虚线格可以继续拖。
      </div>
      <div className="set-body">
        {!isDesktopApp() && (
          <div className="notice">
            当前是浏览器版：轮盘是桌面版功能，这里可以预设格位（两边配置各自存本地）。浏览器版的同等入口是 <kbd>Ctrl</kbd>+<kbd>K</kbd> 命令面板。
          </div>
        )}

        <div className="wheel-dnd">
          <div className="wheel-ring wheel-edit-ring">
            {slots.map((s, i) => (
              <div
                key={s.id}
                className={`wheel-slot wheel-drop${hoverSlot === s.id ? ' drop-hover' : ''}`}
                style={{ '--i': i, '--n': n } as React.CSSProperties}
                onDragOver={(e) => { e.preventDefault(); setHoverSlot(s.id) }}
                onDragLeave={() => setHoverSlot((h) => (h === s.id ? null : h))}
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
            {slots.length < 8 && (
              <div
                className="wheel-slot wheel-slot-empty"
                style={{ '--i': slots.length, '--n': n } as React.CSSProperties}
                onDragOver={(e) => { e.preventDefault(); setHoverSlot('__new__') }}
                onDragLeave={() => setHoverSlot((h) => (h === '__new__' ? null : h))}
                onDrop={(e) => dropOn(`slot_${Date.now().toString(36)}`, e)}
                title="拖动作卡片到这里新增"
              >
                <span>拖入新增</span>
              </div>
            )}
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
              {ACTION_CARDS.map((c) => (
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
              呼出后 <kbd>←</kbd><kbd>→</kbd> 选择、<kbd>↵</kbd> 执行、<kbd>Esc</kbd> 关闭；呼出键固定 <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Q</kbd>，自定义键位与快捷键自定义一起做。
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
