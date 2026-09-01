/**
 * wrangler.toml 字段回写工具（部署向导.cmd 调用）：
 *   node scripts/patch-toml.mjs database_id <uuid>
 *   node scripts/patch-toml.mjs TOKEN <your-token>
 */
import fs from 'node:fs'

const [key, ...rest] = process.argv.slice(2)
const value = rest.join(' ').trim()

if (!key || !value) {
  console.error('用法: node scripts/patch-toml.mjs <字段名> <值>')
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
console.log(`已写入 ${key} = ${value}`)
