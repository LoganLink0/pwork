/**
 * 速记附件（R2 批，桌面先行）：字节经 Rust 命令存 AppData/attachments/（att_ 前缀白名单、
 * 20MB 上限、原子写），数据库只带元数据。粘贴即存：截图后在速记浮层或编辑器里 Ctrl+V。
 * 全局剪贴板键不做图片路径——剪贴板插件只给原始 RGBA（编码 PNG 需要新依赖或手写编码器），
 * 粘贴事件由平台给现成的 File，链路零编码。
 */
import { invoke } from '@tauri-apps/api/core'
import { isDesktopApp } from './platform'
import type { NoteAttachment } from '../types/models'

/** 单文件上限（Rust 侧同值校验，双层防线） */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
/** 单条速记附件数上限 */
export const MAX_ATTACHMENTS_PER_NOTE = 10

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

export function extFromMime(mime: string): string | null {
  return EXT_BY_MIME[mime] ?? null
}

/** att_ 前缀 + 时间戳随机段，与 Rust 白名单同一形态 */
function makeAttachmentFile(ext: string): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `att_${Date.now().toString(36)}_${rand}.${ext}`
}

/** 粘贴/拖入的图片是否可入库（mime 白名单） */
export function isSupportedImageMime(mime: string): boolean {
  return mime in EXT_BY_MIME
}

/**
 * 保存一张图片为附件：写盘 → 返回元数据。任何失败就地抛出（调用方提示，图片留在剪贴板不丢）。
 * 仅桌面版可用；网页版调用方应先 isDesktopApp() 判断隐藏入口。
 */
export async function saveImageAttachment(blob: Blob, displayName: string): Promise<NoteAttachment> {
  if (!isDesktopApp()) throw new Error('附件仅桌面版可用')
  if (!isSupportedImageMime(blob.type)) throw new Error(`不支持的图片格式：${blob.type || '未知'}`)
  if (blob.size > MAX_ATTACHMENT_BYTES) throw new Error(`图片超过 20MB 上限`)
  const ext = extFromMime(blob.type)!
  const file = makeAttachmentFile(ext)
  const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()))
  await invoke('attachment_write', { name: file, bytes })
  return {
    id: `attm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: displayName,
    mime: blob.type,
    size: blob.size,
    file,
  }
}

/** 删除附件文件（元数据由调用方先行更新；文件不存在时静默成功） */
export async function deleteAttachmentFile(file: string): Promise<void> {
  if (!isDesktopApp()) return
  await invoke('attachment_delete', { name: file })
}

/** 附件缩略图 data: URL（画廊/预览用）；仅桌面版调用 */
export async function attachmentDataUrl(att: NoteAttachment): Promise<string> {
  const b64 = await invoke<string>('attachment_read', { name: att.file })
  const mime = MIME_BY_EXT[att.file.split('.').pop() ?? ''] ?? att.mime ?? 'image/png'
  return `data:${mime};base64,${b64}`
}

/** 粘贴事件里提取第一张受支持的图片（无则返回 null） */
export function imageFromPaste(e: ClipboardEvent | ReactClipboardEvent): { blob: Blob; name: string } | null {
  const items = e.clipboardData?.items
  if (!items) return null
  for (const item of items) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file && isSupportedImageMime(file.type)) {
      return { blob: file, name: file.name || '截图' }
    }
  }
  return null
}

/** 合成事件用的最小粘贴事件形态（测试与程序化调用共用） */
interface ReactClipboardEvent {
  clipboardData: DataTransfer | null
}
