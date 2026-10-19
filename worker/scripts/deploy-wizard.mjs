/**
 * PWORK 采集上云 · 部署向导（交互式，中文提示）。
 * 由 部署向导.cmd（纯 ASCII 壳）调用；cmd/批处理不承载任何中文——编码问题源头根治。
 *
 * 流程：环境检查 → 装依赖 → Cloudflare 登录/注册 → 建 D1（自动写回 database_id）
 *       → 建表 → 设置 Token → 部署 → 打印专属端点与回填指引。
 *
 * 可选参数：--dry  只演示流程与自检，不做任何真实变更。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DRY = process.argv.includes('--dry')
const DB_NAME = 'pwork-collect'

const log = (...a) => console.log(...a)
const line = () => log('─'.repeat(60))

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await rl.question(question)).trim()
  } finally {
    rl.close()
  }
}

/** 运行命令（继承控制台输出，交互命令可用）；返回是否成功 */
function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, cwd: ROOT })
  return r.status === 0
}

/** 运行并捕获输出（解析用） */
function runCapture(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: true, cwd: ROOT })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/** 从 wrangler 输出中提取 database_id */
export function parseDatabaseId(text) {
  const m = text.match(/database_id\s*=\s*"?([0-9a-f][0-9a-f-]{7,})"?/i)
  return m ? m[1] : null
}

/** 回写 wrangler.toml 字段 */
export function patchToml(key, value) {
  const p = path.join(ROOT, 'wrangler.toml')
  let s = fs.readFileSync(p, 'utf8')
  const re = new RegExp(`${key} = "[^"]*"`)
  if (!re.test(s)) throw new Error(`wrangler.toml 中未找到 ${key} = "..."`)
  fs.writeFileSync(p, s.replace(re, `${key} = "${value}"`))
  log(`  [OK] 已写入 ${key} = ${value}`)
}

