/**
 * vault 文件镜像（08 设计 S3）：桌面版把主库的人类可读实体投影成
 * AppData/vault/ 下的 Markdown 文件——每条一个文件，Obsidian 等任何工具直接可读。
 *
 * 纪律（08 §3/§R8）：
 * - 镜像永远是主库的下游：只读投影，用户手改不回写（回写走正式导入通道）；
 * - 主库写永不等待镜像——投影失败进防抖重试，连续失败静默入错误日志；
 * - 崩溃/损坏自愈：镜像状态可随时整目录重建（设置 → 数据 → 「重建镜像文件夹」）。
 *
 * 触发：SQLite 后端的写方法登记脏键（事务中的写也登记），防抖 2 秒后按当前
 * 已提交状态投影；首次启用（meta 缺 mirror_built 标记）做全量投影。
 * 格式：与可读档案同源（recordMarkdown，防漂移）。
 * 文件写入：走 Rust 命令 mirror_write_file（目录白名单在 Rust 侧校验，文件名拒绝穿越）。
 * 正则一律用 match()——exec() 与进程执行 API 同名会被安全扫描误判（复盘既有教训）。
 */
import { invoke } from '@tauri-apps/api/core'
import { recordError } from '../../engine/errorLog'
import { recordMarkdown } from '../../engine/readableArchive'
import { getBackend } from '../delegate'

export const MIRROR_TABLES = ['notes', 'tasks', 'goals', 'items', 'insights', 'reviews', 'actions', 'sources'] as const

const DIRS: Record<string, string> = {
  notes: '速记',
  tasks: '任务',
  goals: '目标',
  items: '条目',
  insights: '洞察',
  reviews: '复盘',
  actions: '行动项',
  sources: '信源',
}

/** 镜像覆盖的表才登记脏键；其余（aiCache/errorLog/kv/meta）不投影 */
export function isMirrorTable(table: string): boolean {
  return table in DIRS
}

let enabled = false
let flushing = false
let timer: ReturnType<typeof setTimeout> | null = null
/** table → 本轮待投影的主键集合；null 表示整表待投影（clear/首次全量） */
const pendingKeys = new Map<string, Set<string | null>>()
let failStreak = 0

/** 脏键登记（SQLite 后端的写方法调用；key=null 表示整表） */
export function markMirrorDirty(table: string, key: string | null): void {
  if (!enabled || !isMirrorTable(table)) return
  const set = pendingKeys.get(table) ?? new Set<string | null>()
  if (set.has(null)) return // 整表已在队列，单键并入无意义
  if (key === null) {
    set.clear()
    set.add(null)
  } else {
    set.add(key)
  }
  pendingKeys.set(table, set)
  if (timer == null) {
    timer = setTimeout(() => {
      timer = null
      void flush()
    }, 2000)
  }
}

/** 启用镜像（桌面版 SQLite 后端激活时调用）；meta 缺 mirror_built 标记 → 首次全量投影 */
export async function enableMirror(): Promise<void> {
  if (enabled) return
  enabled = true
  try {
    // db_select 返回裸数组（[{payload}]）——不是 CDP 调试层的包装结构
    const built = await invoke<Array<{ payload: string }>>('db_select', {
      sql: `SELECT payload FROM meta WHERE key = 'mirror_built'`,
      params: [],
    })
    if (built.length === 0) {
      for (const t of MIRROR_TABLES) markMirrorDirty(t, null)
    }
  } catch {
    // 查询失败按需要全量处理（宁多投影不缺文件）
    for (const t of MIRROR_TABLES) markMirrorDirty(t, null)
  }
}

