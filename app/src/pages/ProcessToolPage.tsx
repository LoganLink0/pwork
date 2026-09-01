import { Link, useParams } from 'react-router-dom'
import { CATEGORY_META, ENGINE_LABEL, getTool } from '../content/processTools'
import { TtsTool } from '../components/process/TtsTool'
import { AsrTool } from '../components/process/AsrTool'
import { OcrTool } from '../components/process/OcrTool'
import { CardTool } from '../components/process/CardTool'
import { ImageProcessTool } from '../components/process/ImageProcessTool'
import { ConvertTool, AUDIO_PRESET, VIDEO_PRESET } from '../components/process/ConvertTool'

function ToolBody({ id }: { id: string }) {
  switch (id) {
    case 'tts': return <TtsTool />
    case 'asr': return <AsrTool />
    case 'ocr': return <OcrTool />
    case 'card': return <CardTool />
    case 'image-process': return <ImageProcessTool />
    case 'audio-convert': return <ConvertTool preset={AUDIO_PRESET} kindLabel="音频文件" />
    case 'video-convert': return <ConvertTool preset={VIDEO_PRESET} kindLabel="视频文件" />
    default: return null
  }
}

/** 处理工具页（/process/t/:id）：按注册表分发 */
export function ProcessToolPage() {
  const { toolId = '' } = useParams()
  const tool = getTool(toolId)

  if (!tool) {
    return (
      <div className="empty">
        <div className="e-ico" aria-hidden>∅</div>
        <p>没有这个工具。</p>
        <Link to="/process" className="btn-ghost">回处理模块 →</Link>
      </div>
    )
  }

  const cat = CATEGORY_META[tool.category]

  if (tool.status === 'byok-pending') {
    return (
      <section>
        <div className="page-head">
          <h1>{tool.name}</h1>
          <span className="sub">{cat.name}类 · BYOK 云引擎</span>
        </div>
        <div className="placeholder" style={{ margin: 'var(--sp-6) auto' }}>
          <div className="p-ico" aria-hidden>🔑</div>
          <h2>待点亮：需要对应的 AI 服务 Key</h2>
          <p>{tool.desc}</p>
          <div className="will">
            <h3>点亮条件</h3>
            <p>{tool.requires}</p>
          </div>
          <div className="will">
            <h3>怎么点亮</h3>
            <p>拿到对应服务商的 Key 后，在 设置 → AI · BYOK 增加该服务商接入（或直接告诉我，按工具逐个实现）。</p>
          </div>
          <Link to="/process" className="btn-ghost">← 回工具箱</Link>
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="page-head">
        <h1>{tool.name}</h1>
        <span className="sub">{cat.name}类 · {ENGINE_LABEL[tool.engine]}</span>
        <div className="right">
          <Link to="/process" className="btn-ghost">← 工具箱</Link>
        </div>
      </div>
      <div className="set-card">
        <div className="set-body">
          <ToolBody id={tool.id} />
        </div>
      </div>
      {tool.note && (
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', marginTop: 'var(--sp-3)' }}>
          ℹ {tool.note}
        </p>
      )}
    </section>
  )
}
