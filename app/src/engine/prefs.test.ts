import { beforeEach, describe, expect, it } from 'vitest'
import { applyAndSavePrefs, loadPrefs, DEFAULT_PREFS, FONT_SCALE_OPTIONS, READING_WIDTH_OPTIONS, FONT_FAMILY_OPTIONS } from './prefs'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.style.removeProperty('--font-scale')
  document.documentElement.style.removeProperty('--reading-width')
  document.documentElement.style.removeProperty('--font-body-override')
})

describe('偏好中心（prefs 引擎）', () => {
  it('默认值：标准 100% / 标准行宽 / 系统字体', () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
    expect(DEFAULT_PREFS).toEqual({ fontScale: 1, readingWidth: 'standard', fontFamily: 'system' })
  })

  it('applyAndSavePrefs：写 CSS 变量 + 持久化；重开（loadPrefs）恢复', () => {
    const next = applyAndSavePrefs({ fontScale: 1.25, readingWidth: 'narrow', fontFamily: 'serif' })
    expect(next.fontScale).toBe(1.25)
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.25')
    expect(document.documentElement.style.getPropertyValue('--reading-width')).toBe('680px')
    expect(document.documentElement.style.getPropertyValue('--font-body-override')).toContain('Georgia')
    expect(loadPrefs()).toEqual(next)
  })

  it('全宽档：行宽变量被移除（不限宽）', () => {
    applyAndSavePrefs({ readingWidth: 'wide' })
    expect(document.documentElement.style.getPropertyValue('--reading-width')).toBe('')
  })

  it('存储损坏/越界值回落默认', () => {
    localStorage.setItem('pwork-prefs', JSON.stringify({ fontScale: 99, readingWidth: 'hacker', fontFamily: 42 }))
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
    localStorage.setItem('pwork-prefs', '{broken json')
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
  })

  it('三组选项清单完整（设置页分段控件数据源）', () => {
    expect(FONT_SCALE_OPTIONS.map((o) => o.value)).toEqual([0.9, 1, 1.1, 1.25, 1.5])
    expect(READING_WIDTH_OPTIONS.map((o) => o.value)).toEqual(['narrow', 'standard', 'wide'])
    expect(FONT_FAMILY_OPTIONS.map((o) => o.value)).toEqual(['system', 'serif', 'mono'])
  })
})
