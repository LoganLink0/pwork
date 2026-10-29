import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadKeybinds,
  saveKeybinds,
  normalizeCombo,
  comboFromEvent,
  findConflict,
  displayCombo,
  wheelComboAllowed,
  defaultKeybinds,
} from './keybinds'

/** 键位中心（0.4-3）：归一化 / 录制 / 冲突 / 显示 / 轮盘范围 */

beforeEach(() => {
  localStorage.clear()
})

describe('normalizeCombo', () => {
  it('修饰键定序、主键小写', () => {
    expect(normalizeCombo('Alt+Ctrl+Q')).toBe('ctrl+alt+q')
    expect(normalizeCombo('CTRL + K')).toBe('ctrl+k')
    expect(normalizeCombo('N')).toBe('n')
    expect(normalizeCombo('?')).toBe('?')
  })
  it('无效形态返回 null：空、纯修饰键、双主键、保留键', () => {
    expect(normalizeCombo('')).toBeNull()
    expect(normalizeCombo('ctrl')).toBeNull()
    expect(normalizeCombo('ctrl+k+n')).toBeNull()
    expect(normalizeCombo('escape')).toBeNull()
    expect(normalizeCombo('ctrl+tab')).toBeNull()
  })
})

describe('comboFromEvent（录制）', () => {
  const ev = (over: Partial<KeyboardEvent>): KeyboardEvent =>
    ({ key: '', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...over }) as KeyboardEvent

  it('普通键与组合键', () => {
    expect(comboFromEvent(ev({ key: 'n' }))).toBe('n')
    expect(comboFromEvent(ev({ key: 'k', ctrlKey: true }))).toBe('ctrl+k')
    expect(comboFromEvent(ev({ key: 'q', ctrlKey: true, altKey: true }))).toBe('ctrl+alt+q')
    expect(comboFromEvent(ev({ key: '?' , shiftKey: true }))).toBe('?') // 多数布局 ? = shift+/
  })
  it('纯修饰键按下返回 null（等待主键）', () => {
    expect(comboFromEvent(ev({ key: 'Control', ctrlKey: true }))).toBeNull()
    expect(comboFromEvent(ev({ key: 'Shift', shiftKey: true }))).toBeNull()
  })
})

describe('loadKeybinds / saveKeybinds / findConflict', () => {
  it('无配置 → 默认键位', () => {
    expect(loadKeybinds()).toEqual(defaultKeybinds())
  })
  it('保存后读回；坏值回退默认', () => {
    saveKeybinds({ ...defaultKeybinds(), quickNote: 'j' })
    expect(loadKeybinds().quickNote).toBe('j')
    localStorage.setItem('pwork-keybinds', JSON.stringify({ quickNote: 'escape' }))
    expect(loadKeybinds().quickNote).toBe('n')
  })
  it('冲突检测：改成的键位被别的动作占用时报告占用方', () => {
    expect(findConflict(defaultKeybinds(), 'quickNote', 'ctrl+k')).toBe('palette')
    expect(findConflict(defaultKeybinds(), 'quickNote', 'j')).toBeNull()
    expect(findConflict(defaultKeybinds(), 'palette', 'ctrl+k')).toBeNull() // 自己不算冲突
  })
})

describe('displayCombo / wheelComboAllowed', () => {
  it('显示格式', () => {
    expect(displayCombo('ctrl+alt+q')).toBe('Ctrl+Alt+Q')
    expect(displayCombo('n')).toBe('N')
    expect(displayCombo('?')).toBe('?')
  })
  it('轮盘键必须是组合键且主键在字母/数字/F 键范围', () => {
    expect(wheelComboAllowed('ctrl+alt+q')).toBe(true)
    expect(wheelComboAllowed('f9')).toBe(false) // 单 F 键无修饰键，拒绝
    expect(wheelComboAllowed('ctrl+f9')).toBe(true)
    expect(wheelComboAllowed('n')).toBe(false) // 单字母全局键会劫持输入，拒绝
    expect(wheelComboAllowed('ctrl+?')).toBe(false)
  })
})
