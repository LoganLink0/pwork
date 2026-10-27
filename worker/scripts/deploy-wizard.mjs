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
import { randomBytes } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DRY = process.argv.includes('--dry')
const DB_NAME = 'pwork-collect'

const log = (...a) => console.log(...a)
const line = () => log('─'.repeat(60))

// 单例 readline（2026-10-27 修复）：逐问新建接口会在管道/连续问询下丢输入缓冲，
// 某个 ask 永远等不到行——全程共用一个接口，顺序消费标准输入
let rlSingleton = null
async function ask(question) {
  rlSingleton ??= readline.createInterface({ input: process.stdin, output: process.stdout })
  return (await rlSingleton.question(question)).trim()
}

/** 运行命令（继承控制台输出，交互命令可用）；返回是否成功。
 *  入参为单条命令字符串（不传参数数组——args+shell:true 触发 Node DEP0190 废弃警告，
 *  警告混进中文提示里刷屏，2026-10-26 实测用户被日志墙淹没） */
function run(cmdline) {
  const r = spawnSync(cmdline, { stdio: 'inherit', shell: true, cwd: ROOT })
  return r.status === 0
}

/** 运行并捕获输出（解析用） */
function runCapture(cmdline) {
  const r = spawnSync(cmdline, { encoding: 'utf8', shell: true, cwd: ROOT })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/** 登录专用：捕获输出（不透传 wrangler 日志墙），结果由调用方摘要呈现 */
function runLogin() {
  const r = spawnSync('npx wrangler login', {
    stdio: ['inherit', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: true,
    cwd: ROOT,
    timeout: 180_000,
  })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/** 登录态检查（2026-10-27 修复）：本机已有 OAuth 时（升级场景重跑向导）跳过浏览器授权——
 *  旧版每次强制重新 login，没人盯着浏览器就 3 分钟超时，把「升级部署」卡死在登录步 */
function alreadyLoggedIn() {
  const r = spawnSync('npx wrangler whoami', {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: true,
    cwd: ROOT,
    timeout: 30_000,
  })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  return /You are logged in/i.test(out)
}

/** 从 wrangler 输出中提取 database_id */
export function parseDatabaseId(text) {
  const m = text.match(/database_id\s*=\s*"?([0-9a-f][0-9a-f-]{7,})"?/i)
  return m ? m[1] : null
}

/** 回写 wrangler.toml 字段 */
function patchToml(key, value) {
  const p = path.join(ROOT, 'wrangler.toml')
  let s = fs.readFileSync(p, 'utf8')
  const re = new RegExp(`${key} = "[^"]*"`)
  if (!re.test(s)) throw new Error(`wrangler.toml 中未找到 ${key} = "..."`)
  fs.writeFileSync(p, s.replace(re, `${key} = "${value.replace(/"/g, '')}"`))
  log(`  [OK] 已写入 ${key} = ${value}`)
}

/** 读 wrangler.toml 的 [vars] 值（采集偏好的默认值来源） */
export function readTomlVar(key) {
  const s = fs.readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf8')
  const m = s.match(new RegExp(`^${key} = "([^"]*)"`, 'm'))
  return m ? m[1] : null
}

/** 建 D1（已存在时自动从 d1 list 取回 id） */
async function ensureDatabase() {
  const created = runCapture(`npx wrangler d1 create ${DB_NAME}`)
  let id = parseDatabaseId(created.out)
  if (id) return id
  if (/already exists/i.test(created.out)) {
    log('  数据库已存在，取回其 id...')
    const list = runCapture('npx wrangler d1 list --json')
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
  } else if (!run('npm install --no-fund --no-audit')) {
    die('npm install 失败，请检查网络后重试。')
    await ask('按回车退出...')
    return
  }

  // [2/6] 登录（输出治理 2026-10-26：不透传 wrangler 日志——OAuth 网址只在失败兜底时折叠成
  // 一行给出；超时/失败给具体原因与下一步，不再让英文堆栈淹没中文提示）
  log('\n[2/6] Cloudflare 账号')
  if (!DRY && alreadyLoggedIn()) {
    log('  [OK] 本机已登录 Cloudflare，直接继续')
  } else {
    log('  还没有账号？先用邮箱注册（免费计划，无需信用卡）：')
    log('  https://dash.cloudflare.com/sign-up')
    await ask('注册/登录准备好后，按回车打开浏览器授权登录...')
    log('  正在打开浏览器授权（在浏览器里点「Allow」即完成）...')
    if (DRY) {
      log('  [dry] 跳过真实登录')
    } else {
    const login = runLogin()
    if (login.ok) {
      log('  [OK] 已登录')
    } else {
      const url = login.out.match(/https:\/\/dash\.cloudflare\.com\/oauth2\/auth\S+/)?.[0]
      const timedOut = /timed? ?out|超时/i.test(login.out)
      line()
      if (url) {
        log('  浏览器没弹出来的话，手动复制这一行到浏览器打开：')
        log(`  ${url}`)
      }
      if (timedOut) {
        die('授权超时（3 分钟内没在浏览器完成登录）。常见原因：①浏览器没自动弹出——用上面的网址手动打开后再试；②网络访问 Cloudflare 不稳定——换个网络或稍后重跑本向导。')
      } else {
        const last = login.out.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? ''
        die(`登录未完成：${last.slice(0, 160) || 'wrangler 未返回原因'}。重跑本向导再试一次即可。`)
      }
      line()
      await ask('按回车退出...')
      return
    }
    }
  }

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
  } else if (!run(`npx wrangler d1 execute ${DB_NAME} --remote --file=./schema.sql`)) {
    die('建表失败，请检查上方错误（常见：网络抖动，重跑即可）。')
    await ask('按回车退出...')
    return
  }
  log('  [OK] 数据表就绪')

  // [5/6] Token
  log('\n[5/6] 设置访问 Token（云端数据的钥匙，之后要填回工作台）')
  const token =
    DRY ? '__dry__' : (await ask('请输入自定义 Token（直接回车 = 自动生成随机值）: ')) || `ptk_${randomBytes(24).toString('base64url')}`
  if (DRY) {
    log('  [dry] 演示设置 secret')
  } else {
    // Token 走 secret，不写 wrangler.toml——toml 被 git 跟踪，写进去等于凭据进仓库（转公开即泄露）
    const r = spawnSync('npx wrangler secret put TOKEN', {
      input: token + '\n', shell: true, cwd: ROOT, encoding: 'utf8',
    })
    if (r.status !== 0) {
      die('设置 TOKEN secret 失败。请手动执行 npx wrangler secret put TOKEN 后重跑（已完成步骤会跳过）。')
      await ask('按回车退出...')
      return
    }
    log('  [OK] TOKEN 已设为 secret（未写入 wrangler.toml，凭据不进仓库）')
  }

  // [5.5/6] 采集偏好（2026-10-27 用户拍板：云端评分用的三项偏好必须让用户自己填，
  // 不再默默用部署者残留的旧值；直接回车 = 沿用通用默认）
  log('\n[5.5/6] 采集偏好（影响云端筛选的口味，可回车跳过）')
  const defInterests = readTomlVar('INTERESTS') ?? '科技动态,效率工具,行业观察'
  const defDislikes = readTomlVar('DISLIKES') ?? '广告软文,八卦娱乐'
  const defContext = readTomlVar('CONTEXT') ?? '我关注能直接用在工作和学习里的实用内容'
  const interests = (await ask(`兴趣域（逗号分隔，回车=默认「${defInterests}」）: `)).trim() || defInterests
  const dislikes = (await ask(`屏蔽词（逗号分隔，回车=默认「${defDislikes}」）: `)).trim() || defDislikes
  const context = (await ask(`一句话介绍你关注什么（回车=默认「${defContext}」）: `)).trim() || defContext
  if (!DRY) {
    patchToml('INTERESTS', interests)
    patchToml('DISLIKES', dislikes)
    patchToml('CONTEXT', context)
  } else {
    log('  [dry] 跳过偏好回写')
  }

  // [6/6] 部署
  log('\n[6/6] 部署到 Cloudflare（免费档 ¥0/月）...')
  let endpoint = ''
  if (DRY) {
    log('  [dry] 跳过真实部署')
    endpoint = 'https://pwork-collect.你的子域.workers.dev'
  } else {
    const deployed = runCapture('npx wrangler deploy')
    // 只保留有内容的行（空行与进度动画残迹不进终端）
    console.log(deployed.out.split(/\r?\n/).filter((l) => l.trim()).join('\n'))
    if (!deployed.ok) {
      die('部署失败，请把上方错误信息复制出来排查（常见：网络。重跑本向导即可，已完成的步骤会自动跳过）。')
      await ask('按回车退出...')
      return
    }
    endpoint = deployed.out.match(/https:\/\/[\w.-]+\.workers\.dev/)?.[0] ?? ''
  }

  // 收尾必须把两样凭据醒目交到用户手上（2026-10-27 用户反馈：Token 藏在中间日志里等于没给）
  log('')
  log('█'.repeat(58))
  log('  保存下面两样——回工作台要用（关掉窗口就找不回 Token 了，')
  log('  万一丢了重跑本向导再设一次即可）：')
  log('')
  log(`  端点地址：${endpoint || '（见上方部署输出里 workers.dev 那一行）'}`)
  log(`  Token　　：${token}`)
  log('█'.repeat(58))
  log('')
  log('  部署完成！最后两步：')
  log('  1. 打开工作台 http://127.0.0.1:5273/#/settings 的「云端同步」')
  log('     · 推荐（大陆网络稳）：模式选「D1 直连」，填 账户 ID / 数据库 ID /')
  log('       API Token（按页面内指引在 Cloudflare 控制台创建，约 2 分钟）')
  log('     · 或：端点 = 上面的端点地址 + 本 Token（workers.dev 大陆常被阻断）')
  log('     配好后：「推送信源清单」把本地活跃源上云 →「立即同步」拉取')
  log('  2. 抓取时间/采集偏好在工作台 设置 → 云端同步 里改，改完即生效，')
  log('     不用再跑本向导（AI 供应商等高级配置才需要重跑）')
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
