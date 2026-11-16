import { beforeEach, describe, expect, it, vi } from 'vitest'

/* prefs.json 读写层（配置文件化 2026-11-16）：模块级 cache 需要用例间复位，
 * 统一 vi.resetModules + 动态 import 拿新实例 */

const invokeMock = vi.fn()
const recordErrorMock = vi.fn()
const emitMock = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))
vi.mock('@tauri-apps/api/event', () => ({
  emit: (...args: unknown[]) => emitMock(...args),
}))
vi.mock('./platform', () => ({
  isDesktopApp: () => true,
}))
vi.mock('./errorLog', () => ({
  recordError: (...args: unknown[]) => recordErrorMock(...args),
}))

/** 拿一个 cache 干净的新模块实例 */
async function fresh() {
  vi.resetModules()
  return await import('./prefsFile')
}

beforeEach(() => {
  invokeMock.mockReset()
  recordErrorMock.mockReset()
  emitMock.mockReset()
  localStorage.clear()
})

describe('migrateLocalPrefs：localStorage 旧键 → prefs.json', () => {
  it('旧键平移：localStorage 有值 → invoke(prefs_write) 收到同值', async () => {
    invokeMock.mockResolvedValue(null)
    localStorage.setItem('pwork-theme', JSON.stringify('dark'))
    localStorage.setItem('pwork-autobackup', JSON.stringify({ enabled: true, everyDays: 14, lastAt: null }))
    const m = await fresh()
    await m.migrateLocalPrefs(['pwork-theme', 'pwork-autobackup'])
    const call = invokeMock.mock.calls.find((c) => c[0] === 'prefs_write')
    expect(call).toBeTruthy()
    const written = JSON.parse(call![1].content as string)
    expect(written['pwork-theme']).toBe('dark')
    expect(written['pwork-autobackup']).toEqual({ enabled: true, everyDays: 14, lastAt: null })
  })

  it('文件已有键跳过不覆盖（升级场景：文件里的值比旧键新，平移若覆盖会回退用户改动）', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'prefs_read') return Promise.resolve(JSON.stringify({ 'pwork-theme': 'light' }))
      return Promise.resolve(undefined)
    })
    localStorage.setItem('pwork-theme', JSON.stringify('dark')) // 旧键值与文件不同
    localStorage.setItem('pwork-keybinds', JSON.stringify({ quickNote: 'n' }))
    const m = await fresh()
    await m.migrateLocalPrefs(['pwork-theme', 'pwork-keybinds'])
    const call = invokeMock.mock.calls.find((c) => c[0] === 'prefs_write')
    expect(call).toBeTruthy()
    const written = JSON.parse(call![1].content as string)
    expect(written['pwork-theme']).toBe('light') // 文件值保留
    expect(written['pwork-keybinds']).toEqual({ quickNote: 'n' }) // 缺键平移进来
  })

  it('旧键全缺时零写入（不产生空迁移）', async () => {
    invokeMock.mockResolvedValue(null)
    const m = await fresh()
    await m.migrateLocalPrefs(['pwork-theme'])
    expect(invokeMock.mock.calls.some((c) => c[0] === 'prefs_write')).toBe(false)
  })
})

describe('读写一致性', () => {
  it('writePref → 文件更新 → readPref 回读一致；读进程内缓存不重复 invoke', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'prefs_read') return Promise.resolve(null)
      return Promise.resolve(undefined) // prefs_write 成功
    })
    const m = await fresh()
    m.writePref('pwork-theme', 'dark')
    await vi.waitFor(() => {
      expect(invokeMock.mock.calls.some((c) => c[0] === 'prefs_write')).toBe(true)
    })
    expect(m.readPref('pwork-theme', 'auto')).toBe('dark')
    // 再读走 cache：invoke 里不应出现第二次 prefs_read
    m.readPref('pwork-theme', 'auto')
    expect(invokeMock.mock.calls.filter((c) => c[0] === 'prefs_read')).toHaveLength(1)
  })

  it('写盘成功后广播 pwork-prefs-changed（跨窗跟随依赖此事件）', async () => {
    invokeMock.mockResolvedValue(undefined)
    emitMock.mockResolvedValue(undefined)
    const m = await fresh()
    m.writePref('pwork-theme', 'light')
    await vi.waitFor(() => {
      expect(emitMock).toHaveBeenCalledWith('pwork-prefs-changed', { keys: ['pwork-theme'] })
    })
  })
})

describe('损坏回退', () => {
  it('prefs.json 坏 JSON → 按空配置跑 + recordError 留痕，不抛出', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'prefs_read') return Promise.resolve('{broken json')
      return Promise.resolve(undefined)
    })
    const m = await fresh()
    await m.readPrefsFile() // 预热（启动时 main.tsx 做的事；同步 readPref 依赖预热后的缓存）
    expect(m.readPref('pwork-theme', 'auto')).toBe('auto')
    expect(recordErrorMock).toHaveBeenCalled()
    const arg = recordErrorMock.mock.calls[0][0] as { where: string; message: string }
    expect(arg.where).toBe('配置文件.读取')
    // 损坏态下写仍可用（下次写入覆盖重建）
    invokeMock.mockImplementation((cmd: string) => (cmd === 'prefs_read' ? Promise.resolve(null) : Promise.resolve(undefined)))
    m.writePref('pwork-keybinds', { quickNote: 'q' })
    await vi.waitFor(() => {
      expect(invokeMock.mock.calls.some((c) => c[0] === 'prefs_write')).toBe(true)
    })
    expect(m.readPref('pwork-keybinds', null)).toEqual({ quickNote: 'q' })
  })

  it('缓存未预热时 readPref 直接回落 fallback（伴生窗首帧回落 localStorage 的兼容路径）', async () => {
    invokeMock.mockResolvedValue(JSON.stringify({ 'pwork-theme': 'dark' }))
    const m = await fresh()
    expect(m.readPref('pwork-theme', 'auto')).toBe('auto') // 缓存为空 → fallback
    await m.readPrefsFile()
    expect(m.readPref('pwork-theme', 'auto')).toBe('dark') // 预热后命中
  })

  it('文件无该键回落 fallback；null 视为无有效值同回落（重置行为由消费方等价处理）', async () => {
    invokeMock.mockResolvedValue(JSON.stringify({ 'pwork-isle-pos': null }))
    const m = await fresh()
    await m.readPrefsFile()
    expect(m.readPref('missing', 'fb')).toBe('fb')
    expect(m.readPref('pwork-isle-pos', 'top')).toBe('top')
  })
})
