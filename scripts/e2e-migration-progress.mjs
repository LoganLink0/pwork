/**
 * 迁移向导真机 E2E（进度实时性 + 失败报错，2026-11-01 挂起事件的回归验证）：
 * 前置：`PWORK_NO_DEV_GATEWAY=1 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223 npx tauri dev` 已启动
 * 流程：
 *   ① 清场（无主库 + 空旧库）→ 应用 SQLite 直通启动一次（Dexie 借检测建全 schema）
 *      → 写入大库种子（items 2600 = 6 批 + 少量其他表）→ 删主库 → 重载弹迁移窗口
 *   ② 点「开始迁移」→ 每 150ms 采样进度条：宽度多帧单调递增至 100% + 「迁移完成」
 *   ③ 自动重载后主库对账（items/notes/sources/tasks 行数）
 *   ④ 真实故障注入：清主库重弹窗口 → 脚本侧把 pwork.db 替换为损坏字节（模拟磁盘写坏）
 *      → db_open 必失败 → 断言失败界面展示人话报错 + 旧 IndexedDB 数据完好 → 清场
 * 用法：node scripts/e2e-migration-progress.mjs
 */
import { writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const DEBUG_PORT = Number(process.env.CDP_PORT ?? 9223)
const BASE = `http://127.0.0.1:${DEBUG_PORT}`
const SEED_AT = '2026-11-01T08:00:00.000Z'
const ITEMS = 2600
const DB_PATH = join(process.env.APPDATA, 'com.pwork.workbench', 'pwork.db')

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

async function waitFor(desc, fn, timeoutMs = 30000) {
  const start = Date.now()
  for (;;) {
    try {
      const v = await fn()
      if (v) return v
    } catch {}
    if (Date.now() - start > timeoutMs) throw new Error(`等待超时：${desc}`)
    await sleep(300)
  }
}

async function reconnect() {
  return connect(await pageWs())
}

async function reload(c) {
  c.evaluate('location.reload()')
  c.close()
  await sleep(2500)
  return reconnect()
}

/** 清掉应用自建的旧 IndexedDB（下次 reload 时 Dexie 会重建完整 schema） */
const WIPE_EXPRESSION = `(async () => {
  await new Promise((resolve) => { const req = indexedDB.deleteDatabase('pwork-workbench'); req.onsuccess = () => resolve(); req.onerror = () => resolve(); req.onblocked = () => resolve() })
  return true
})()`

/** 往 Dexie 已建好的库里写种子（打开现有版本，不自定义 schema） */
const SEED_EXPRESSION = `(async () => {
  const ITEMS = ${ITEMS}
  const AT = '${SEED_AT}'
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('pwork-workbench')
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error)
  })
  const item = (i) => ({ id: 'item_e2e_' + i, sourceId: 'src_e2e', stage: 'unread', fingerprint: 'fp-' + i, fetchedAt: AT, otFlag: 'no', title: 'E2E 条目 ' + i, url: 'https://example.com/' + i, summary: '迁移进度验证数据 ' + i })
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['notes', 'sources', 'items', 'tasks'], 'readwrite')
    for (let i = 0; i < ITEMS; i++) tx.objectStore('items').put(item(i))
    for (let i = 0; i < 30; i++) tx.objectStore('notes').put({ id: 'note_e2e_' + i, title: 'E2E 速记 ' + i, body: '迁移验证速记 ' + i, tags: ['E2E'], links: { itemIds: [], reviewIds: [], taskIds: [] }, source: 'manual', createdAt: AT, updatedAt: AT, deletedAt: null, schemaVersion: 1 })
    tx.objectStore('sources').put({ id: 'src_e2e', name: 'E2E 信源', url: 'https://example.com/rss', active: 1, tier: 1, createdAt: AT, updatedAt: AT })
    for (let i = 0; i < 5; i++) tx.objectStore('tasks').put({ id: 'task_e2e_' + i, title: 'E2E 待办 ' + i, status: 'todo', createdAt: AT, updatedAt: AT, deletedAt: null, ifThen: '', priority: 'normal' })
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
  return true
})()`

async function main() {
  await waitReady()
  let c = await reconnect()

  // ─── ① 清场到「无主库 + 空旧库」→ 应用以 SQLite 直通启动（Dexie 借 idbHasBusinessData
  //     的检测建全 schema）→ 写种子 → 删直通建出的空主库 → reload 触发迁移窗口 ───
  await c.evaluate(`(async () => { try { await window.__TAURI_INTERNALS__.invoke('db_destroy') } catch {} ; return true })()`)
  await c.evaluate(WIPE_EXPRESSION)
  c = await reload(c)
  await waitFor('应用加载完成（SQLite 直通，Dexie schema 已建）', async () => (await c.evaluate('document.body.innerText')).length > 200)
  await c.evaluate(SEED_EXPRESSION)
  console.log(`① 种子写入完成（items ${ITEMS} 条 = ${Math.ceil(ITEMS / 500)} 批 + notes 30 + sources 1 + tasks 5）`)
  await c.evaluate(`(async () => { await window.__TAURI_INTERNALS__.invoke('db_destroy'); return true })()`)
  c = await reload(c)
  await waitFor('迁移确认窗口出现', async () =>
    (await c.evaluate('document.body.innerText')).includes('数据存储升级'),
  )
  console.log('① 迁移确认窗口已出现')

  // ─── ② 开始迁移 + 高频采样进度 ───
  await c.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('开始迁移')).click()`)
  const samples = []
  const sampleStart = Date.now()
  for (;;) {
    if (Date.now() - sampleStart > 180000) {
      throw new Error(`进度采样超时：180 秒未到完成界面——疑似挂起复现。已采样 ${samples.length} 帧：${JSON.stringify(samples.slice(-6))}`)
    }
    const s = await c.evaluate(`(() => {
      const pct = document.querySelector('.mig-meter-head b')?.textContent ?? ''
      const w = document.querySelector('.mig-meter-fill')?.style.width ?? ''
      const done = document.body.innerText.includes('迁移完成')
      return { pct, w, done }
    })()`)
    if (s.done) break // 完成界面已无进度条 DOM，完成帧不进宽度序列
    const last = samples[samples.length - 1]
    if (!last || last.w !== s.w) samples.push(s)
    await sleep(150)
  }
  const widths = samples.map((s) => parseFloat(s.w))
  const monotonic = widths.every((w, i) => i === 0 || w >= widths[i - 1])
  if (samples.length < 4) throw new Error(`进度只采样到 ${samples.length} 帧（要求 ≥4）——批次间界面仍未逐帧绘制：${JSON.stringify(samples)}`)
  if (!monotonic) throw new Error(`进度条宽度非单调：${JSON.stringify(widths)}`)
  if (widths[widths.length - 1] < 100) throw new Error('完成时进度条未到 100%')
  console.log(`② 进度采样 ${samples.length} 帧，宽度单调推进：${samples.map((s) => s.pct).join(' → ')}`)

  // ─── ③ 自动重载后主库对账 ───
  await sleep(2500)
  c = await reload(c)
  await waitFor('应用重载完成（数据可读）', async () => (await c.evaluate('document.body.innerText')).length > 500)
  const counts = await c.evaluate(
    `(async () => {
      const r = await window.__TAURI_INTERNALS__.invoke('db_select', { sql: "SELECT (SELECT COUNT(*) FROM items) AS items, (SELECT COUNT(*) FROM notes) AS notes, (SELECT COUNT(*) FROM sources) AS sources, (SELECT COUNT(*) FROM tasks) AS tasks", params: [] })
      return r[0]
    })()`,
  )
  if (counts.items !== ITEMS || counts.notes !== 30 || counts.sources !== 1 || counts.tasks !== 5) {
    throw new Error(`主库对账不符：${JSON.stringify(counts)}（应 items=${ITEMS}, notes=30, sources=1, tasks=5）`)
  }
  console.log(`③ 主库对账通过：${JSON.stringify(counts)}`)

  // ─── ④ 真实故障注入：迁移窗口待命时把主库文件换成损坏字节（模拟磁盘写坏）→ db_open 必失败 ───
  await c.evaluate(`(async () => { try { await window.__TAURI_INTERNALS__.invoke('db_destroy') } catch {} ; return true })()`)
  c = await reload(c)
  await waitFor('迁移确认窗口再次出现', async () =>
    (await c.evaluate('document.body.innerText')).includes('数据存储升级'),
  )
  writeFileSync(DB_PATH, Buffer.alloc(4096, 0xde))
  console.log('④ 已把主库文件替换为损坏字节，点开始迁移……')
  await c.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('开始迁移')).click()`)
  await waitFor('失败界面出现', async () => (await c.evaluate('document.body.innerText')).includes('迁移失败'), 60000)
  const failText = await c.evaluate('document.body.innerText')
  if (!failText.includes('数据没有受影响')) throw new Error('失败界面缺少数据安全承诺文案')
  const idbCount = await c.evaluate(
    `(async () => await new Promise((resolve, reject) => { const req = indexedDB.open('pwork-workbench'); req.onsuccess = () => { const d = req.result; const st = d.transaction('items').objectStore('items').count(); st.onsuccess = () => { d.close(); resolve(st.result) } }; req.onerror = () => reject(req.error) }))()`,
  )
  if (idbCount !== ITEMS) throw new Error(`旧 IndexedDB 数据受损：items 只剩 ${idbCount}`)
  console.log('④ 故障注入通过：失败界面展示报错与安全承诺、旧数据完好')

  // 清场：删损坏文件与种子库，恢复干净环境
  rmSync(DB_PATH, { force: true })
  rmSync(`${DB_PATH}-wal`, { force: true })
  rmSync(`${DB_PATH}-shm`, { force: true })
  await c.evaluate(WIPE_EXPRESSION)
  c.close()
  console.log('\n迁移进度 + 故障注入 E2E 全部通过')
}

main().catch((e) => {
  console.error(`E2E 失败：${e.message}`)
  process.exit(1)
})
