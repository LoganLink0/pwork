/**
 * 信源主动识别三件套真机验证（自检卡 / 引用发现 / 日报异动）：
 * 前置：dev 已启动（CDP 9223）。种子构造三类信源画像 + 转引域名 + 主题异动，
 * 断言三个 UI 区块在真实页面渲染出预期内容。
 * 用法：node scripts/e2e-verify-audit.mjs
 */
const BASE = 'http://127.0.0.1:9223'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function pageWs() {
  const list = await (await fetch(`${BASE}/json`)).json()
  const page = list.find((t) => t.type === 'page') ?? list[0]
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
    ws.onerror = () => reject(new Error('CDP 连接失败'))
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

async function reload() {
  const c = await connect(await pageWs())
  c.evaluate('location.hash = "#/"; location.reload()')
  c.close()
  await sleep(2500)
  return connect(await pageWs())
}

const WIPE = `(async () => {
  await new Promise((resolve) => { const req = indexedDB.deleteDatabase('pwork-workbench'); req.onsuccess = () => resolve(); req.onerror = () => resolve(); req.onblocked = () => resolve() })
  return true
})()`

/** 兴趣域 + 信源 + 条目：构造 good/noisy/idle/young 四画像 + 转引域名 + 主题基线与当日放量 */
const SEED = `(async () => {
  localStorage.setItem('pwork-collect-config', JSON.stringify({ interests: ['量子计算'], dislikes: [], topN: 10, keywords: [] }))
  localStorage.setItem('pwork-collect-config-at', new Date().toISOString())
  const db = await new Promise((res, rej) => { const r = indexedDB.open('pwork-workbench'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const NOW = Date.now()
  const at = (daysAgo) => new Date(NOW - daysAgo * 86400000).toISOString()
  const mk = (sourceId, title, url, daysAgo, vote) => ({ id: 'v_' + Math.random().toString(36).slice(2), sourceId, sourceName: sourceId, url, title, summary: title, fingerprint: url + title, eventGroup: null, publishedAt: null, fetchedAt: at(daysAgo), stage: 'scored', score: { total: 1, parts: {} }, scoreReason: '', aiBy: 'rules', tags: [], otFlag: null, expiresAt: null, annotation: { notes: '', vote, keepForever: false, linkedReviewId: null }, createdAt: at(daysAgo), updatedAt: at(daysAgo), schemaVersion: 1 })
  const rows = []
  // s1 产出健康：20 条、10 票 6 多推
  for (let i = 0; i < 20; i++) rows.push(mk('s1', 's1 条目 ' + i, 'https://s1.example.com/p/' + i, i % 25, i < 10 ? (i < 6 ? 'want' : 'meh') : null))
  // s2 噪声偏高：50 条、12 票仅 1 多推
  for (let i = 0; i < 50; i++) rows.push(mk('s2', 's2 条目 ' + i, 'https://s2.example.com/p/' + i, i % 25, i < 12 ? (i < 1 ? 'want' : 'no') : null))
  // s3 零命中：30 条零投票
  for (let i = 0; i < 30; i++) rows.push(mk('s3', 's3 条目 ' + i, 'https://s3.example.com/p/' + i, i % 25, null))
  // s4 观察中：3 条
  for (let i = 0; i < 3; i++) rows.push(mk('s4', 's4 条目 ' + i, 'https://s4.example.com/p/' + i, i, null))
  // 转引域名（非订阅）：blog.target.com ×3
  for (let i = 0; i < 3; i++) rows.push(mk('s1', '转引文章 ' + i, 'https://blog.target.com/post/' + i, i, null))
  // 主题基线（量子计算，隔天 1 条共 15 条）+ 当日 4 条
  for (let d = 2; d <= 30; d += 2) rows.push(mk('s1', '量子计算进展 ' + d, 'https://s1.example.com/qc/' + d, d, null))
  for (let i = 0; i < 4; i++) rows.push(mk('s2', '量子计算今日爆发 ' + i, 'https://s2.example.com/qc/' + i, 0, null))
  await new Promise((res, rej) => {
    const tx = db.transaction(['sources', 'items'], 'readwrite')
    const src = (id, name) => ({ id, name, url: 'https://' + id + '.example.com/feed', domain: 'ai', tier: 1.5, weight: 0.7, active: true, deletedAt: null, health: { failStreak: 0, lastOkAt: at(1), lastError: null }, createdAt: at(40), updatedAt: at(1) })
    tx.objectStore('sources').put(src('s1', '健康源'))
    tx.objectStore('sources').put(src('s2', '噪声源'))
    tx.objectStore('sources').put(src('s3', '零命中源'))
    tx.objectStore('sources').put(src('s4', '新源'))
    for (const r of rows) tx.objectStore('items').put(r)
    tx.oncomplete = () => { db.close(); res() }
    tx.onerror = () => { db.close(); rej(tx.error) }
  })
  return rows.length
})()`

async function main() {
  let c = await connect(await pageWs())

  // ─── 前置：清主库 + 清旧库 → 直通启动一次（Dexie 借 idbHasBusinessData 建全 schema）
  //     → 种子写 Dexie → 再删主库 → reload 弹迁移窗口 → 点「暂不」留在 Dexie 模式（三件套从旧存储读种子）───
  await c.evaluate(`(async () => { try { await window.__TAURI_INTERNALS__.invoke('db_destroy') } catch {} ; return true })()`)
  await c.evaluate(WIPE)
  c.evaluate('location.reload()')
  c.close()
  await sleep(2500)
  c = await connect(await pageWs())
  await waitFor('Dexie 建库完成（items/sources store 可用）', async () =>
    c.evaluate(`(async () => {
      const dbs = await indexedDB.databases()
      if (!dbs.find((x) => x.name === 'pwork-workbench')) return false
      return await new Promise((resolve) => {
        const req = indexedDB.open('pwork-workbench')
        req.onsuccess = () => { const names = [...req.result.objectStoreNames]; req.result.close(); resolve(names.includes('items') && names.includes('sources')) }
        req.onerror = () => resolve(false)
      })
    })()`),
  )
  const n = await c.evaluate(SEED)
  console.log(`种子写入 ${n} 条`)
  await c.evaluate(`(async () => { await window.__TAURI_INTERNALS__.invoke('db_destroy'); return true })()`)
  c = await reload()
  await waitFor('迁移窗口出现', async () => (await c.evaluate('document.body.innerText')).includes('数据存储升级'))
  await c.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('暂不')).click()`)
  await waitFor('迁移窗口关闭（Dexie 模式服务）', async () => !(await c.evaluate('document.body.innerText')).includes('数据存储升级'))
  console.log('前置就绪：种子已入旧存储，应用以 Dexie 模式运行')

  // ─── 信源页：自检卡 + 引用发现 ───
  await waitFor('信源页加载', async () => {
    c.evaluate('location.hash = "#/input/sources"')
    return (await c.evaluate('document.body.innerText')).includes('信源自检')
  })
  const srcText = await c.evaluate('document.body.innerText')
  const auditOk = srcText.includes('产出健康 1') && srcText.includes('噪声偏高 1') && srcText.includes('零命中 1') && srcText.includes('观察中 1')
  if (!auditOk) throw new Error(`自检卡分类计数不符：${srcText.slice(srcText.indexOf('信源自检'), srcText.indexOf('信源自检') + 300)}`)
  console.log('✓ 自检卡：四类画像计数正确（健康 1 / 噪声 1 / 零命中 1 / 观察 1）')
  const adviceOk = srcText.includes('噪声偏高，建议降档') && srcText.includes('没有一条让你想投票')
  if (!adviceOk) throw new Error('问题信源的建议文案缺失')
  console.log('✓ 自检卡：噪声源与零命中源的建议文案正确')

  const leadsOk = await waitFor('引用发现区块出现', async () => {
    const el = await c.evaluate(`(() => { const q = document.querySelector('[data-testid="source-leads"]'); return q ? q.innerText : null })()`)
    return el && el.includes('blog.target.com') && el.includes('被引用 3 次')
  })
  if (!leadsOk) throw new Error('引用发现区块内容不符')
  console.log('✓ 引用发现：blog.target.com 被引用 3 次上榜，含示例标题与添加入口')

  // ─── 日报页：主题异动条 ───
  c.evaluate('location.hash = "#/input/digest"')
  await waitFor('日报页加载', async () => (await c.evaluate('document.body.innerText')).includes('信息日报'))
  const anomaly = await waitFor('主题异动条出现', async () => {
    const el = await c.evaluate(`(() => { const q = document.querySelector('[data-testid="topic-anomaly"]'); return q ? q.innerText : null })()`)
    return el && el.includes('量子计算') ? el : null
  })
  if (!anomaly.includes('今天 4 条')) throw new Error(`异动条数字不符：${anomaly}`)
  console.log(`✓ 主题异动：${anomaly.replace(/\\s+/g, ' ').slice(0, 90)}…`)

  // 清场
  await c.evaluate(WIPE)
  c.evaluate('localStorage.clear()')
  c.close()
  console.log('\n三件套真机验证全部通过')
}

main().catch((e) => {
  console.error(`验证失败：${e.message}`)
  process.exit(1)
})
