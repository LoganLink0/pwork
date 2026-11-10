/**
 * yt-dlp 信源抓取（信源主动识别·yt-dlp 路线，2026-11-01）：调 Rust 命令跑本机
 * yt-dlp --flat-playlist，把平台投稿清单（B站 UP 主 / YouTube 频道等）转成
 * 与 fetchFeed 同契约的条目集——标题 + 链接，评分管线原样复用。
 * flat 清单通常缺发布时间与简介：publishedAt 用抓取时间兜底（去重靠 fingerprint，
 * 不受影响），summary 留空（预筛与评分只吃标题也成立）。
 */
import { invoke } from '@tauri-apps/api/core'

export interface FetchedList {
  ok: boolean
  items: { title: string; url: string; summary: string; publishedAt: string | null }[]
  error: string | null
}

interface FlatEntry {
  title?: string
  url?: string
  webpage_url?: string
  id?: string
}

interface FlatJson {
  entries?: FlatEntry[] | null
  title?: string
  id?: string
  webpage_url?: string
  url?: string
}

export interface FlatItem {
  title: string
  url: string
  summary: string
  publishedAt: string | null
}

/** 解析 yt-dlp 的 JSON 输出为条目集（纯函数，可单测）。
 *  兼容两种形态：清单 JSON（entries 数组，UP 主空间/频道地址）与单视频 JSON
 *  （无 entries，根对象即条目——链接捕获的解析基础）。
 *  防御：entries 中的 null 项（平台侧删除/受限的视频在 flat 输出里可能为 null）直接跳过；
 *  B站 space 的 flat 清单只回链接不给标题——用 BV 号（id）兜底，YouTube 等平台标题完整。 */
export function parseFlatJson(raw: string, fetchedAt: string): FlatItem[] {
  let parsed: FlatJson
  try {
    parsed = JSON.parse(raw) as FlatJson
  } catch {
    throw new Error('yt-dlp 输出不是合法 JSON——版本可能过旧，yt-dlp -U 自更新后重试')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('yt-dlp 返回了空结果——可能是平台拦截（稍后重试）或地址无效')
  }
  const entries: FlatEntry[] = Array.isArray(parsed.entries)
    ? parsed.entries.filter((e): e is FlatEntry => e !== null && typeof e === 'object')
    : (parsed.title ?? parsed.webpage_url ?? parsed.url)
      ? [{ title: parsed.title, url: parsed.webpage_url ?? parsed.url, id: parsed.id }]
      : []
  return entries
    .map((e) => ({
      title: (e.title ?? e.id ?? '').trim() || (e.webpage_url ?? e.url ?? '').trim(),
      url: (e.webpage_url ?? e.url ?? '').trim(),
      summary: '',
      publishedAt: fetchedAt,
    }))
    .filter((e) => e.url !== '')
}

/** 本机 yt-dlp 版本（未安装/不可用返回 null，调用方给安装指引） */
export async function probeYtdlp(): Promise<string | null> {
  try {
    return await invoke<string>('ytdlp_probe')
  } catch {
    return null
  }
}

/** 拉取投稿清单（最新 30 条，Rust 侧 30 秒看门狗） */
export async function fetchYtdlpPlaylist(url: string): Promise<FetchedList> {
  try {
    const raw = await invoke<string>('ytdlp_fetch_playlist', { url })
    const now = new Date().toISOString()
    const items = parseFlatJson(raw, now)
    if (items.length === 0) {
      return { ok: false, items: [], error: '清单为空——确认地址是该 UP 主/频道的投稿页，且账号下视频不为空' }
    }
    return { ok: true, items, error: null }
  } catch (e) {
    return { ok: false, items: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export interface VideoMeta {
  title: string
  /** UP 主/频道名（平台不回则为空串） */
  author: string
  /** 视频简介（原样返回，入库时再截断） */
  description: string
  url: string
}

/** 单条视频链接的元数据解析（链接捕获用）：调单视频 JSON，取标题/作者/简介。
 *  B站单视频匿名可拉（实测）；抖音等平台依赖 yt-dlp 对应提取器的可用性。 */
export async function fetchVideoMeta(url: string): Promise<{ ok: boolean; meta?: VideoMeta; error?: string }> {
  try {
    const raw = await invoke<string>('ytdlp_fetch_playlist', { url })
    const parsed = JSON.parse(raw) as {
      title?: string
      uploader?: string
      channel?: string
      description?: string
      webpage_url?: string
      url?: string
      entries?: unknown
    }
    if (Array.isArray(parsed.entries) || !(parsed.title ?? '').trim()) {
      return { ok: false, error: '这个地址不是单条视频链接——清单地址请用「yt-dlp 信源」定时订阅' }
    }
    const meta: VideoMeta = {
      title: (parsed.title ?? '').trim(),
      author: (parsed.uploader ?? parsed.channel ?? '').trim(),
      description: (parsed.description ?? '').trim(),
      url: (parsed.webpage_url ?? parsed.url ?? url).trim(),
    }
    return { ok: true, meta }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