/** 建 D1（已存在时自动从 d1 list 取回 id） */
async function ensureDatabase() {
  const created = runCapture('npx', ['wrangler', 'd1', 'create', DB_NAME])
  let id = parseDatabaseId(created.out)
  if (id) return id
  if (/already exists/i.test(created.out)) {
    log('  数据库已存在，取回其 id...')
    const list = runCapture('npx', ['wrangler', 'd1', 'list', '--json'])
    try {
      const rows = JSON.parse(list.out.trim().slice(list.out.trim().search(/\[/)))
      const row = rows.find((r) => r.name === DB_NAME)
      if (row?.uuid) return row.uuid
    } catch {
      /* 落到手动指引 */
    }
  }
  return null
}

function die(message) {
  console.error(`\n[X] ${message}`)
  console.error('    修复后重新运行本向导即可（已完成的步骤不会重复生效）。')
}

async function main() {
  log('='.repeat(60))
  log('  PWORK 采集上云 · 部署向导（免费档，约 10 分钟）')
  log('  流程：登录 Cloudflare → 建数据库 → 自动写配置 → 部署')
  log('='.repeat(60))

  // [0/6] 环境
  const major = Number(process.version.slice(1).split('.')[0])
  if (major < 20) {
    die(`当前 Node.js ${process.version}，需要 ≥ 20。请到 https://nodejs.org/ 安装 LTS 版。`)
    await ask('按回车退出...')
    return
  }
  log(`\n[0/6] 环境 OK：Node.js ${process.version}`)

  // [1/6] 依赖
  log('\n[1/6] 安装依赖（首次约 1 分钟）...')
  if (DRY) {
    log('  [dry] 跳过真实安装')
  } else if (!run('npm', ['install', '--no-fund', '--no-audit'])) {
    die('npm install 失败，请检查网络后重试。')
    await ask('按回车退出...')
    return
  }

  // [2/6] 登录
  log('\n[2/6] Cloudflare 账号')
  log('  还没有账号？先用邮箱注册（免费计划，无需信用卡）：')
  log('  https://dash.cloudflare.com/sign-up')
  await ask('注册/登录准备好后，按回车打开浏览器授权登录...')
  log('  正在打开浏览器授权...')
  if (DRY) {
    log('  [dry] 跳过真实登录')
  } else if (!run('npx', ['wrangler', 'login'])) {
    die('登录失败/未完成授权。请重跑本向导。')
    await ask('按回车退出...')
    return
  }
  log('  [OK] 已登录')
  log('  （浏览器若打开了 workers.dev 的"授权成功"页并显示超时——忽略即可，')
  log('    那是装饰页；终端上一行的 Successfully logged in 才是真实结果。workers.dev')
  log('    域名在大陆网络常不可达，你的登录凭证走的是本机回调，不受影响。）')

  // [3/6] 数据库
  log(`\n[3/6] 创建数据库 D1（${DB_NAME}）...`)
  if (DRY) {
    log('  [dry] 演示解析：sample → ' + parseDatabaseId('database_id = "abcd1234-5678-90ef"'))
  } else {
    const id = await ensureDatabase()
    if (!id) {
      die('未能取得 database_id。请手动填入 wrangler.toml 后重跑。')
      await ask('按回车退出...')
      return
    }
    patchToml('database_id', id)
  }

  // [4/6] 建表
  log('\n[4/6] 初始化数据表...')
  if (DRY) {
    log('  [dry] 跳过远程建表')
  } else if (!run('npx', ['wrangler', 'd1', 'execute', DB_NAME, '--remote', '--file=./schema.sql'])) {
    die('建表失败，请检查上方错误（常见：网络抖动，重跑即可）。')
    await ask('按回车退出...')
    return
  }
  log('  [OK] 数据表就绪')

  // [5/6] Token
  log('\n[5/6] 设置访问 Token（云端数据的钥匙，之后要填回工作台）')
  const token =
    DRY ? '__dry__' : (await ask('请输入自定义 Token（直接回车 = 自动生成随机值）: ')) || `ptk_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
  if (DRY) {
    log('  [dry] 演示设置 secret')
  } else {
    // Token 走 secret，不写 wrangler.toml——toml 被 git 跟踪，写进去等于凭据进仓库（转公开即泄露）
    const r = spawnSync('npx', ['wrangler', 'secret', 'put', 'TOKEN'], {
      input: token + '\n', shell: true, cwd: ROOT, encoding: 'utf8',
    })
    if (r.status !== 0) {
      die('设置 TOKEN secret 失败。请手动执行 npx wrangler secret put TOKEN 后重跑（已完成步骤会跳过）。')
      await ask('按回车退出...')
      return
    }
    log('  [OK] TOKEN 已设为 secret（未写入 wrangler.toml，凭据不进仓库）')
  }

  // [6/6] 部署
  log('\n[6/6] 部署到 Cloudflare（免费档 ¥0/月）...')
  if (DRY) {
    log('  [dry] 跳过真实部署')
  } else {
    const deployed = runCapture('npx', ['wrangler', 'deploy'])
    console.log(deployed.out)
    if (!deployed.ok) {
      die('部署失败，请把上方错误信息复制出来排查（常见：网络。重跑本向导即可，已完成的步骤会自动跳过）。')
      await ask('按回车退出...')
      return
    }
  }

  log('')
  log('='.repeat(60))
  log('  部署完成！最后两步：')
  log('  1. 打开工作台 http://127.0.0.1:5273/#/settings 的「云端同步」')
  log('     · 推荐（大陆网络稳）：模式选「D1 直连」，填 账户 ID / 数据库 ID /')
  log('       API Token（按页面内指引在 Cloudflare 控制台创建，约 2 分钟）')
  log('     · 或：端点 = 上面的 workers.dev 地址 + 本 Token（workers.dev 大陆常被阻断）')
  log('     配好后：「推送信源清单」把本地活跃源上云 →「立即同步」拉取')
  log('  2. 以后想改抓取频率/AI 配置：编辑 wrangler.toml 后重跑本向导或 npx wrangler deploy')
  log('='.repeat(60))
  await ask('\n按回车退出...')
}

// 仅直接执行时运行 main（被 import 做单元验证时不触发）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`\n[X] 发生未预期的错误：${e?.message ?? e}`)
    return ask('按回车退出...')
      .catch(() => {})
      .finally(() => process.exit(1))
  })
}
