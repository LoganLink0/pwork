import { useState } from 'react'
import { isDesktopApp } from '../../engine/platform'
import { toast } from '../../engine/toast'
import { DEFAULT_WHEEL_SLOTS, loadWheelSlots, saveWheelSlots, type WheelSlot } from '../../content/wheel'
import { Icon } from './icons'

/** 动作类型：中文标签 + 随动作的固定图标（图标不再让用户选——英文名选择器是理解负担） */
const KINDS: { kind: WheelSlot['kind']; label: string; icon: string; hint: string }[] = [
  { kind: 'route', label: '打开页面', icon: 'grid', hint: '应用里的页面，如 待办、信息日报' },
  { kind: 'quick', label: '速记浮层', icon: 'zap', hint: '弹出速记窗口，随手记一条' },
  { kind: 'fetch', label: '立即抓取', icon: 'rss', hint: '抓一轮所有信源' },
  { kind: 'url', label: '打开网址', icon: 'globe', hint: '任意网站地址' },
]

/**
 * 设置 → 工具轮盘（2026-10-28 重做到位）：画出轮盘本身（呼出形态同款圆形布局），
 * 点格就地编辑——动作四选（中文）、目标、格名；图标随动作自动；全部控件走标准类（字号受控 13px）。
 */
export function WheelSettingsCard({ active }: { active: boolean }) {
  const [slots, setSlots] = useState<WheelSlot[]>(loadWheelSlots)
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState<string | null>(null)

  const patch = (id: string, p: Partial<WheelSlot>) => {
    setSlots((ss) => ss.map((s) => (s.id === id ? { ...s, ...p } : s)))
  }

  const save = () => {
    const ok = slots.filter((s) => s.kind === 'quick' || s.kind === 'fetch' || s.target?.trim())
    saveWheelSlots(ok)
    setSlots(ok)
    setMsg(`已保存 ${ok.length} 个格位（下次呼出生效）`)
    toast('ok', '工具轮盘格位已保存')
  }

  const n = slots.length
  const slotName = (s: WheelSlot) => s.label?.trim() || KINDS.find((k) => k.kind === s.kind)?.label || ''
  const editingSlot = slots.find((x) => x.id === editing) ?? null
  const editingIndex = editingSlot ? slots.indexOf(editingSlot) : -1

  return (
    <div className="set-card" data-tab="wheel" style={{ display: active ? undefined : 'none' }}>
      <h2>工具轮盘</h2>
      <div className="desc">桌面版按 <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Q</kbd> 任何地方呼出的一圈快捷入口——下面就是轮盘本身，点哪个格改哪个</div>
      <div className="set-body">
        {!isDesktopApp() && (
          <div className="notice">
            当前是浏览器版：轮盘是桌面版功能，这里可以预设格位（两边配置各自存本地）。浏览器版的同等入口是 <kbd>Ctrl</kbd>+<kbd>K</kbd> 命令面板。
          </div>
        )}

        <div className="wheel-edit">
          <div className="wheel-ring wheel-edit-ring">
            {slots.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`wheel-slot${editing === s.id ? ' editing' : ''}`}
                style={{ '--i': i, '--n': n } as React.CSSProperties}
                onClick={() => setEditing(editing === s.id ? null : s.id)}
                aria-label={`编辑第 ${i + 1} 格：${slotName(s)}`}
              >
                <Icon name={KINDS.find((k) => k.kind === s.kind)?.icon ?? 'zap'} size={20} />
                <span>{slotName(s)}</span>
              </button>
            ))}
            <div className="wheel-edit-center">
              {editingSlot ? `正在改第 ${editingIndex + 1} 格` : '点一圈里的格子编辑'}
            </div>
          </div>

          {editingSlot && (
            <div className="wheel-edit-panel">
              <div className="wgroup-title">第 {editingIndex + 1} 格放什么</div>
              <div className="radio" role="radiogroup" aria-label="动作类型">
                {KINDS.map((k) => (
                  <button
                    key={k.kind}
                    type="button"
                    className={editingSlot.kind === k.kind ? 'on' : ''}
                    aria-pressed={editingSlot.kind === k.kind}
                    onClick={() => patch(editingSlot.id, { kind: k.kind, icon: k.icon })}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                {KINDS.find((k) => k.kind === editingSlot.kind)?.hint}
              </span>
              {(editingSlot.kind === 'route' || editingSlot.kind === 'url') && (
                <input
                  className="input"
                  style={{ maxWidth: 420 }}
                  value={editingSlot.target ?? ''}
                  placeholder={editingSlot.kind === 'route' ? '页面路径，如 /tasks（待办）' : 'https://…'}
                  aria-label="目标"
                  onChange={(e) => patch(editingSlot.id, { target: e.target.value })}
                />
              )}
              <input
                className="input"
                style={{ maxWidth: 200 }}
                value={editingSlot.label ?? ''}
                placeholder="格名（可不填，默认用动作名）"
                aria-label="格名"
                onChange={(e) => patch(editingSlot.id, { label: e.target.value })}
              />
              <div className="chips">
                <button type="button" className="mini-btn" onClick={() => {
                  const j = (editingIndex - 1 + n) % n
                  setSlots((ss) => { const t = [...ss]; [t[editingIndex], t[j]] = [t[j]!, t[editingIndex]!]; return t })
                }}>← 左移一格</button>
                <button type="button" className="mini-btn" onClick={() => {
                  const j = (editingIndex + 1) % n
                  setSlots((ss) => { const t = [...ss]; [t[editingIndex], t[j]] = [t[j]!, t[editingIndex]!]; return t })
                }}>右移一格 →</button>
                <button type="button" className="mini-btn" onClick={() => { setSlots((ss) => ss.filter((x) => x.id !== editingSlot.id)); setEditing(null) }}>✕ 删除这一格</button>
              </div>
            </div>
          )}

          <div className="chips">
            <button type="button" className="btn-ghost" onClick={() => setSlots((ss) => ss.length >= 8 ? ss : [...ss, { id: `slot_${Date.now().toString(36)}`, label: '', icon: 'grid', kind: 'route', target: '/' }])} disabled={slots.length >= 8}>＋ 加一格</button>
            <button type="button" className="btn-primary" onClick={save}>保存格位</button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => { saveWheelSlots(DEFAULT_WHEEL_SLOTS); setSlots([...DEFAULT_WHEEL_SLOTS]); setEditing(null); setMsg('已恢复默认格位') }}
            >
              恢复默认
            </button>
            {msg && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ok)' }}>{msg}</span>}
          </div>
          <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
            呼出后 <kbd>←</kbd><kbd>→</kbd> 选择、<kbd>↵</kbd> 执行、<kbd>Esc</kbd> 关闭；呼出键固定 <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Q</kbd>，自定义键位与快捷键自定义一起做。最多 8 格。
          </span>
        </div>
      </div>
    </div>
  )
}
