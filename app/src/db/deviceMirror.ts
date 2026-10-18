/**
 * 设备镜像（档 1：单向异步同步，2026-10-14 用户拍板）：
 * 「镜像源」设备把全量备份 bundle 推到你的 Cloudflare D1（独立表 pwork_device_bundle，
 * 与采集数据同库不同表）；其他设备打开应用时拉取合并（复用 importBundle 的 LWW 逻辑）。
 *
 * 设计边界：
 * - 走 D1 直连（api.cloudflare.com，大陆实测可达）——需要云端同步已按 D1 直连配置；
 * - bundle 按字符分块（每块 60k），绕 D1 单条 SQL 语句上限；
 * - 云端只是管道：表删了只断同步不丢数据（两端本地各有全量），符合"云端可丢"铁律；
 * - 全量数据经用户自己的 Cloudflare 中转——设置页有外发明示。
 */
import { d1Query, loadCloudConfig } from './cloudSync'
import { buildBackupBundle } from '../store/collect'
import { importBundle, type ImportResult } from './backup'

const MIRROR_KEY = 'pwork-device-mirror'

export interface MirrorConfig {
  enabled: boolean
  /** 本机是否为镜像源（推送方）。一般只有主力电脑开；其他设备只拉取 */
  source: boolean
  lastPushAt: string | null
  lastPullAt: string | null
}

export function loadMirrorConfig(): MirrorConfig {
  try {
    const v = JSON.parse(localStorage.getItem(MIRROR_KEY) ?? '') as Partial<MirrorConfig>
    return {
      enabled: Boolean(v.enabled),
      source: Boolean(v.source),
      lastPushAt: v.lastPushAt ?? null,
      lastPullAt: v.lastPullAt ?? null,
    }
  } catch {
    return { enabled: false, source: false, lastPushAt: null, lastPullAt: null }
  }
}

export function saveMirrorConfig(cfg: MirrorConfig): void {
  localStorage.setItem(MIRROR_KEY, JSON.stringify(cfg))
}

function requireD1() {
  const cloud = loadCloudConfig()
  if (cloud.mode !== 'd1' || !cloud.accountId || !cloud.databaseId || !cloud.token) {
    throw new Error('设备镜像需要云端同步按「D1 直连」配置（设置 → 云端同步）')
  }
  return cloud
}

/* ---------------------- 分块（纯函数，可单测） ---------------------- */

const CHUNK_CHARS = 60_000

export function chunkBundle(json: string): string[] {
  const chunks: string[] = []
  for (let i = 0; i < json.length; i += CHUNK_CHARS) chunks.push(json.slice(i, i + CHUNK_CHARS))
  return chunks.length > 0 ? chunks : ['']
}

export function joinChunks(chunks: string[]): string {
  return chunks.join('')
}

/* ---------------------- 推送 / 拉取 ---------------------- */

export interface PushResult {
  ok: boolean
  sizeKb: number
  chunks: number
  error?: string
}

/** 推送：当前库全量 bundle → D1 分块整表替换 */
export async function pushMirrorBundle(): Promise<PushResult> {
  const cloud = requireD1()
  const bundle = await buildBackupBundle()
  const json = JSON.stringify(bundle)
  const chunks = chunkBundle(json)
  const now = new Date().toISOString()
  await d1Query(cloud, 'CREATE TABLE IF NOT EXISTS pwork_device_bundle (seq INTEGER PRIMARY KEY, updated_at TEXT NOT NULL, chunk TEXT NOT NULL)', [])
  await d1Query(cloud, 'DELETE FROM pwork_device_bundle', [])
  for (let i = 0; i < chunks.length; i++) {
    await d1Query(cloud, 'INSERT INTO pwork_device_bundle (seq, updated_at, chunk) VALUES (?, ?, ?)', [i, now, chunks[i]!])
  }
  return { ok: true, sizeKb: Math.round(json.length / 1024), chunks: chunks.length }
}

export interface PullResult {
  ok: boolean
  /** 远端镜像的更新时间（无镜像为 null） */
  remoteAt: string | null
  import?: ImportResult
  error?: string
}

/** 拉取：D1 分块拼回 bundle → LWW 合并本地。云端无镜像时 ok 且 remoteAt=null（静默跳过） */
export async function pullMirrorBundle(): Promise<PullResult> {
  const cloud = requireD1()
  await d1Query(cloud, 'CREATE TABLE IF NOT EXISTS pwork_device_bundle (seq INTEGER PRIMARY KEY, updated_at TEXT NOT NULL, chunk TEXT NOT NULL)', [])
  const rows = (await d1Query(cloud, 'SELECT seq, updated_at, chunk FROM pwork_device_bundle ORDER BY seq', [])) as unknown as {
    seq: number
    updated_at: string
    chunk: string
  }[]
  if (rows.length === 0) return { ok: true, remoteAt: null }
  const json = joinChunks(rows.map((r) => r.chunk))
  const imported = await importBundle(json)
  return { ok: true, remoteAt: rows[0]!.updated_at, import: imported }
}
