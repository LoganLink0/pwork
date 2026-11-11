/**
 * 桌面版备份文件夹文件操作适配层（0.1.18）：统一走 Rust 命令 backup_file_io，
 * 数据目录解析在 Rust 侧（尊重 PWORK_DATA_DIR 隔离变量）——替代 plugin-fs 的
 * BaseDirectory.AppData（不认该变量，隔离实例的备份 / 守卫文件会写进真实数据目录）。
 * 只接受备份文件夹内的裸文件名，边界在 Rust 侧校验（与 fs 权限审计④一致）。
 */
import { invoke } from '@tauri-apps/api/core'

/** 读备份文件夹内的文本文件；不存在或读不出返回 null */
export async function readBackupText(name: string): Promise<string | null> {
  const r = await invoke<unknown>('backup_file_io', { op: 'read', name })
  return typeof r === 'string' ? r : null
}

/** 写备份文件夹内的文本文件（文件夹不存在会自动创建） */
export async function writeBackupText(name: string, content: string): Promise<void> {
  await invoke('backup_file_io', { op: 'write', name, content })
}

/** 列备份文件夹内的文件名（升序） */
export async function listBackupNames(): Promise<string[]> {
  const r = await invoke<unknown>('backup_file_io', { op: 'list', name: '' })
  return Array.isArray(r) ? (r as string[]) : []
}

/** 删备份文件夹内的文件；已不存在视为删除成功（轮换幂等） */
export async function removeBackup(name: string): Promise<void> {
  await invoke('backup_file_io', { op: 'remove', name })
}
