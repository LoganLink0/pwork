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
  entries?: FlatEntry[]
  title?: string
  id?: string
  webpage_url?: string
  url?: string
}

/** 本机 yt-dlp 版本（未安装/不可用返回 null，调用方给安装指引） */
export async function probeYtdlp(): Promise<string | null> {
  try {
    return await invoke<string>('ytdlp_probe')
  } catch {
    return null
  }
}

/** 拉取投稿清单（最新 30 条，Rust 侧 30 秒看门狗）。
 *  兼容两种 yt-dlp 输出：清单 JSON（entries 数组，UP 主空间/频道地址）
 *  与单视频 JSON（无 entries，直接给单条视频的元数据——链接捕获的基础）。 */
export async function fetchYtdlpPlaylist(url: string): Promise<FetchedList> {
  try {
    const raw = await invoke<string>('ytdlp_fetch_playlist', { url })
    const parsed = JSON.parse(raw) as FlatJson
    const entries: FlatEntry[] = Array.isArray(parsed.entries)
      ? parsed.entries
      : (parsed.title ?? parsed.webpage_url ?? parsed.url)
        ? [{ title: parsed.title, url: parsed.webpage_url ?? parsed.url, id: parsed.id }]
        : []
    const now = new Date().toISOString()
    const items = entries
      .map((e) => ({
        // B站 space 的 flat 清单只回链接不给标题——用 BV 号兜底（点击可看）；YouTube 等平台标题完整
        title: (e.title ?? e.id ?? '').trim() || (e.webpage_url ?? e.url ?? '').trim(),
        url: (e.webpage_url ?? e.url ?? '').trim(),
        summary: '',
        publishedAt: now,
      }))
      .filter((e) => e.url !== '')
    if (items.length === 0) {
      return { ok: false, items: [], error: '清单为空——确认地址是该 UP 主/频道的投稿页，且账号下视频不为空' }
    }
    return { ok: true, items, error: null }
  } catch (e) {
    return { ok: false, items: [], error: e instanceof Error ? e.message : String(e) }
  }
}
