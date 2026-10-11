/**
 * 生产构建静态服务（2026-10 分发加固）：零依赖，node:http 直出 dist/。
 * 用途：给别人装机时跑生产版（npm run build && npm run serve），替代开发服务器。
 * 端口默认 5273（与开发一致，launcher/书签不用改）；被占用时显式 --port 换。
 */
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const portIdx = args.indexOf('--port')
const PORT = Number(portIdx >= 0 ? args[portIdx + 1] : 5273)
const ROOT = resolve(fileURLToPath(import.meta.url), '../../dist')

if (!existsSync(join(ROOT, 'index.html'))) {
  console.error('找不到 dist/index.html——先运行 npm run build')
  process.exit(1)
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

server.listen(PORT, '127.0.0.1', () => {
  console.log(`PWORK 生产版已启动：http://127.0.0.1:${PORT}/ （服务目录 ${ROOT}）`)
})
