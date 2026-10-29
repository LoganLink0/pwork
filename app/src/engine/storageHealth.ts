/**
 * 存储耐久（0.3 数据主权批，2026-10-29）：持久化存储申请 + 用量水位。
 *
 * 背景：IndexedDB 默认属"可回收存储"——磁盘紧张时浏览器有权按自己的策略清除
 * 站点数据。navigator.storage.persist() 向浏览器申请把本站存储标记为持久，
 * 豁免这类自动回收（Chromium 对已安装的 PWA 基本直接批准，全程无弹窗）。
 * 这是数据不丢的第一道闸，配合自动备份（第二道）与健康检查（第三道）。
 */

export interface StorageStatus {
  /** 浏览器是否支持存储管理 API（不支持时界面隐藏该卡） */
  supported: boolean
  /** 持久化保护是否已生效（null = 浏览器没给明确答案） */
  persisted: boolean | null
  /** 已用字节数（拿不到为 null） */
  usage: number | null
  /** 配额字节数（拿不到为 null） */
  quota: number | null
}

export function storageApiSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.persist === 'function'
}

/** 当前状态（只读查询，设置页展示用） */
export async function queryStorageStatus(): Promise<StorageStatus> {
  if (!storageApiSupported()) {
    return { supported: false, persisted: null, usage: null, quota: null }
  }
  const [persisted, estimate] = await Promise.all([
    navigator.storage.persisted().catch(() => null),
    navigator.storage.estimate?.().catch(() => null) ?? Promise.resolve(null),
  ])
  return {
    supported: true,
    persisted,
    usage: estimate?.usage ?? null,
    quota: estimate?.quota ?? null,
  }
}

/**
 * 申请持久化保护（启动时静默调用一次；返回是否生效）。
 * 已生效时直接返回 true，不重复申请。
 */
export async function requestPersistence(): Promise<boolean | null> {
  if (!storageApiSupported()) return null
  if (await navigator.storage.persisted().catch(() => false)) return true
  try {
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

export function humanBytes(bytes: number | null): string {
  if (bytes == null) return '未知'
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}
