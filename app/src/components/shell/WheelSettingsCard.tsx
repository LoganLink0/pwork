import { useState } from 'react'
import { isDesktopApp } from '../../engine/platform'
import { toast } from '../../engine/toast'
import { DEFAULT_WHEEL_SLOTS, loadWheelSlots, saveWheelSlots, wheelIcons, type WheelSlot } from '../../content/wheel'

const KIND_LABEL: Record<WheelSlot['kind'], string> = {
  route: '打开页面',
  quick: '速记浮层',
  fetch: '立即抓取',
  url: '打开网址',
}

/**
 * 设置 → 工具轮盘：格位编辑（图标/名称/动作/目标，排序与增删）。
 * 桌面版全局键 Ctrl+Alt+Q 呼出；网页版只读说明（入口由 Ctrl+K 承担）。
 */
export function WheelSettingsCard({ active }: { active: boolean }) {
  const [slots, setSlots] = useState<WheelSlot[]>(loadWheelSlots)
  const [msg, setMsg] = useState('')

  const patch = (id: string, p: Partial<WheelSlot>) =>
    setSlots((ss) => ss.map((s) => (s.id === id ? { ...s, ...p } : s)))
  const move = (i: number, d: -1 | 1) =>
    setSlots((ss) => {
      const j = i + d
      if (j < 0 || j >= ss.length) return ss
      const next = [...ss]
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })
  const add = () =>
    setSlots((ss) =>
      ss.length >= 8 ? ss : [...ss, { id: `slot_${Date.now().toString(36)}`, label: '', icon: 'zap', kind: 'route', target: '/' }],
    )

  const save = () => {
    const ok = slots.filter((s) => s.label.trim() && (s.kind === 'quick' || s.kind === 'fetch' || s.target?.trim()))
    saveWheelSlots(ok)
    setSlots(ok)
    setMsg(`已保存 ${ok.length} 个格位（下次呼出生效）`)
    toast('ok', '工具轮盘格位已保存')
  }

  return (
    <div className="set-card" data-tab="wheel" style={{ display: active ? undefined : 'none' }}>
      <h2>工具轮盘</h2>
      <div className="desc">桌面版按 <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Q</kbd> 任何地方呼出的一圈快捷入口（应用最小化也能唤起窗口）</div>
      <div className="set-body">
        {!isDesktopApp() && (
          <div className="notice">
            当前是浏览器版：轮盘是桌面版功能，这里可以预设格位（两者配置各自存本地）。浏览器版的同等入口是 <kbd>Ctrl</kbd>+<kbd>K</kbd> 命令面板。
          </div>
        )}
        {slots.map((s, i) => (
          <div className="set-row" key={s.id} style={{ flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 'var(--sp-2)', flex: 1, minWidth: 0, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={s.icon} onChange={(e) => patch(s.id, { icon: e.target.value })} aria-label={`第 ${i + 1} 格图标`} style={{ flex: 'none' }}>
                {wheelIcons().map((ic) => (
                  <option key={ic} value={ic}>{ic}</option>
                ))}
              </select>
              <input className="input" style={{ maxWidth: 120 }} value={s.label} placeholder="名称" aria-label={`第 ${i + 1} 格名称`} onChange={(e) => patch(s.id, { label: e.target.value })} />
              <select value={s.kind} onChange={(e) => patch(s.id, { kind: e.target.value as WheelSlot['kind'] })} aria-label={`第 ${i + 1} 格动作`}>
                {(['route', 'quick', 'fetch', 'url'] as const).map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
              {(s.kind === 'route' || s.kind === 'url') && (
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 160 }}
                  value={s.target ?? ''}
                  placeholder={s.kind === 'route' ? '页面路径，如 /tasks' : 'https://…'}
                  aria-label={`第 ${i + 1} 格目标`}
                  onChange={(e) => patch(s.id, { target: e.target.value })}
                />
              )}
            </div>
            <div style={{ display: 'flex', gap: 2, flex: 'none' }}>
              <button type="button" className="mini-btn" onClick={() => move(i, -1)} aria-label={`第 ${i + 1} 格上移`}>↑</button>
              <button type="button" className="mini-btn" onClick={() => move(i, 1)} aria-label={`第 ${i + 1} 格下移`}>↓</button>
              <button type="button" className="mini-btn" onClick={() => setSlots((ss) => ss.filter((x) => x.id !== s.id))} aria-label={`删除第 ${i + 1} 格`}>✕</button>
            </div>
          </div>
        ))}
        <div className="set-row">
          <button type="button" className="btn-ghost" onClick={add} disabled={slots.length >= 8}>＋ 加一格</button>
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
        <div className="set-row">
          <label>说明</label>
          <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
            呼出键目前固定 <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Q</kbd>，自定义键位将在下个版本与快捷键自定义一起做。轮盘里 <kbd>←</kbd><kbd>→</kbd> 选择、<kbd>↵</kbd> 执行、<kbd>Esc</kbd> 关闭。
          </span>
        </div>
      </div>
    </div>
  )
}
