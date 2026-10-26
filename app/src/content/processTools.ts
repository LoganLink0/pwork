/**
 * 处理模块工具注册表（IT Tools 模式）：四模态分类，按用户定义的
 * "信息易理解程度"排序——文字 → 音频 → 图片 → 视频。
 * 每个工具标注引擎：local-*（零成本离线）与 byok（需多模态 Key，立占位待点亮）。
 */

export type ToolCategory = 'text' | 'audio' | 'image' | 'video'
export type ToolEngine =
  | 'local-webspeech-tts'
  | 'local-webspeech-asr'
  | 'local-tesseract'
  | 'local-ffmpeg'
  | 'local-canvas'
  | 'external'
  | 'byok'
  | 'app'
export type ToolStatus = 'ready' | 'byok-pending'

export interface ProcessTool {
  id: string
  category: ToolCategory
  name: string
  desc: string
  engine: ToolEngine
  status: ToolStatus
  /** byok-pending 工具的点亮条件说明 */
  requires?: string
  /** 限制与提示（如实告知） */
  note?: string
  /** engine='external' 时必填：外部工具地址（新标签打开） */
  externalUrl?: string
  /** engine='app' 时必填：应用内路由（独立应用的入口页） */
  route?: string
}

export const CATEGORY_ORDER: ToolCategory[] = ['text', 'audio', 'image', 'video']

export const CATEGORY_META: Record<ToolCategory, { name: string; icon: string; mark: string; desc: string }> = {
  text: { name: '文字', icon: 'fileText', mark: 'var(--cat-insight)', desc: '最抽象，最轻；一切加工的起点' },
  audio: { name: '音频', icon: 'headphones', mark: 'var(--cat-need)', desc: '随听随记，解放双眼' },
  image: { name: '图片', icon: 'image', mark: 'var(--cat-good)', desc: '直观可见，便于分享' },
  video: { name: '视频', icon: 'film', mark: 'var(--cat-action)', desc: '信息最丰富，也最重' },
}

export const ENGINE_LABEL: Record<ToolEngine, string> = {
  'local-webspeech-tts': '本地 · 浏览器语音',
  'local-webspeech-asr': '本地 · 浏览器识别',
  'local-tesseract': '本地 · Tesseract',
  'local-ffmpeg': '本地 · FFmpeg',
  'local-canvas': '本地 · Canvas',
  external: '外部工具 ↗',
  byok: 'BYOK 云端',
  app: '独立应用',
}

