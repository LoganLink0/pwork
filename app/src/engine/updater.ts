/**
 * 应用内更新（0.2 批，2026-10-29）：更新包与签名清单挂 GitHub Releases
 * （端点 = releases/latest/download/latest.json，永远指向最新一版的资产）。
 * 只在桌面版可用（Tauri updater 插件）；浏览器版无安装包，没有更新的概念。
 * 交互模型：用户在 设置 → 关于 手动点「检查更新」，不后台静默拉取——内测期
 * 版本节奏由用户自己掌握，检查结果如实展示（无更新/有更新/拿不到更新信息）。
 * 注意：@tauri-apps 插件必须静态 import（复盘 3.36——动态 import 在 tauri.localhost
 * 下被 vite 预加载环节静默挂起）。
 */
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { isDesktopApp } from './platform'

export type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'latest' }
  | { phase: 'available'; version: string; notes?: string }
  | { phase: 'downloading'; received: number; total: number | null }
  | { phase: 'ready' }
  | { phase: 'error'; message: string }

let pending: Update | null = null

/** 检查更新。任何失败都原样抛出（fast-fail），由调用方展示人话错误 */
export async function checkForUpdate(): Promise<UpdateState> {
  if (!isDesktopApp()) throw new Error('浏览器版没有安装包，无需检查更新')
  const update = await check()
  if (!update) {
    pending = null
    return { phase: 'latest' }
  }
  pending = update
  return { phase: 'available', version: update.version, notes: update.body ?? undefined }
}

/** 下载并安装（进度经回调逐段报给界面），完成后由调用方引导重启 */
export async function downloadAndInstall(onProgress: (received: number, total: number | null) => void): Promise<void> {
  if (!pending) throw new Error('还没有可安装的更新（先检查更新）')
  let received = 0
  let total: number | null = null
  await pending.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? null
      received = 0
    } else if (event.event === 'Progress') {
      received += event.data.chunkLength
    } else if (event.event === 'Finished') {
      // 安装收尾；total 未知时用 received 兜底显示
      total = total ?? received
    }
    onProgress(received, total)
  })
}

/** 安装完成后重启应用加载新版本 */
export async function restartToUpdate(): Promise<void> {
  await relaunch()
}

export function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}
