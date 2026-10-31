/**
 * 系统工具台第二批真机 E2E：Shell 通知桥 + 剪贴板速记全局热键。
 * 前置：
 *   1. Node 开发网关与安装版 PWORK 已关闭（8788 必须由 dev 版 Rust 网关持有，单实例不冲突）
 *   2. `npx tauri dev` 已以 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223 启动
 * 流程：
 *   ① POST /notify → 断言 ok:true → 页面出现 toast（Shell 通知桥端到端：网关→事件→toast）
 *   ② 写剪贴板 → SendKeys 模拟 Ctrl+Alt+V → toast「已存入速记」→ 主库 notes 表查到该条
 *   ③ 清理：删除测试速记行 + vault 镜像文件（直连 SQL 删除不触发镜像钩子，必须同步删文件）
 * 用法：node scripts/e2e-systools.mjs
 */
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const DEBUG_PORT = Number(process.env.CDP_PORT ?? 9223)
const BASE = `http://127.0.0.1:${DEBUG_PORT}`
const VAULT_DIR = join(process.env.APPDATA, 'com.pwork.workbench', 'vault', '速记')
const MARK = `E2E-CLIP-${Date.now()}`

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/json/version`)
      if (r.ok) return
    } catch {}
    await sleep(1000)
  }
  throw new Error('CDP 调试端口未就绪——确认 tauri dev 以 remote-debugging-port=9223 启动')
}

async function pageWs() {
  const list = await (await fetch(`${BASE}/json`)).json()
  const page = list.find((t) => t.type === 'page') ?? list[0]
  if (!page?.webSocketDebuggerUrl) throw new Error('CDP 无可用页面目标')
  return page.webSocketDebuggerUrl
}

let seq = 0
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const pending = new Map()
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        const { resolve: res, reject: rej } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) rej(new Error(msg.error.message))
        else res(msg.result)
      }
    }
    ws.onopen = () =>
      resolve({
        evaluate: async (expression) => {
          const id = ++seq
          ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
          const r = await new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }))
          if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? '页面异常')
          return r.result?.value
        },
        close: () => ws.close(),
      })
    ws.onerror = () => reject(new Error('CDP WebSocket 连接失败'))
  })
}

async function waitFor(desc, fn, timeoutMs = 20000) {
  const start = Date.now()
  for (;;) {
    try {
      const v = await fn()
      if (v) return v
    } catch {}
    if (Date.now() - start > timeoutMs) throw new Error(`等待超时：${desc}`)
    await sleep(700)
  }
}

/** 剪贴板操作走 PowerShell（避免单引号进命令串，标记文本只含安全字符） */
function setClipboard(text) {
  execSync(`powershell -NoProfile -STA -Command "Set-Clipboard -Value '${text}'"`)
}

function pressCaptureHotkey() {
  // ^ = Ctrl，% = Alt；全局热键由系统级注册，发到任何前台窗口都会被 PWORK 截获
  execSync(`powershell -NoProfile -STA -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^%v')"`)
}

