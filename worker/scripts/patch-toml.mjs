/**
 * wrangler.toml 字段回写工具（部署向导.cmd 调用）：
 *   node scripts/patch-toml.mjs database_id <uuid>
 * 注意：只用于非机密字段（database_id 等）。TOKEN/API Key 一律走
 * `npx wrangler secret put`——wrangler.toml 被 git 跟踪，凭据写进去等于进仓库。
 */
import fs from 'node:fs'

const [key, ...rest] = process.argv.slice(2)
const value = rest.join(' ').trim()

if (!key || !value) {
  console.error('用法: node scripts/patch-toml.mjs <字段名> <值>')
  process.exit(1)
}
if (/token|key|secret/i.test(key)) {
  console.error(`拒绝：${key} 是凭据类字段，请用 npx wrangler secret put ${key} 设置（不进 git 跟踪的 toml）`)
  process.exit(1)
}

const path = new URL('../wrangler.toml', import.meta.url)
let content = fs.readFileSync(path, 'utf8')

const re = new RegExp(`${key} = "[^"]*"`)
if (!re.test(content)) {
  console.error(`wrangler.toml 中未找到字段 ${key} = "..."`)
  process.exit(1)
}

content = content.replace(re, `${key} = "${value}"`)
fs.writeFileSync(path, content)
console.log(`已写入 ${key}（值不在终端回显）`)
