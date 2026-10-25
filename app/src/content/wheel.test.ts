import { describe, expect, it } from 'vitest'
import { DEFAULT_WHEEL_SLOTS, loadWheelSlots, saveWheelSlots } from './wheel'

describe('轮盘格位配置', () => {
  it('默认 6 格；坏数据/空数据回默认', () => {
    localStorage.removeItem('pwork-wheel-slots')
    expect(loadWheelSlots()).toEqual(DEFAULT_WHEEL_SLOTS)
    localStorage.setItem('pwork-wheel-slots', 'not json')
    expect(loadWheelSlots()).toEqual(DEFAULT_WHEEL_SLOTS)
    localStorage.setItem('pwork-wheel-slots', '[]')
    expect(loadWheelSlots()).toEqual(DEFAULT_WHEEL_SLOTS)
    localStorage.setItem('pwork-wheel-slots', JSON.stringify([{ label: '缺 kind' }]))
    expect(loadWheelSlots()).toEqual(DEFAULT_WHEEL_SLOTS)
  })

  it('保存后读取往返一致；超过 8 格截断；缺 id 自动补', () => {
    const slots = [
      ...DEFAULT_WHEEL_SLOTS,
      { id: '', label: '外链', icon: 'globe', kind: 'url' as const, target: 'https://a.com' },
    ]
    saveWheelSlots(slots)
    const got = loadWheelSlots()
    expect(got).toHaveLength(7)
    expect(got[6]!.label).toBe('外链')
    expect(got[6]!.id).not.toBe('')
    // 9 格截到 8
    saveWheelSlots([...slots, ...slots.slice(0, 2).map((s) => ({ ...s, id: `${s.id}-x` }))])
    expect(loadWheelSlots()).toHaveLength(8)
  })
})
