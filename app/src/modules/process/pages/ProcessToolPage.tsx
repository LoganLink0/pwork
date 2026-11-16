import { Link, useParams } from 'react-router-dom'
import { Icon } from '../../../components/shell/icons'
import { CATEGORY_META, ENGINE_LABEL, getTool, PROCESS_TOOLS, toolRoute } from '../content/processTools'
import { TtsTool } from '../components/TtsTool'
import { AsrTool } from '../components/AsrTool'
import { CardTool } from '../components/CardTool'
import { ImageProcessTool } from '../components/ImageProcessTool'
import { CaptureTool } from '../components/CaptureTool'
import { ExternalCallPanel } from '../components/ExternalCallPanel'

function ToolBody({ id }: { id: string }) {
  switch (id) {
    case 'tts': return <TtsTool />
    case 'asr': return <AsrTool />
    case 'card': return <CardTool />
    case 'image-process': return <ImageProcessTool />
    case 'video-capture': return <CaptureTool />
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
          <span className="sub">{cat.name}类 · 自带 Key 云引擎</span>
        </div>
        <div className="placeholder" style={{ margin: 'var(--sp-6) auto' }}>
          <div className="p-ico" aria-hidden><Icon name="key" size={32} /></div>
          <h2>待点亮：需要对应的 AI 服务 Key</h2>
          <p>{tool.desc}</p>
          <div className="will">
            <h3>点亮条件</h3>
            <p>{tool.requires}</p>
          </div>
          <div className="will">
            <h3>怎么点亮</h3>
            <p>拿到对应服务商的 Key 后，到 设置 → AI 设置 配置接入。</p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
            <Link to="/settings" className="btn-primary">去 AI 设置 →</Link>
            <Link to="/process" className="btn-ghost">← 回工具箱</Link>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="content-wide">
      <div className="page-head">
        <h1>{tool.name}</h1>
        <span className="sub">{cat.name}类 · {ENGINE_LABEL[tool.engine]}</span>
        <div className="right">
          <Link to="/process" className="btn-ghost">← 工具箱</Link>
        </div>
      </div>

      {/* 宽幅双栏（第二批 C 形态）：左工具表单（行宽不变）+ 右栏说明与同类直达；窄屏右栏隐藏 */}
      <div className="wide-grid">
        <div className="main-col" style={{ minWidth: 0 }}>
          {tool.engine !== 'external' && (
            <div className="set-card">
              <div className="set-body">
                <ToolBody id={tool.id} />
              </div>
            </div>
          )}
          <ExternalCallPanel tool={tool} />
          {!tool.callUrl && (
            <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-4)' }}>
              {tool.externalUrl && (
                <a href={tool.externalUrl} target="_blank" rel="noreferrer noopener" className="btn-primary">打开 {tool.name} 官网 ↗</a>
              )}
              <Link to="/process" className="btn-ghost">← 回工具箱</Link>
            </div>
          )}
          {tool.note && !tool.callUrl && (
            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', marginTop: 'var(--sp-3)' }}>
              ℹ {tool.note}
            </p>
          )}
        </div>

        <aside className="wide-aside" aria-label="工具说明">
          <div className="aside-card">
            <h3>这个工具做什么</h3>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-soft)', lineHeight: 1.8 }}>{tool.desc}</div>
            {tool.requires && (
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', marginTop: 'var(--sp-2)', lineHeight: 1.8 }}>
                前提：{tool.requires}
              </div>
            )}
          </div>
          <div className="aside-card">
            <h3>同类工具</h3>
            {PROCESS_TOOLS.filter((t) => t.category === tool.category && t.id !== tool.id).map((t) => (
              <div className="kv" key={t.id}><span>{t.name}</span><Link to={toolRoute(t.id)} style={{ fontSize: 'var(--fs-xs)', color: 'var(--accent-text)' }}>直达 →</Link></div>
            ))}
            <div style={{ marginTop: 'var(--sp-1)' }}>
              <Link to="/process" style={{ fontSize: 'var(--fs-xs)', color: 'var(--accent-text)' }}>← 回工具箱看全部</Link>
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}
