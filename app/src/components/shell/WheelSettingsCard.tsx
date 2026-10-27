import { useState } from 'react'
import { isDesktopApp } from '../../engine/platform'
import { toast } from '../../engine/toast'
import { DEFAULT_WHEEL_SLOTS, loadWheelSlots, saveWheelSlots, wheelIcons, type WheelSlot } from '../../content/wheel'
import { Icon } from './icons'

const KIND_LABEL: Record<WheelSlot['kind'], string> = {
  route: '打开页面',
  quick: '速记浮层',
  fetch: '立即抓取',
  url: '打开网址',
}

/**
 * 设置 → 工具轮盘（2026-10-27 重做）：按用户拍板改为「直接编辑轮盘本身」——
 * 画出与呼出形态一致的圆形轮盘，点格位就地编辑动作与目标，所见即所得；
 * 去掉旧版每格的「名称」自造字段（显示用动作名+目标），字级压回 13/12px 规范档。
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
  const slotName = (s: WheelSlot) =>
    s.kind === 'quick' ? '速记' : s.kind === 'fetch' ? '立即抓取' : s.kind === 'route' ? (s.label?.trim() || '页面') : (s.label?.trim() || '网址')

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
                <Icon name={s.icon} size={18} />
                <span>{slotName(s)}</span>
              </button>
            ))}
            <div className="wheel-edit-center">
              {editing ? '正在编辑选中格' : '点一圈里的格子编辑'}
            </div>
          </div>

          {editing && (() => {
            const s = slots.find((x) => x.id === editing)
            if (!s) return null
            const i = slots.indexOf(s)
            return (
              <div className="wheel-edit-panel">
                <div className="wgroup-title">第 {i + 1} 格放什么</div>
                <div className="chips">
                  <select value={s.kind} onChange={(e) => patch(s.id, { kind: e.target.value as WheelSlot['kind'] })} aria-label="动作类型">
                    {(['route', 'quick', 'fetch', 'url'] as const).map((k) => (
                      <option key={k} value={k}>{KIND_LABEL[k]}</option>
                    ))}
                  </select>
                  {(s.kind === 'route' || s.kind === 'url') && (
                    <input
                      className="input"
                      style={{ flex: 1, minWidth: 200 }}
                      value={s.target ?? ''}
                      placeholder={s.kind === 'route' ? '页面路径，如 /tasks' : 'https://…'}
                      aria-label="目标"
                      onChange={(e) => patch(s.id, { target: e.target.value })}
                    />
                  )}
                  <select value={s.icon} onChange={(e) => patch(s.id, { icon: e.target.value })} aria-label="图标">
                    {wheelIcons().map((ic) => (
                      <option key={ic} value={ic}>{ic}</option>
                    ))}
                  </select>
                  <input className="input" style={{ maxWidth: 110 }} value={s.label} placeholder="格名（可选）" aria-label="格名" onChange={(e) => patch(s.id, { label: e.target.value })} />
                </div>
                <div className="chips">
                  <button type="button" className="mini-btn" onClick={() => {
                    const j = (i - 1 + n) % n
                    setSlots((ss) => { const t = [...ss]; [t[i], t[j]] = [t[j]!, t[i]!]; return t })
                  }}>← 左移一格</button>
                  <button type="button" className="mini-btn" onClick={() => {
                    const j = (i + 1) % n
                    setSlots((ss) => { const t = [...ss]; [t[i], t[j]] = [t[j]!, t[i]!]; return t })
                  }}>右移一格 →</button>
                  <button type="button" className="mini-btn" onClick={() => { setSlots((ss) => ss.filter((x) => x.id !== s.id)); setEditing(null) }}>✕ 删除这一格</button>
                </div>
              </div>
            )
          })()}

          <div className="chips">
            <button type="button" className="btn-ghost" onClick={() => setSlots((ss) => ss.length >= 8 ? ss : [...ss, { id: `slot_${Date.now().toString(36)}`, label: '', icon: 'zap', kind: 'route', target: '/' }])} disabled={slots.length >= 8}>＋ 加一格</button>
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
