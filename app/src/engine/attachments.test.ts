import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_ATTACHMENTS_PER_NOTE,
  attachmentDataUrl,
  extFromMime,
  imageFromPaste,
  isSupportedImageMime,
  saveImageAttachment,
} from './attachments'
import { normalizeNote } from '../db/repo'

const invokeMock = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))
vi.mock('./platform', () => ({
  isDesktopApp: () => true,
}))

beforeEach(() => {
  invokeMock.mockReset()
})

describe('附件命名与格式白名单', () => {
  it('mime → 扩展名映射与受支持判断', () => {
    expect(extFromMime('image/png')).toBe('png')
    expect(extFromMime('image/jpeg')).toBe('jpg')
    expect(isSupportedImageMime('image/webp')).toBe(true)
    expect(isSupportedImageMime('image/bmp')).toBe(false)
    expect(isSupportedImageMime('')).toBe(false)
  })

  it('保存成功：invoke 收到 att_ 前缀白名单名与字节数组，元数据齐全', async () => {
    invokeMock.mockResolvedValue(undefined)
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })
    const meta = await saveImageAttachment(blob, '截图')
    expect(meta.name).toBe('截图')
    expect(meta.mime).toBe('image/png')
    expect(meta.size).toBe(4)
    expect(meta.file).toMatch(/^att_[a-z0-9]+_[a-z0-9]{2,8}\.png$/)
    const call = invokeMock.mock.calls[0]!
    expect(call[0]).toBe('attachment_write')
    expect((call[1] as { name: string }).name).toBe(meta.file)
    expect((call[1] as { bytes: number[] }).bytes).toEqual([137, 80, 78, 71])
  })

  it('超限与不支持格式就地抛错，不触 invoke', async () => {
    const big = new Blob([new Uint8Array(21 * 1024 * 1024)], { type: 'image/png' })
    await expect(saveImageAttachment(big, '大图')).rejects.toThrow('20MB')
    await expect(saveImageAttachment(new Blob(['x'], { type: 'image/bmp' }), 'b')).rejects.toThrow('不支持的图片格式')
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('读取拼 data: URL（扩展名定 mime）', async () => {
    invokeMock.mockResolvedValue('aGk=')
    const url = await attachmentDataUrl({ id: 'a', name: 'x', mime: 'image/png', size: 2, file: 'att_x1.png' })
    expect(url).toBe('data:image/png;base64,aGk=')
  })
})

describe('imageFromPaste（粘贴事件提取）', () => {
  it('提取第一张受支持图片；文字/空剪贴板返回 null', () => {
    const png = new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' })
    const fake = { clipboardData: { items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }, { kind: 'file', type: 'image/png', getAsFile: () => png }] } } as unknown as ClipboardEvent
    const got = imageFromPaste(fake)
    expect(got?.name).toBe('shot.png')
    expect(imageFromPaste({ clipboardData: null } as unknown as ClipboardEvent)).toBeNull()
    expect(imageFromPaste({ clipboardData: { items: [] } } as unknown as ClipboardEvent)).toBeNull()
  })
})

describe('normalizeNote 附件读取防御', () => {
  it('缺字段回空数组；条目缺 id/file 的剔除', () => {
    expect(normalizeNote({ id: 'n', title: '', body: '', tags: [], links: { itemIds: [], reviewIds: [], taskIds: [] }, source: 'quick', createdAt: '', updatedAt: '', deletedAt: null, schemaVersion: 1 } as never).attachments).toEqual([])
    const withBad = normalizeNote({
      id: 'n', title: '', body: '', tags: [], links: { itemIds: [], reviewIds: [], taskIds: [] }, source: 'quick',
      attachments: [{ id: 'ok', name: 'a', mime: 'image/png', size: 1, file: 'att_ok.png' }, { name: '缺 id 与 file' }, null],
      createdAt: '', updatedAt: '', deletedAt: null, schemaVersion: 1,
    } as never)
    expect(withBad.attachments).toHaveLength(1)
    expect(withBad.attachments?.[0]?.file).toBe('att_ok.png')
  })

  it('单条上限常量与评审建议一致（10 个）', () => {
    expect(MAX_ATTACHMENTS_PER_NOTE).toBe(10)
  })
})
