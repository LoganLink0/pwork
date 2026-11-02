import { describe, expect, it } from 'vitest'
import { applyDrop, DEFAULT_WHEEL_SLOTS, loadWheelSlots, saveWheelSlots, type WheelSlot } from './wheel'

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

  it('url 格位只放行 http(s) 协议、route 格位只放行站内路径，其余格位被读取层剔除', () => {
    saveWheelSlots([
      { id: 'ok', label: '正常外链', icon: 'globe', kind: 'url', target: 'https://a.com' },
      { id: 'rel', label: '无协议', icon: 'globe', kind: 'url', target: 'a.com/path' },
      { id: 'js', label: '脚本', icon: 'globe', kind: 'url', target: 'javascript:alert(1)' },
      { id: 'data', label: '数据页', icon: 'globe', kind: 'url', target: 'data:text/html,x' },
      { id: 'ext', label: '外部路由', icon: 'grid', kind: 'route', target: 'https://evil.com' },
      { id: 'inner', label: '站内', icon: 'grid', kind: 'route', target: '/process' },
    ])
    const got = loadWheelSlots()
    expect(got.map((s) => s.id)).toEqual(['ok', 'rel', 'inner'])
  })

  describe('applyDrop（拖放落格纯逻辑）', () => {
    const base: WheelSlot[] = [
      { id: 'a', label: '甲', icon: 'zap', kind: 'quick' },
      { id: 'b', label: '乙', icon: 'rss', kind: 'fetch' },
    ]
    const card: WheelSlot = { id: 'x', label: '新动作', icon: 'grid', kind: 'route', target: '/goals' }

    it('拖到已有格 = 同 id 替换，数量不变', () => {
      const got = applyDrop(base, 'a', card)
      expect(got).toHaveLength(2)
      expect(got[0]!.id).toBe('a')
      expect(got[0]!.label).toBe('新动作')
      expect(got[0]!.kind).toBe('route')
    })

    it('拖到新 id = 追加，数量 +1', () => {
      const got = applyDrop(base, 'new-1', card)
      expect(got).toHaveLength(3)
      expect(got[2]!.id).toBe('new-1')
    })

    it('满 8 格后新 id 拖入被拒（返回原数组）', () => {
      const full: WheelSlot[] = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, label: `格${i}`, icon: 'grid', kind: 'route', target: '/p' }))
      expect(applyDrop(full, 'extra', card)).toHaveLength(8)
    })
  })
})
