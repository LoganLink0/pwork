// 清理 E2E 种子记录（note_e2e_1 / task_e2e_1）出用户真实 IDB
const BASE = `http://127.0.0.1:${process.env.CDP_PORT ?? 9224}`
async function pageWs() {
  const list = await (await fetch(BASE + '/json')).json()
  const page = list.find((t) => t.type === 'page')
  return page?.webSocketDebuggerUrl
}
const ws = new WebSocket(await pageWs())
let seq = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve: res, reject: rej } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? rej(new Error(msg.error.message)) : res(msg.result)
  }
}
ws.onopen = async () => {
  const expr = `(async () => {
    function del(store, key) {
      return new Promise((res) => {
        const open = indexedDB.open('pwork-workbench')
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction(store, 'readwrite')
          const req = tx.objectStore(store).delete(key)
          req.onsuccess = () => { db.close(); res('deleted') }
          req.onerror = () => res('del失败')
        }
        open.onerror = () => res('open失败')
      })
    }
    function count(store) {
      return new Promise((res) => {
        const open = indexedDB.open('pwork-workbench')
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction(store, 'readonly')
          const req = tx.objectStore(store).count()
          req.onsuccess = () => { db.close(); res(req.result) }
        }
      })
    }
    const a = await del('notes', 'note_e2e_1')
    const b = await del('tasks', 'task_e2e_1')
    return a + ' / ' + b + ' | 清理后 notes=' + (await count('notes')) + ' tasks=' + (await count('tasks'))
  })()`
  const r = await new Promise((res, rej) => {
    const id = ++seq
    const t = setTimeout(() => rej(new Error('超时')), 10000)
    pending.set(id, { resolve: (v) => { clearTimeout(t); res(v) }, reject: rej })
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }))
  })
  console.log('清理结果:', r.result?.value)
  process.exit(0)
}
ws.onerror = () => {
  console.log('ws 失败')
  process.exit(1)
}
setTimeout(() => {
  console.log('总超时')
  process.exit(1)
}, 30000)
