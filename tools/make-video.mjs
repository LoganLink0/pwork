/**
 * 0.1.16 宣传视频合成（43 秒横版 1280×800）：
 *   品牌卡 3s → 四段演示各 9s（textfile 字幕）→ 收尾卡 4s → concat 出 mp4
 *
 * 用法：FFMPEG_EXE=ffmpeg二进制路径 node tools/make-video.mjs
 * （二进制来自 pip install imageio-ffmpeg 后的 imageio_ffmpeg.get_ffmpeg_exe()）
 *
 * 路径全部为正斜杠硬编码常量；ffmpeg 工作目录固定在 tmp，
 * 字幕/字体用纯文件名（Windows 盘符的 filtergraph 转义是重灾区，cwd 方案零转义）。
 * 出片后人工看片验收（节奏/字幕/遮挡）。
 */
import { writeFileSync, existsSync, copyFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const FFMPEG = process.env.FFMPEG_EXE ?? 'ffmpeg'
const ROOT = 'E:/AIPROJECT-GLM/PWORK'
const DEMO = ROOT + '/app/public/demo'
const TMP = ROOT + '/local/video-tmp'
const ASSETS = ROOT + '/docs/assets'
const OUT_MP4 = ASSETS + '/promo-0116-video.mp4'
const FONT_NAME = 'msyh.ttc'

function run(args) {
  const res = spawnSync(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'], cwd: TMP })
  if (res.status !== 0) {
    console.error(`ffmpeg 失败：${res.stderr?.toString().slice(0, 400)}`)
    process.exit(1)
  }
}

const sub = (name, text) => {
  writeFileSync(TMP + '/' + name, text, 'utf-8')
  return name // cwd=TMP 下的纯文件名
}

const bottomBar = (textfile) =>
  `drawbox=y=ih-110:color=black@0.55:t=fill,drawtext=fontfile=${FONT_NAME}:textfile=${textfile}:fontcolor=white:fontsize=40:x=(w-text_w)/2:y=h-95`

const titleCard = (textfile) =>
  `drawtext=fontfile=${FONT_NAME}:textfile=${textfile}:fontcolor=#26221d:fontsize=56:x=140:y=360:line_spacing=28`

const demoIn = (key) => DEMO + '/demo-' + key + '.webm'
const seg = (n) => TMP + '/seg' + n + '.mp4'

/* ---- 字幕与标题文本 ---- */
copyFileSync('C:/Windows/Fonts/msyh.ttc', TMP + '/' + FONT_NAME)
const sub1 = sub('sub1.txt', '速记：想到就记 · 一键转待办')
const sub2 = sub('sub2.txt', '一次搜索全库 · 条目越用越懂你')
const sub3 = sub('sub3.txt', '周报 PPT · 一键生成')
const sub4 = sub('sub4.txt', '3 分钟复盘 · 行动项自动进待办')
const openText = sub('title-open.txt', '开源 11 天，迭代到 0.1.16\n\n八个版本 · 平均一天多一个\n\n这一版，改了什么——45 秒看完')
const endText = sub('title-end.txt', '开源免费 · 529 项测试全绿\n\n每一天的改动都有记录可查\n\npwork.loganlink0.cn\n下载桌面版 · 手机浏览器添加到主屏')

/* ---- 资源存在性 ---- */
for (const key of ['input', 'process', 'output', 'loop']) {
  if (!existsSync(demoIn(key))) {
    console.error(`缺演示视频：${demoIn(key)}`)
    process.exit(1)
  }
}
copyFileSync(ROOT + '/docs/assets/logo-512.png', TMP + '/logo-128.png')

/* ---- 合成 ---- */
const LOGO = TMP + '/logo-128.png'
const brandOverlay = `[1:v]scale=120:120[logo];[bg][logo]overlay=x=140:y=110:format=auto[ov]`

// 品牌卡（开场 3s / 收尾 4s）：底色 + logo overlay + drawtext 标题文本
function brandCard(outSeg, textfile, t) {
  run(['-y', '-f', 'lavfi', '-i', 'color=c=0xf5f4f1:s=1280x800:d=' + t,
       '-i', LOGO,
       '-filter_complex', brandOverlay + `;[ov]drawtext=fontfile=${FONT_NAME}:textfile=${textfile}:fontcolor=#26221d:fontsize=56:x=140:y=400:line_spacing=32[v]`,
       '-map', '[v]', '-r', '30',
       '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', outSeg])
}

brandCard(seg(0), openText, 3)
run(['-y', '-i', demoIn('input'), '-t', '9', '-vf', bottomBar(sub1),
     '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', '-an', seg(1)])
run(['-y', '-i', demoIn('process'), '-t', '9', '-vf', bottomBar(sub2),
     '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', '-an', seg(2)])
run(['-y', '-i', demoIn('output'), '-t', '9', '-vf', bottomBar(sub3),
     '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', '-an', seg(3)])
run(['-y', '-i', demoIn('loop'), '-t', '9', '-vf', bottomBar(sub4),
     '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', '-an', seg(4)])
brandCard(seg(5), endText, 4)

const listFile = TMP + '/concat.txt'
writeFileSync(listFile, [seg(0), seg(1), seg(2), seg(3), seg(4), seg(5)]
  .map((p) => 'file \'' + p.replaceAll('\\', '/') + '\'').join('\n'), 'utf-8')

run(['-y', '-f', 'concat', '-safe', '0', '-i', listFile,
     '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', OUT_MP4])

const size = statSync(OUT_MP4).size
console.log(`视频完成：${OUT_MP4}（${(size / 1024 / 1024).toFixed(1)} MB）`)
console.log('最后一步：人工看片验收（节奏/字幕/遮挡），通过后发朋友圈。')
