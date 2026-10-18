/**
 * 项目待办扫描的文件系统层（File System Access API，2026-10-14）。
 * 浏览器目录授权一次、句柄持久化（独立小 IndexedDB，不进主库 schema/备份）；
 * 之后静默重读（queryPermission=granted 时），授权被收回则等用户点按钮时再请求。
 * 安全上下文限制：目录授权只在 localhost/127.0.0.1 等安全来源可用——局域网 IP 打开的页面
 * 会拿不到该 API，此时明确提示（而不是静默失败）。
 */

import { parseTodoMarkdown, type ScannedTodo } from './todoScan'

/* ---- 最小类型声明（lib.dom 对 showDirectoryPicker 的覆盖不全） ---- */
interface FsPermissionHandle {
  kind: 'file' | 'directory'
  queryPermission?(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}
interface FsFileHandle extends FsPermissionHandle {
  kind: 'file'
  getFile(): Promise<File>
}
interface FsDirHandle extends FsPermissionHandle {
  kind: 'directory'
  name: string
  entries(): AsyncIterableIterator<[string, FsFileHandle | FsDirHandle]>
  getFileHandle(name: string): Promise<FsFileHandle>
}

const HANDLE_DB = 'pwork-fs-handles'
const HANDLE_STORE = 'handles'
const ROOT_KEY = 'todo-scan-root'

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(HANDLE_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'))
  })
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, mode)
    const req = fn(tx.objectStore(HANDLE_STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('句柄存取失败'))
  })
}

export function fsAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
}

export async function saveRootHandle(handle: unknown): Promise<void> {
  await withStore('readwrite', (s) => s.put(handle, ROOT_KEY) as IDBRequest<IDBValidKey>)
}

export async function loadRootHandle(): Promise<FsDirHandle | null> {
  try {
    const h = (await withStore('readonly', (s) => s.get(ROOT_KEY) as IDBRequest<unknown>)) as FsDirHandle | null
    return h && h.kind === 'directory' ? h : null
  } catch {
    return null
  }
}

export async function clearRootHandle(): Promise<void> {
  await withStore('readwrite', (s) => s.delete(ROOT_KEY) as IDBRequest<undefined>)
}

/** 授权状态：granted=可静默读；prompt=需要用户手势内再授权；句柄失效返回 'invalid' */
export async function rootPermission(handle: FsDirHandle): Promise<'granted' | 'prompt' | 'invalid'> {
  try {
    if (!handle.queryPermission) return 'granted'
    const state = await handle.queryPermission({ mode: 'read' })
    return state === 'granted' ? 'granted' : 'prompt'
  } catch {
    return 'invalid'
  }
}

/** 用户手势内调用：请求授权（浏览器弹窗） */
export async function requestRootPermission(handle: FsDirHandle): Promise<boolean> {
  if (!handle.requestPermission) return true
  return (await handle.requestPermission({ mode: 'read' })) === 'granted'
}

/** 弹目录选择器（必须是用户点击触发） */
export async function pickRootDirectory(): Promise<FsDirHandle | null> {
  const picker = (window as unknown as { showDirectoryPicker?: () => Promise<FsDirHandle> }).showDirectoryPicker
  if (!picker) return null
  return picker()
}

export interface ScanResult {
  rootName: string
  todos: ScannedTodo[]
  projects: string[]
}

/** 扫描：根目录下一层子文件夹里的 TODO.md（大小写不敏感）。文件读不到的单项跳过并计数。 */
export async function scanRootTodos(handle: FsDirHandle): Promise<ScanResult> {
  const todos: ScannedTodo[] = []
  const projects: string[] = []
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== 'directory') continue
    let file: FsFileHandle
    try {
      file = await entry.getFileHandle('TODO.md')
    } catch {
      try {
        file = await entry.getFileHandle('todo.md')
      } catch {
        continue
      }
    }
    try {
      const text = await (await file.getFile()).text()
      const parsed = parseTodoMarkdown(text)
      if (parsed.length === 0) continue
      projects.push(name)
      for (const p of parsed) todos.push({ project: name, section: p.section, text: p.text })
    } catch {
      /* 单个文件读失败不拖垮整轮扫描 */
    }
  }
  return { rootName: handle.name, todos, projects }
}