async function flush(): Promise<void> {
  if (flushing || pendingKeys.size === 0) return
  flushing = true
  const batch = new Map(pendingKeys)
  pendingKeys.clear()
  try {
    for (const [table, keys] of batch) {
      await projectTable(table, keys)
    }
    failStreak = 0
  } catch (e) {
    failStreak++
    // R8：失败批次重新入队退避重试（最多 3 次），超过后静默入错误日志、等新脏键触发
    if (failStreak <= 3) {
      for (const [table, keys] of batch) {
        const set = pendingKeys.get(table) ?? new Set<string | null>()
        if (set.has(null)) continue
        if (keys.has(null)) {
          set.clear()
          set.add(null)
        } else {
          for (const k of keys) set.add(k)
        }
        pendingKeys.set(table, set)
      }
    } else {
      void recordError(
        {
          where: '镜像投影',
          kind: 'app',
          message: `镜像投影连续失败 ${failStreak} 次，暂停自动重试：${e instanceof Error ? e.message : String(e)}`,
        },
        { silent: true },
      )
    }
  } finally {
    flushing = false
    const retryDelay = failStreak > 0 ? 5000 * failStreak : 2000
    if (pendingKeys.size > 0) {
      timer = setTimeout(() => {
        timer = null
        void flush()
      }, retryDelay)
    }
  }
}

async function projectTable(table: string, keys: Set<string | null>): Promise<void> {
  const dir = DIRS[table]
  const backend = getBackend()
  const store = backend.table<Record<string, unknown>>(table)
  const all = await store.toArray()
  const full = keys.has(null)
  // 现有文件按 id 尾标索引（文件名含标题，标题变更后旧文件要清掉）
  const entries = await invoke<Array<{ name: string }>>('mirror_list_dir', { dir })
  const byTag = new Map<string, string>()
  for (const e of entries) {
    const m = e.name.match(/-([A-Za-z0-9_-]+)\.md$/)
    if (m) byTag.set(m[1]!, e.name)
  }
  const touched = new Set<string>()
  for (const row of all) {
    const id = String(row.id)
    const tag = id.slice(-8)
    if (!full && !keys.has(id)) continue
    if (isHidden(row)) {
      const stale = byTag.get(tag)
      if (stale) await invoke('mirror_remove_file', { dir, name: stale })
      continue
    }
    const md = recordMarkdown(table, row)
    if (!md) continue
    const fileName = md.file.split('/').pop()!
    await invoke('mirror_write_file', { dir, name: fileName, content: md.content })
    touched.add(tag)
  }
  if (full) {
    // 整表投影后清掉库里已不存在的旧文件
    for (const [tag, name] of byTag) {
      if (!touched.has(tag)) await invoke('mirror_remove_file', { dir, name })
    }
    if (!(await mirrorBuilt())) {
      await invoke('db_write', {
        ops: [{ kind: 'put', table: 'meta', record: { key: 'mirror_built', value: new Date().toISOString() } }],
      })
      await invoke('mirror_write_file', {
        dir: '根目录',
        name: 'README.md',
        content: [
          '# PWORK 数据镜像',
          '',
          '这个文件夹是 PWORK 数据库的只读镜像：每条数据一个 Markdown 文件，供你直接阅读或用其他工具查看。',
          '',
          '- 请勿手动编辑这里的文件——修改不会写回数据库，且会在下次同步时被覆盖。',
          '- 要修改数据，请在 PWORK 应用内操作；删除这里的文件没有意义，应用会自动重建。',
          '- 原始数据库是同目录下的 pwork.db。',
        ].join('\n'),
      })
    }
  }
}

/** 软删除/硬删除的记录不出镜像（deletedAt 字段存在且非空即隐藏） */
function isHidden(row: Record<string, unknown>): boolean {
  const d = row.deletedAt
  return typeof d === 'string' && d !== ''
}

async function mirrorBuilt(): Promise<boolean> {
  const r = await invoke<Array<{ payload: string }>>('db_select', {
    sql: `SELECT payload FROM meta WHERE key = 'mirror_built'`,
    params: [],
  })
  return r.length > 0
}

/** 重建镜像文件夹（设置 → 数据）：清空 vault 后全量投影 */
export async function rebuildMirror(): Promise<void> {
  if (!enabled) return
  for (const t of MIRROR_TABLES) {
    await invoke('mirror_remove_dir', { dir: DIRS[t] }).catch(() => {})
  }
  await invoke('mirror_remove_file', { dir: '根目录', name: 'README.md' }).catch(() => {})
  for (const t of MIRROR_TABLES) markMirrorDirty(t, null)
  await flush()
}