export const PROCESS_TOOLS: ProcessTool[] = [
  // ── 文字（产出/输入均为文字） ──
  {
    id: 'tts',
    category: 'text',
    name: '文字转语音',
    desc: '把一段文字朗读出来，可调语速与音色；浏览器本地合成，离线可用',
    engine: 'local-webspeech-tts',
    status: 'ready',
    note: '使用浏览器内置语音合成，音色取决于系统；长文适合分段朗读',
  },
  {
    id: 'card',
    category: 'text',
    name: '文字生成卡片图',
    desc: '把文字渲染成一张带 PWORK 风格的分享卡片（PNG），适合发群或存档',
    engine: 'local-canvas',
    status: 'ready',
  },
  {
    id: 'text-to-image',
    category: 'text',
    name: '文字生成图片',
    desc: '输入描述生成一幅图像（AI 生图）',
    engine: 'byok',
    status: 'byok-pending',
    requires: '多模态服务商 Key（智谱 / 阿里百炼 / OpenAI 兼容生图）',
  },
  {
    id: 'text-to-video',
    category: 'text',
    name: '文字生成视频',
    desc: '输入脚本或描述生成短视频（AI 生成）',
    engine: 'byok',
    status: 'byok-pending',
    requires: '视频生成服务 Key（可灵 / 即梦 / Runway 等）',
  },
  // ── 音频 ──
  {
    id: 'asr',
    category: 'audio',
    name: '录音转文字',
    desc: '对着麦克风说话，实时转成文字；转完可一键存为速记',
    engine: 'local-webspeech-asr',
    status: 'ready',
    note: '使用浏览器内置识别（Chrome/Edge 支持最好；识别在云端引擎完成但免费无 Key）',
  },
  {
    id: 'audio-convert',
    category: 'audio',
    name: '音频格式转换 / 压缩',
    desc: 'mp3 / wav 等音频互转、压缩体积，本地处理不上传',
    engine: 'local-ffmpeg',
    status: 'ready',
    note: '建议单文件 ≤100MB；引擎已内置在应用里，全程离线可用',
  },
  {
    id: 'asr-high',
    category: 'audio',
    name: '高质量语音识别',
    desc: '长音频/嘈杂环境的高精度转写（Whisper 类模型）',
    engine: 'byok',
    status: 'byok-pending',
    requires: '语音识别服务 Key（OpenAI Whisper 兼容 / 阿里百炼）',
  },
  {
    id: 'ext-ttsmaker',
    category: 'audio',
    name: 'TTSMaker 在线配音',
    desc: '更多音色与情感的在线文字转语音，免费额度可用（外部工具，跳转官网）',
    engine: 'external',
    status: 'ready',
    externalUrl: 'https://ttsmaker.com/zh-cn',
    note: '外部工具，与本工作台无数据互通',
  },
  {
    id: 'ext-capcut',
    category: 'video',
    name: '剪映网页版',
    desc: '专业级视频剪辑与字幕，含文字成片模板（外部工具，跳转官网）',
    engine: 'external',
    status: 'ready',
    externalUrl: 'https://www.capcut.cn/',
    note: '外部工具；重度视频处理推荐用它，本工作台的 wasm 转换适合轻量场景',
  },
  // ── 图片 ──
  {
    id: 'ocr',
    category: 'image',
    name: '图片识别文字',
    desc: '从截图、照片里提取文字（中英文），识别结果可存为速记',
    engine: 'local-tesseract',
    status: 'ready',
    note: '引擎与中文语言包已内置，全程离线可用；印刷体效果好，手写体较弱',
  },
  {
    id: 'image-process',
    category: 'image',
    name: '图片压缩 / 缩放 / 格式转换',
    desc: '调整尺寸与质量、转 JPEG/WebP/PNG，全部本地 Canvas 处理',
    engine: 'local-canvas',
    status: 'ready',
  },
  {
    id: 'ext-iloveimg',
    category: 'image',
    name: 'iLoveIMG 图片全家桶',
    desc: '批量压缩/裁剪/转换/去背景，功能覆盖更全（外部工具，跳转官网）',
    engine: 'external',
    status: 'ready',
    externalUrl: 'https://www.iloveimg.com/zh-cn',
    note: '外部工具，与本工作台无数据互通',
  },
  // ── 视频 ──
  {
    id: 'video-convert',
    category: 'video',
    name: '视频转换 / 压缩 / 抽音频 / 转 GIF',
    desc: 'mp4/webm 互转、压缩体积、提取音轨、截取片段转 GIF，本地处理不上传',
    engine: 'local-ffmpeg',
    status: 'ready',
    note: 'wasm 软编码，适合短视频（建议 ≤5 分钟或 ≤100MB）；长视频建议用剪映等本地工具',
  },
  {
    id: 'ext-removebg',
    category: 'image',
    name: 'Remove.bg 一键抠图',
    desc: '自动去除图片背景，效果优于本地方案（外部工具，跳转官网）',
    engine: 'external',
    status: 'ready',
    externalUrl: 'https://www.remove.bg/zh',
    note: '外部工具，免费额度有限',
  },
]

export function toolsByCategory(cat: ToolCategory): ProcessTool[] {
  return PROCESS_TOOLS.filter((t) => t.category === cat)
}

export function getTool(id: string): ProcessTool | undefined {
  return PROCESS_TOOLS.find((t) => t.id === id)
}

export function toolRoute(id: string): string {
  return getTool(id)?.route ?? `/process/t/${id}`
}
