import { beforeEach, describe, expect, it } from 'vitest'
import { chunkBundle, joinChunks, loadMirrorConfig, saveMirrorConfig } from './deviceMirror'

beforeEach(() => localStorage.clear())

describe('设备镜像（档 1）', () => {
  it('分块往返：任意长度无损，块长 ≤ 上限', () => {
    for (const len of [0, 10, 60_000, 60_001, 130_000, 250_000]) {
      const payload = Array.from({ length: len }, (_, i) => String.fromCharCode(0x4e00 + (i % 300))).join('')
      const chunks = chunkBundle(payload)
      expect(joinChunks(chunks)).toBe(payload)
      for (const c of chunks) expect(c.length).toBeLessThanOrEqual(60_000)
      if (len === 0) expect(chunks).toEqual([''])
    }
  })

  it('配置存取：默认关、保存往返、坏数据回落默认', () => {
    expect(loadMirrorConfig()).toEqual({ enabled: false, source: false, lastPushAt: null, lastPullAt: null })
    saveMirrorConfig({ enabled: true, source: true, lastPushAt: '2026-10-14T08:00:00Z', lastPullAt: null })
    expect(loadMirrorConfig().enabled).toBe(true)
    expect(loadMirrorConfig().source).toBe(true)
    localStorage.setItem('pwork-device-mirror', '{oops')
    expect(loadMirrorConfig().enabled).toBe(false)
  })
})
