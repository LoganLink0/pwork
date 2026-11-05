import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  KEYBIND_ACTIONS, defaultKeybinds, loadKeybinds, saveKeybinds,
  comboFromEvent, findConflict, displayCombo, wheelComboAllowed, type Keybinds,
} from '../../engine/keybinds'
import type { KeybindAction } from '../../types/keybinds'
import { isDesktopApp } from '../../engine/platform'
import { toast } from '../../engine/toast'

/**
 * 键盘快捷键设置卡（0.4-3，放 设置 → 工具轮盘 选项卡——同属快捷操作）：
 * 每行点击「改键」进入录制态，按下任意键完成；Esc 取消。
 * 保存前做冲突校验（与其他动作撞键则拒绝并提示）；轮盘/置顶为全局键，额外要求组合键
 * （单键会劫持一切输入，Rust 侧同样把关）；改键即经 register_global_hotkeys 重注册，立即生效。
 */
export function KeybindsCard({ active }: { active: boolean }) {
  const [kb, setKb] = useState<Keybinds>(() => loadKeybinds())
  const [recording, setRecording] = useState<KeybindAction | null>(null)

  const commit = (action: KeybindAction, combo: string | null) => {
    setRecording(null)
    if (!combo) return // Esc 取消
    const conflict = findConflict(kb, action, combo)
    if (conflict) {
      const occupied = KEYBIND_ACTIONS.find((a) => a.key === conflict)
      toast('error', `${displayCombo(combo)} 已被「${occupied?.label}」占用——先改走那个键位，或换个键`)
      return
    }
    const isGlobalKey = action === 'wheel' || action === 'topmost' || action === 'clipboard'
    if (isGlobalKey && !wheelComboAllowed(combo)) {
      toast('error', '全局键需要 Ctrl/Alt/Shift 组合键 + 字母/数字/F 键（单键会劫持其他应用的输入）')
      return
    }
    const next = { ...kb, [action]: combo }
    setKb(next)
    saveKeybinds(next)
    const label = KEYBIND_ACTIONS.find((a) => a.key === action)?.label ?? ''
    if (isDesktopApp() && isGlobalKey) {
      invoke('register_global_hotkeys', { wheel: next.wheel, topmost: next.topmost, clipboard: next.clipboard })
        .then(() => toast('ok', `「${label}」已改为 ${displayCombo(combo)}，立即生效`))
        .catch((e: unknown) => toast('error', `配置已保存，但热键注册失败（可能被其他应用占用）：${e instanceof Error ? e.message : String(e)}`))
      return
    }
    toast('ok', `「${label}」已改为 ${displayCombo(combo)}`)
  }

  return (
    <div className="set-card" data-tab="wheel" style={{ display: active ? undefined : 'none' }}>
      <h2>键位设置</h2>
      <div className="desc">按自己的习惯改键位。命令面板的 / 永远可用；改键后帮助页的快捷键表同步更新。工具轮盘的格位编辑在旁边「工具轮盘」分类。</div>
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
                    return
                  }
                  commit(key, comboFromEvent(e))
                }}
              >
                按下新键位…
              </button>
            ) : (
              <button type="button" className="btn-ghost" style={{ flex: 'none', minWidth: 96 }} onClick={() => setRecording(key)}>
                {displayCombo(kb[key])}
              </button>
            )}
          </div>
        ))}
        <div className="set-row">
          <label>重置</label>
          <button
            type="button"
            className="btn-ghost"
            style={{ flex: 'none' }}
            onClick={() => {
              setKb(defaultKeybinds())
              saveKeybinds(defaultKeybinds())
              toast('ok', '已恢复默认键位')
            }}
          >
            恢复默认键位
          </button>
        </div>
      </div>
    </div>
  )
}
