// 重启后状态检查：迁移模式判定 + 种子数据可见性
const BASE = `http://127.0.0.1:${process.env.CDP_PORT ?? 9223}`
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
async function pageWs() {
  const list = await (await fetch(BASE + '/json')).json()
  const page = list.find((t) => t.type === 'page')
  return page?.webSocketDebuggerUrl
}
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const pending = new Map()
    const connTimer = setTimeout(() => reject(new Error('ws 连接超时')), 8000)
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        const { resolve: res, reject: rej } = pending.get(msg.id)
        pending.delete(msg.id)
        clearTimeout(connTimer)
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result)
      }
    }
    ws.onopen = () =>
      resolve({
        evaluate: (expression) =>
          new Promise((res, rej) => {
            const id = Date.now() + Math.random()
            const t = setTimeout(() => rej(new Error('evaluate 超时——页面主线程被阻塞')), 6000)
            ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }))
            pending.set(id, {
              resolve: (r) => {
                clearTimeout(t)
                if (r.exceptionDetails) rej(new Error(r.exceptionDetails.exception?.description ?? '页面异常'))
                else res(r.result?.value)
              },
              reject: (e) => {
                clearTimeout(t)
                rej(e)
              },
            })
          }),
        close: () => {
          clearTimeout(connTimer)
          ws.close()
        },
      })
    ws.onerror = () => {
      clearTimeout(connTimer)
      reject(new Error('ws 连接失败'))
    }
  })
}

const cdp = await connect(await pageWs())
const modal = await cdp.evaluate(`!!document.querySelector('.mig-modal')`)
console.log('迁移窗口出现:', modal)
if (modal) {
  const text = await cdp.evaluate(`document.querySelector('.mig-modal h2')?.textContent ?? ''`)
  console.log('窗口标题:', text)
  process.exit(0)
}
const body = await cdp.evaluate(`document.body.innerText.slice(0, 200)`)
console.log('页面文本开头:', body.replaceAll('\n', ' | ').slice(0, 160))
await cdp.evaluate(`window.location.hash = '#/input/notes'`)
await sleep(1500)
const noteVisible = await cdp.evaluate(`document.body.innerText.includes('迁移验证速记')`)
console.log('速记列表含种子速记:', noteVisible)
await cdp.evaluate(`window.location.hash = '#/tasks'`)
await sleep(1200)
const taskVisible = await cdp.evaluate(`document.body.innerText.includes('迁移验证待办')`)
console.log('待办页含种子待办:', taskVisible)
cdp.close()
process.exit(noteVisible && taskVisible ? 0 : 1)
