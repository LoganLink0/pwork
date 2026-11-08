/**
 * 8 张组图批量出图（promo-card.html 模板 × 8 组配置）：
 *   node tools/make-promo8.mjs
 * 每张注入 TITLE/SUB/SHOT/PROOF/VER 五个 token → Edge 无头截图 1080×1080 →
 * 尺寸/体积校验（与 make-promo.mjs 同款）。出图后逐张人工看图验收（复盘 3.37）。
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const assets = join(root, 'docs', 'assets')
const templatePath = join(assets, 'promo-card.html')
const renderedPath = join(assets, 'promo-card.render.html')
const shotsDir = join(root, 'local', 'promo-shots')
const ver = `v${JSON.parse(readFileSync(join(root, 'app', 'package.json'), 'utf-8')).version}`

const browserList = [
  process.env.PWORK_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)
const browser = browserList.find((p) => existsSync(p))
if (!browser) {
  console.error('未找到 Edge/Chrome——用 PWORK_BROWSER=浏览器路径 指定')
  process.exit(1)
}

const cards = [
  {
    out: join(assets, 'promo8-1-overview.png'),
    title: '开源 11 天，八个版本，<em>一天多一个</em>',
    sub: '五步引导 30 秒上手——写下来、加工、成稿、复盘，四步一个循环',
    shot: join(shotsDir, 's2-desktop-home.png'),
    proof: '532 项自动化测试 · <b>每一次提交全量重跑</b>',
  },
  {
    out: join(assets, 'promo8-2-desktop.png'),
    title: '它现在是<b>装在你电脑里的</b><em>桌面应用</em>',
    sub: '启动即全屏 · 断网也能用 · 数据就在本机',
    shot: join(shotsDir, 's2-desktop-home.png'),
    proof: '<b>Windows 与 macOS 双平台</b> · 自动更新已上线',
  },
  {
    out: join(assets, 'promo8-3-migrate.png'),
    title: '书签、Obsidian、flomo、Notion——<em>一次搬完</em>',
    sub: '导出文件选进来：按网址或内容去重，还能转成待办和复盘素材',
    shot: join(shotsDir, 's3-data.png'),
    proof: '<b>历史数据搬家</b> · 相同内容按时间合并，不产生重复',
  },
  {
    out: join(assets, 'promo8-4-wheel.png'),
    title: '工具轮盘 + 剪贴板速记 + pdone：<em>系统级三连</em>',
    sub: '任何应用上方一键呼出快捷环；复制文字一键入速记库；命令跑完自动弹通知',
    shot: join(shotsDir, 's4-wheel.png'),
    proof: '<b>桌面版专属</b> · Ctrl+Alt+Q 呼出轮盘 · Ctrl+Alt+V 剪贴板速记',
  },
  {
    out: join(assets, 'promo8-5-read.png'),
    title: '不再只有摘要——<em>正文全文，就地阅读</em>',
    sub: '后台自动抓全文进库参与检索；划选一段，摘录到速记并挂回原条目',
    shot: join(shotsDir, 's5-read.png'),
    proof: '<b>阅读视图与摘录</b> · 登录墙等抓不到的会如实说明，可重试',
  },
  {
    out: join(assets, 'promo8-6-ai.png'),
    title: '用自己的 Key，<em>向整个库提问</em>',
    sub: '速记正文、条目、洞察全文都参与回答——回答带来源，可点跳原文',
    shot: join(shotsDir, 's6-ai.png'),
    proof: '<b>AI 全库问答</b> · Key 只写进你电脑上的文件，不经过任何第三方',
  },
  {
    out: join(assets, 'promo8-7-mobile.png'),
    title: '手机打开，<em>21 个页面全部直达</em>',
    sub: '添加到主屏幕当应用用；数据存在手机浏览器的本机存储里',
    shot: join(shotsDir, 's7-mobile.png'),
    proof: '<b>移动端 PWA</b> · 页面有新版本时自动刷新',
  },
  {
    out: join(assets, 'promo8-8-safe.png'),
    title: '数据去哪了，<em>一张图看懂</em>',
    sub: '实线全部在你的电脑里；虚线是仅有的两条可选外发通道，默认关闭',
    shot: join(assets, 'data-security.png'),
    proof: '<b>数据安全</b> · 无账号无遥测，532 项测试与开源代码可查',
  },
]

const template = readFileSync(templatePath, 'utf-8')
if (!template.includes('__TITLE__') || !template.includes('__SHOT__')) {
  console.error('模板缺少 __TITLE__ / __SHOT__ token——模板被改过？请恢复 token 后重试')
  process.exit(1)
}

let fail = 0
for (const c of cards) {
  const html = template
    .replaceAll('__TITLE__', c.title)
    .replaceAll('__SUB__', c.sub)
    .replaceAll('__SHOT__', c.shot.replaceAll('\\', '/'))
    .replaceAll('__PROOF__', c.proof)
    .replaceAll('__PWORK_VER__', ver)
  writeFileSync(renderedPath, html)

  const res = spawnSync(browser, [
    '--headless=new',
    '--disable-gpu',
    '--window-size=1080,1080',
    '--virtual-time-budget=8000',
    `--screenshot=${resolve(c.out)}`,
    `file:///${renderedPath.replaceAll('\\', '/')}`,
  ], { stdio: ['ignore', 'ignore', 'pipe'] })

  if (!existsSync(c.out)) {
    console.error(`渲染失败：${c.out}${res.stderr?.length ? '\n' + res.stderr.toString() : ''}`)
    fail++
    continue
  }
  const png = readFileSync(c.out)
  if (png.length < 50_000) {
    console.error(`体积异常偏小（${png.length} 字节）：${c.out}`)
    fail++
    continue
  }
  console.log(`OK ${c.out}（${(png.length / 1024).toFixed(0)} KB）`)
}

if (fail > 0) {
  console.error(`\n${fail} 张失败——修复后重跑`)
  process.exit(1)
}
console.log('\n八张出图完成——逐张人工看图验收后使用')
