/**
 * FFmpeg wasm 客户端（单例懒加载）：首次使用时从 CDN 加载 core（约 30MB，一次即可），
 * 之后常驻内存。单线程核心，无需 COOP/COEP 响应头。
 * 限制：wasm 软编码，适合中小文件（≤100MB / 短视频）。
 */
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

const CORE_VERSION = '0.12.10'
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`

let instance: FFmpeg | null = null
let loading: Promise<FFmpeg> | null = null

export interface FFmpegCallbacks {
  onLog?: (message: string) => void
  onProgress?: (ratio: number) => void
}

export async function getFFmpeg(cb: FFmpegCallbacks = {}): Promise<FFmpeg> {
  if (instance) return instance
  if (!loading) {
    loading = (async () => {
      const ff = new FFmpeg()
      ff.on('log', ({ message }) => cb.onLog?.(message))
      ff.on('progress', ({ progress }) => cb.onProgress?.(progress))
      await ff.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      return ff
    })()
    loading.catch(() => {
      loading = null // 允许重试
    })
  }
  const ready = await loading
  instance = ready
  return ready
}

/** 通用转换：写入输入文件 → 执行 → 返回输出数据 */
export async function convert(
  cb: FFmpegCallbacks,
  inputFile: File | Blob,
  inputName: string,
  outputName: string,
  args: string[],
): Promise<{ data: Uint8Array; mime: string }> {
  const ff = await getFFmpeg(cb)
  await ff.writeFile(inputName, await fetchFile(inputFile))
  await ff.exec(['-i', inputName, ...args, outputName])
  const data = await ff.readFile(outputName)
  await ff.deleteFile(inputName).catch(() => {})
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
  return { data: bytes, mime: mimeOf(outputName) }
}

function mimeOf(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'mp3': return 'audio/mpeg'
    case 'wav': return 'audio/wav'
    case 'm4a': return 'audio/mp4'
    case 'mp4': return 'video/mp4'
    case 'webm': return 'video/webm'
    case 'gif': return 'image/gif'
    case 'png': return 'image/png'
    default: return 'application/octet-stream'
  }
}

/** 生成下载用的临时 URL（调用方负责 revoke） */
export function toDownloadUrl(data: Uint8Array, mime: string): string {
  const blob = new Blob([data.buffer as ArrayBuffer], { type: mime })
  return URL.createObjectURL(blob)
}
