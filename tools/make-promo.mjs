/**
 * 宣传图合成（朋友圈分享图一条命令出图）：
 *   node tools/make-promo.mjs [--platform "Windows 与 macOS"] [--ver v0.1.12] [--out 路径]
 *
 * 流程（复盘 3.37/3.38 沉淀的机制化）：
 *   ① 读模板 docs/assets/promo-1080.html，注入 __PWORK_VER__（默认取 app/package.json）与
 *      __PWORK_PLATFORM__（默认 Windows 与 macOS）两个 token，写临时渲染文件（与模板同目录，相对引用素材）；
 *   ② Edge/Chrome 无头截图 1080×1080；
 *   ③ 输出 docs/assets/promo-1080-vN.png（N 自动递增现有最大版本；--out 可覆盖）；
 *   ④ 校验：尺寸恰为 1080×1080、体积非空；打印 sha256 与大小。
 *   ⑤ 出图后必须人工看图验收（哈希一致 ≠ 内容正确，3.37 的教训）。
 *
 * 换中央实拍图：应用运行时（WebView2 调试端口）截屏裁切替换 docs/assets/promo-app-crop.png——
 * 截图只从运行中的真实产物取，禁止 dev 服务（真源原则）。
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const assets = join(root, 'docs', 'assets')
const templatePath = join(assets, 'promo-1080.html')
const cropPath = join(assets, 'promo-app-crop.png')

/* ---- 参数 ---- */
const args = process.argv.slice(2)
const argOf = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const platform = argOf('--platform') ?? 'Windows 与 macOS'
const verOverride = argOf('--ver')
const outOverride = argOf('--out')

/* ---- 版本：默认取 package.json（单一事实），--ver 可覆盖 ---- */
const pkg = JSON.parse(readFileSync(join(root, 'app', 'package.json'), 'utf-8'))
const version = verOverride ?? `v${pkg.version}`

/* ---- 模板注入 ---- */
const template = readFileSync(templatePath, 'utf-8')
if (!template.includes('__PWORK_VER__') || !template.includes('__PWORK_PLATFORM__')) {
  console.error('模板缺少 __PWORK_VER__ / __PWORK_PLATFORM__ 占位符——模板被改过？请恢复 token 后重试')
  process.exit(1)
}
if (!existsSync(cropPath)) {
  console.error('缺少中央实拍素材 docs/assets/promo-app-crop.png——按复盘 3.38 从运行中的应用截屏裁切后入库')
  process.exit(1)
}
const renderedPath = join(assets, 'promo-1080.render.html')
writeFileSync(renderedPath, template.replaceAll('__PWORK_VER__', version).replaceAll('__PWORK_PLATFORM__', platform))

/* ---- 浏览器探测 ---- */
const browsers = [
  process.env.PWORK_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)
const browser = browsers.find((p) => existsSync(p))
if (!browser) {
  console.error('未找到 Edge/Chrome——用 PWORK_BROWSER=浏览器路径 指定')
  process.exit(1)
}

/* ---- 输出名：自动递增 vN；--out 覆盖 ---- */
let out = outOverride
if (!out) {
  const maxV = Math.max(
    0,
    ...readdirSync(assets)
      .map((f) => /promo-1080-v(\d+)\.png/.exec(f)?.[1])
      .filter(Boolean)
      .map(Number),
  )
  out = join(assets, `promo-1080-v${maxV + 1}.png`)
}

/* ---- 渲染 ---- */
const res = spawnSync(browser, [
  '--headless=new',
  '--disable-gpu',
  '--window-size=1080,1080',
  '--virtual-time-budget=8000',
  `--screenshot=${resolve(out)}`,
  `file:///${renderedPath.replaceAll('\\', '/')}`,
], { stdio: ['ignore', 'ignore', 'pipe'] })
unlinkSync(renderedPath)

/* ---- 校验：PNG 尺寸读 IHDR（宽高在字节 16-24，大端 uint32）；体积非空 ---- */
if (!existsSync(out)) {
  console.error(`渲染失败：浏览器未产出 ${out}${res.stderr?.length ? '\n' + res.stderr.toString() : ''}`)
  process.exit(1)
}
const png = readFileSync(out)
const width = png.readUInt32BE(16)
const height = png.readUInt32BE(20)
if (width !== 1080 || height !== 1080) {
  console.error(`尺寸异常：${width}×${height}（应为 1080×1080）——模板或窗口参数被改过`)
  process.exit(1)
}
if (png.length < 50_000) {
  console.error(`体积异常偏小（${png.length} 字节）——疑似空白渲染，检查模板与素材`)
  process.exit(1)
}
const sha256 = createHash('sha256').update(png).digest('hex')
console.log(`出图：${out}`)
console.log(`尺寸：1080×1080 ｜ 体积：${(png.length / 1024).toFixed(0)} KB ｜ sha256：${sha256.slice(0, 16)}…`)
console.log('最后一步：人工看图验收（版式/文案/实拍卡），通过后随版本批提交。')
