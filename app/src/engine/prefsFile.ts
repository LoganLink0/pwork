/**
 * 用户配置文件层（2026-11-16 配置文件化立项，设计稿 docs/design/配置文件化设计.md）：
 * 主题/AI 接入/键位/自动备份偏好/胶囊岛位置等用户设置从 origin 隔离的 localStorage
 * 迁到数据目录 prefs.json——治两个已发生痛点：①dev 壳与桌面版 origin 不同配置互不可见
 * ②leveldb 在强杀时丢近期写入（0.1.23 主题/coach 偏好真实丢失）。
 * 读写经 Rust 命令 prefs_read/prefs_write（原子写：tmp+rename，同 backup_file_io 纪律）；
 * PWORK_DATA_DIR 隔离变量照常生效。Key 不在此（gateway.env 既有边界不变）。
 * 迁移兼容：启动时 prefs.json 缺失且 localStorage 有旧键 → 一次性平移（旧键保留）。
 * 损坏回退：prefs.json 解析失败 → 按空配置跑 + recordError（不崩应用）。
 */
import { invoke } from '@tauri-apps/api/core'
import { isDesktopApp } from './platform'
import { recordError } from './errorLog'

export interface PrefsFile {
  /** 主题偏好（appearance） */
  'pwork-theme'?: string
  /** AI 接入配置（coach，不含 Key——Key 在 gateway.env） */
  'fupan-coach'?: unknown
  /** 键位 */
  'pwork-keybinds'?: unknown
  /** 自动备份偏好 */
  'pwork-autobackup'?: unknown
  /** 胶囊岛位置 */
  'pwork-isle-pos'?: unknown
  /** 允许任意命名键（逐键平移，消费方按需声明） */
  [key: string]: unknown
}

const emptyFile = (): PrefsFile => ({})

let cache: PrefsFile | null = null

export async function readPrefsFile(): Promise<PrefsFile> {
  if (cache) return cache
  if (!isDesktopApp()) {
    cache = emptyFile()
    return cache
  }
  try {
    const raw = await invoke<string | null>('prefs_read')
    cache = raw ? (JSON.parse(raw) as PrefsFile) : emptyFile()
  } catch (e) {
    // 文件损坏/读失败：按空配置跑 + 留痕（不崩应用；下次写入会覆盖重建）
    cache = emptyFile()
    recordError({ where: '配置文件.读取', kind: 'app', message: `prefs.json 读取失败，按默认值运行：${e instanceof Error ? e.message : String(e)}` }, { silent: true })
  }
  return cache
}

/** 写队列：整文件读改写必须串行——两个并发写各自基于同一旧态展开合并，后落盘者会整文件
 *  覆盖先落盘者（丢更新）。所有写排进单条 promise 链，读改写全程原子。
 *  边界如实留档：本队列只串行化本 WebView 进程内的写；主窗与伴生窗是两个进程，跨进程
 *  同时写（如拖岛落位与切主题同一瞬间）理论可相互覆盖单键——Rust 侧 tmp+rename 保证文件
 *  不损坏，丢的是单次偏好写入且用户下一次操作即重写，频率与概率均趋零，不为此加跨进程锁 */
let writeQueue: Promise<void> = Promise.resolve()

export function writePrefsFile(patch: PrefsFile): Promise<void> {
  // 浏览器版没有 prefs.json：不缓存不落盘（读全走消费方的 localStorage 回落，两条存储不串）
  if (!isDesktopApp()) return Promise.resolve()
  const run = writeQueue.then(async () => {
    const current = await readPrefsFile()
    const next = { ...current, ...patch }
    cache = next
    try {
      await invoke('prefs_write', { content: JSON.stringify(next, null, 2) })
    } catch (e) {
      recordError({ where: '配置文件.写入', kind: 'app', message: `prefs.json 写入失败：${e instanceof Error ? e.message : String(e)}` }, { silent: true })
      return
    }
    // 跨窗广播：伴生窗（胶囊岛/问小 P）监听此事件实时跟随主题等偏好变化
    //（localStorage 的 storage 事件只覆盖同 origin 窗口，独立窗场景以 Tauri 事件为准）
    try {
      const { emit } = await import('@tauri-apps/api/event')
      void emit('pwork-prefs-changed', { keys: Object.keys(patch) })
    } catch {
      /* 广播失败不影响写入本身 */
    }
  })
  // 队尾吞错（run 内部已 recordError，不 reject）：单次失败不断链，后续写照常排队
  writeQueue = run.catch(() => {})
  return run
}

/** 迁移：localStorage 旧键 → prefs.json。prefs.json 已有的键跳过（升级场景：
 *  文件里的值比 localStorage 旧键新——平移若覆盖会回退用户在旧版本的改动）；本函数只平移不删除 */
export async function migrateLocalPrefs(keys: string[]): Promise<void> {
  const file = await readPrefsFile()
  const patch: PrefsFile = {}
  for (const k of keys) {
    if (file[k] !== undefined) continue
    const raw = localStorage.getItem(k)
    if (raw === null) continue
    try {
      patch[k] = JSON.parse(raw)
    } catch {
      patch[k] = raw // 非 JSON 原文平移
    }
  }
  if (Object.keys(patch).length > 0) await writePrefsFile(patch)
}

/** 读某键（prefs.json 缓存；未迁移键由消费方自行回落 localStorage 旧键） */
export function readPref<T>(key: string, fallback: T): T {
  const v = cache?.[key]
  return (v === undefined ? fallback : (v as T)) ?? fallback
}

export function writePref(key: string, value: unknown): void {
  void writePrefsFile({ [key]: value }) // writePrefsFile 内部读合并，传增量即可
}
