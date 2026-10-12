/**
 * 生产构建静态服务（2026-10 分发加固）：零依赖，node:http 直出 dist/。
 * 用途：给别人装机时跑生产版（npm run build && npm run serve），替代开发服务器。
 * 端口默认 5273（与开发一致，launcher/书签不用改）；被占用时显式 --port 换。
 */
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const portIdx = args.indexOf('--port')
const PORT = Number(portIdx >= 0 ? args[portIdx + 1] : 5273)
const APP_ROOT = resolve(fileURLToPath(import.meta.url), '../..')
const ROOT = join(APP_ROOT, 'dist')

if (!existsSync(join(ROOT, 'index.html'))) {
  console.error('找不到 dist/index.html——先运行 npm run build')
  process.exit(1)
}

/**
 * AI 本地网关自启（2026-10-12 用户拍板：服务起了网关就得在）：
 * 探测 127.0.0.1:8788/health，已有网关（桌面版/手动起的）跳过，否则拉起 tools/gateway.mjs；
 * 静态服务退出时一并收掉。PWORK_SERVE_NO_GATEWAY=1 可关闭（只想纯静态服务时用）。
 */
async function ensureGateway() {
  if (process.env.PWORK_SERVE_NO_GATEWAY === '1') return
  try {
    const r = await fetch('http://127.0.0.1:8788/health', { signal: AbortSignal.timeout(800) })
    if (r.ok) {
      console.log('[gateway] 8788 已有网关在跑，跳过自启')
      return
    }
  } catch {
    /* 未启动 → 继续拉起 */
  }
  const child = spawn(process.execPath, [join(APP_ROOT, 'tools/gateway.mjs')], { cwd: APP_ROOT, stdio: 'ignore' })
  child.unref()
  console.log('[gateway] AI 本地网关已随静态服务启动（127.0.0.1:8788）')
  const bye = () => child.kill()
  process.on('exit', bye)
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { bye(); process.exit(0) })
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
  // 防目录穿越：归一化后必须仍在 ROOT 内
  let filePath = normalize(join(ROOT, urlPath))
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end()
    return
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(ROOT, 'index.html') // hash 路由：未知路径回首页
  }
  const type = MIME[extname(filePath)] ?? 'application/octet-stream'
  res.writeHead(200, { 'content-type': type, 'cache-control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=86400' })
  createReadStream(filePath).pipe(res)
})

await ensureGateway()

server.listen(PORT, '127.0.0.1', () => {
  console.log(`PWORK 生产版已启动：http://127.0.0.1:${PORT} （服务目录 ${ROOT}）`)
})
