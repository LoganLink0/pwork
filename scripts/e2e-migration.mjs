/**
 * S2 迁移向导真机 E2E（08 设计 S2 收尾判据）：
 * 前置：`npx tauri dev` 已启动且带 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222
 * 流程：种子旧 IndexedDB（速记+待办各 1 条）→ db_destroy 删掉全新 pwork.db → 重载触发迁移窗口
 *       → 点「开始迁移」→ 等自动重载 → 验证主库存在且界面能读到种子数据。
 * 用法：node scripts/e2e-migration.mjs
 */
const DEBUG_PORT = Number(process.env.CDP_PORT ?? 9223)
const BASE = `http://127.0.0.1:${DEBUG_PORT}`

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/json/version`)
      if (r.ok) return
    } catch {}
    await sleep(1000)
  }
  throw new Error('CDP 调试端口未就绪（9222）——确认 tauri dev 以 remote-debugging-port=9222 启动')
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
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

const SEED_AT = '2026-10-31T08:00:00.000Z'
const SEED_EXPRESSION = `(async () => {
  const records = {
    notes: [{
      id: 'note_e2e_1', title: '迁移验证速记', body: 'S2 端到端验证数据：迁移后应出现在速记列表。',
      tags: ['E2E'], links: { itemIds: [], reviewIds: [], taskIds: [] }, source: 'manual',
      createdAt: '${SEED_AT}', updatedAt: '${SEED_AT}', deletedAt: null, schemaVersion: 1,
    }],
    tasks: [{
      id: 'task_e2e_1', title: '迁移验证待办', status: 'todo', lane: 3, due: '2026-12-01',
      origin: { kind: 'manual', refId: null }, closedAt: null,
      createdAt: '${SEED_AT}', updatedAt: '${SEED_AT}', deletedAt: null, schemaVersion: 1,
    }],
  }
  function put(store, rec) {
    return new Promise((res, rej) => {
      const open = indexedDB.open('pwork-workbench')
      open.onsuccess = () => {
        const db = open.result
        const tx = db.transaction(store, 'readwrite')
        tx.objectStore(store).put(rec)
        tx.oncomplete = () => { db.close(); res(true) }
        tx.onerror = () => rej(tx.error)
      }
      open.onerror = () => rej(open.error)
    })
  }
  await put('notes', records.notes[0])
  await put('tasks', records.tasks[0])
  return 'seeded'
})()`

const results = []
function record(step, ok, detail = '') {
  results.push({ step, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${step}${detail ? ' — ' + detail : ''}`)
}

const cdp = await (async () => {
  await waitReady()
  return connect(await pageWs())
})()

// ① 种子旧库
record('种子旧 IndexedDB（速记+待办各 1 条）', (await cdp.evaluate(SEED_EXPRESSION)) === 'seeded')

// ② 删除全新 pwork.db（应用首次启动按空库创建），制造"老用户升级"场景
const destroyed = await cdp.evaluate(
  `(async () => { await window.__TAURI_INTERNALS__.invoke('db_destroy'); return true })()`,
)
record('删除全新 pwork.db（制造老用户升级场景）', destroyed === true)

// ③ 重载触发迁移窗口
await cdp.evaluate('location.reload()')
await sleep(2500)
const cdp2 = await (async () => connect(await pageWs()))()
const modalShown = await waitFor('迁移窗口出现', () => cdp2.evaluate(`!!document.querySelector('.mig-modal')`))
record('迁移窗口出现', modalShown === true)

// ④ 点「开始迁移」→ 迁移与对账（数据小、秒级完成）→ 成功触发自动重载（模态框随之消失）；
//    若 30 秒既未完成也未关闭，捕获模态框文本（失败原因）辅助定位
await cdp2.evaluate(`document.querySelector('.mig-actions .btn-primary').click()`)
let finalText = ''
try {
  await waitFor(
    '迁移完成（窗口随自动重载关闭）',
    () => cdp2.evaluate(`!document.querySelector('.mig-modal')`),
    30000,
  )
  record('迁移完成且窗口随重载关闭', true)
} catch {
  finalText = await cdp2.evaluate(`document.querySelector('.mig-modal')?.textContent?.slice(0, 400) ?? '模态框已不在'`)
  record('迁移完成且窗口随重载关闭', false, finalText)
}

// ⑤ 验证：主库存在 + 界面读到种子数据
const cdp3 = await (async () => connect(await pageWs()))()
const probe = await cdp3.evaluate(
  `(async () => (await window.__TAURI_INTERNALS__.invoke('db_probe')).exists)()`,
)
record('pwork.db 主库存在', probe === true)
await cdp3.evaluate(`window.location.hash = '#/input/notes'`)
const noteVisible = await waitFor(
  '速记列表显示种子速记',
  () => cdp3.evaluate(`document.body.innerText.includes('迁移验证速记')`),
  15000,
)
record('重启后界面读到迁移数据（速记列表）', noteVisible === true)

const failed = results.filter((r) => !r.ok)
console.log('')
console.log(failed.length === 0 ? 'E2E 全部通过：迁移向导闭环' : `E2E 有 ${failed.length} 步失败`)
process.exit(failed.length === 0 ? 0 : 1)
