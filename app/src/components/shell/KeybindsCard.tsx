import { useState } from 'react'
import {
  KEYBIND_ACTIONS, DEFAULT_KEYBINDS, loadKeybinds, saveKeybinds,
  comboFromEvent, findConflict, displayCombo, wheelComboAllowed, type Keybinds,
} from '../../engine/keybinds'
import type { KeybindAction } from '../../types/keybinds'

/**
 * 键盘快捷键设置卡（0.4-3，放 设置 → 工具轮盘 选项卡——同属快捷操作）：
 * 每行点击「改键」进入录制态，按下任意键完成；Esc 取消。
 * 保存前做冲突校验（与其他动作撞键则拒绝并提示）；轮盘键额外要求组合键
 * （单键会劫持一切输入，Rust 侧同样把关）。
 */
export function KeybindsCard({ active }: { active: boolean }) {
  const [kb, setKb] = useState<Keybinds>(() => loadKeybinds())
  const [recording, setRecording] = useState<KeybindAction | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const commit = (action: KeybindAction, combo: string | null) => {
    setRecording(null)
    if (!combo) return // Esc 取消
    const conflict = findConflict(kb, action, combo)
    if (conflict) {
      const occupied = KEYBIND_ACTIONS.find((a) => a.key === conflict)
      setMsg({ ok: false, text: `${displayCombo(combo)} 已被「${occupied?.label}」占用——先改走那个键位，或换个键` })
      return
    }
    if (action === 'wheel' && !wheelComboAllowed(combo)) {
      setMsg({ ok: false, text: '工具轮盘是全局键：需要 Ctrl/Alt/Shift 组合键 + 字母/数字/F 键（单键会劫持其他应用的输入）' })
      return
    }
    const next = { ...kb, [action]: combo }
    setKb(next)
    saveKeybinds(next)
    setMsg({ ok: true, text: action === 'wheel' ? `工具轮盘键已改为 ${displayCombo(combo)}，桌面版立即生效（网页版重启后生效）` : `「${KEYBIND_ACTIONS.find((a) => a.key === action)?.label}」已改为 ${displayCombo(combo)}` })
  }

  return (
    <div className="set-card" data-tab="wheel" style={{ display: active ? undefined : 'none' }}>
      <h2>键盘快捷键</h2>
      <div className="desc">按自己的习惯改键位。命令面板的 / 永远可用；改键后帮助页的快捷键表同步更新。</div>
      <div className="set-body">
        {KEYBIND_ACTIONS.map(({ key, label, desc }) => (
          <div className="set-row" key={key}>
            <label>{label}</label>
            <span className="val" style={{ fontSize: 'var(--fs-xs)' }}>{desc}</span>
            {recording === key ? (
              <button
                type="button"
                className="btn-primary"
                style={{ flex: 'none', minWidth: 96 }}
                autoFocus
                onKeyDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (e.key === 'Escape') {
                    setRecording(null)
                    setMsg(null)
                    return
                  }
                  commit(key, comboFromEvent(e))
                }}
              >
                按下新键位…
              </button>
            ) : (
              <button type="button" className="btn-ghost" style={{ flex: 'none', minWidth: 96 }} onClick={() => { setMsg(null); setRecording(key) }}>
                {displayCombo(kb[key])}
              </button>
            )}
          </div>
        ))}
        {msg && (
          <div className="set-row">
            <label></label>
            <span className="val" style={{ fontSize: 'var(--fs-xs)', color: msg.ok ? 'var(--ok)' : 'var(--danger)' }}>{msg.text}</span>
          </div>
        )}
        <div className="set-row">
          <label>重置</label>
          <button
            type="button"
            className="btn-ghost"
            style={{ flex: 'none' }}
            onClick={() => {
              setKb({ ...DEFAULT_KEYBINDS })
              saveKeybinds({ ...DEFAULT_KEYBINDS })
              setMsg({ ok: true, text: '已恢复默认键位' })
            }}
          >
            恢复默认键位
          </button>
        </div>
      </div>
    </div>
  )
}