async function main() {
  await waitReady()
  const c = await connect(await pageWs())

  // ─── ① Shell 通知桥：网关 /notify → shell-notify 事件 → toast ───
  const noteBody = `E2E 验证 shell 通知桥 ${MARK}`
  const notifyResp = await fetch('http://127.0.0.1:8788/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '构建完成', body: noteBody }),
  })
  const notifyJson = await notifyResp.json()
  if (!notifyResp.ok || notifyJson.ok !== true) {
    throw new Error(`/notify 返回异常：HTTP ${notifyResp.status} ${JSON.stringify(notifyJson)}`)
  }
  console.log('① /notify 返回 ok:true')
  await waitFor('Shell 通知桥 toast 出现', async () =>
    (await c.evaluate('document.body.innerText')).includes(noteBody),
  )
  console.log('① 页面 toast 已出现（Shell 通知桥端到端通过）')

  // ─── ② 剪贴板速记：写剪贴板 → 全局热键 → 入库 ───
  setClipboard(`剪贴板速记真机验证 ${MARK}：看到就摘，一键入速记。`)
  pressCaptureHotkey()
  await waitFor('剪贴板速记 toast 出现', async () =>
    (await c.evaluate('document.body.innerText')).includes('已存入速记'),
  )
  console.log('② 热键触发 + toast 已出现')

  // 入库后端探测：迁移已跑过的环境走 SQLite 主库（db_select），未迁移的 dev 会话走 IndexedDB（Dexie）——两处都查
  const probe = await c.evaluate(
    `(async () => { try { return await window.__TAURI_INTERNALS__.invoke('db_select', { sql: "SELECT id, payload FROM notes ORDER BY updatedAt DESC LIMIT 5", params: [] }) } catch { return null } })()`,
  )
  let hit = null
  let rows = null
  if (Array.isArray(probe)) {
    rows = probe.map((r) => ({ id: r.id, ...JSON.parse(r.payload) }))
    hit = rows.find((n) => typeof n.body === 'string' && n.body.includes(MARK))
    if (hit && hit.source !== 'quick') throw new Error(`source 应为 quick，实际 ${hit.source}`)
  }
  if (!hit) {
    // Dexie 直读：pwork-workbench 库的 notes 表（未迁移会话的入库去向）
    const dexieRows = await c.evaluate(
      `(async () => await new Promise((resolve, reject) => { const req = indexedDB.open('pwork-workbench'); req.onerror = () => reject(req.error); req.onsuccess = () => { const d = req.result; const tx = d.transaction('notes', 'readonly'); const st = tx.objectStore('notes'); const all = st.getAll(); all.onerror = () => reject(all.error); all.onsuccess = () => { d.close(); resolve(all.result) } } }))()`,
    )
    hit = dexieRows.find((n) => typeof n.body === 'string' && n.body.includes(MARK))
    if (hit && hit.source !== 'quick') throw new Error(`source 应为 quick，实际 ${hit.source}`)
    if (!hit) throw new Error(`主库与 IndexedDB 都没查到标记 ${MARK}`)
    console.log(`② IndexedDB 查到速记（id=${hit.id}，source=quick）——剪贴板热键端到端通过（未迁移会话走 Dexie）`)
  } else {
    console.log(`② 主库查到速记（id=${hit.id}，source=quick）——剪贴板热键端到端通过`)
  }

  // ─── ③ 清理：按后端删记录 + 删 vault 镜像文件（直连删除不触发镜像钩子，文件须手动删）───
  if (rows) {
    await c.evaluate(
      `(async () => (await window.__TAURI_INTERNALS__.invoke('db_exec', { sql: "DELETE FROM notes WHERE id = ?", params: ['${hit.id}'] })))()`,
    )
    const after = await c.evaluate(
      `(async () => (await window.__TAURI_INTERNALS__.invoke('db_select', { sql: "SELECT id FROM notes WHERE id = ?", params: ['${hit.id}'] })))()`,
    )
    if (after.length !== 0) throw new Error('清理失败：测试速记仍在主库')
  } else {
    await c.evaluate(
      `(async () => await new Promise((resolve, reject) => { const req = indexedDB.open('pwork-workbench'); req.onerror = () => reject(req.error); req.onsuccess = () => { const d = req.result; const tx = d.transaction('notes', 'readwrite'); const del = tx.objectStore('notes').delete('${hit.id}'); del.onerror = () => reject(del.error); del.onsuccess = () => { d.close(); resolve(true) } } }))()`,
    )
  }
  let mirrorRemoved = 0
  try {
    for (const f of readdirSync(VAULT_DIR)) {
      if (!f.endsWith('.md')) continue
      if (readFileSync(join(VAULT_DIR, f), 'utf8').includes(MARK)) {
        rmSync(join(VAULT_DIR, f))
        mirrorRemoved++
      }
    }
  } catch {
    // vault 目录不存在（镜像未开启/未迁移）不算失败
  }
  console.log(`③ 清理完成：测试速记已删，vault 镜像文件删除 ${mirrorRemoved} 个`)
  c.close()
  console.log(`\nE2E 全部通过（标记 ${MARK}）`)
}

main().catch((e) => {
  console.error(`E2E 失败：${e.message}`)
  process.exit(1)
})
