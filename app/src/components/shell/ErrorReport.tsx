import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { recordError, useErrorBar } from '../../engine/errorLog'

/**
 * 错误暴露的两个可见层（2026-10 用户要求：出错立即崩溃给他看，不许静默）：
 * - ErrorBoundary：页面渲染崩溃 → 整屏崩溃页（消息 + 堆栈 + 去错误日志/刷新），
 *   不白屏——白屏让人读不到"哪里出了什么问题"；
 * - ErrorBar：任何 recordError 触发的全局红色错误条，点击可跳设置页错误日志。
 */

interface BoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void recordError({
      where: '页面渲染崩溃',
      kind: 'render',
      message: error.message,
      stack: error.stack,
      detail: info.componentStack ?? undefined,
    })
  }

  render() {
    if (!this.state.error) return this.props.children
    const e = this.state.error
    return (
      <div className="crash-screen" role="alert">
        <div className="crash-box">
          <h1>页面出错了</h1>
          <p className="crash-msg">{e.message || '(没有错误消息)'}</p>
          <p className="crash-sub">错误已记录。下面是技术细节，排查用得上；日常使用点「刷新页面」即可恢复。</p>
          {e.stack && <pre className="crash-stack">{e.stack}</pre>}
          <div className="crash-actions">
            <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
              刷新页面
            </button>
            <a href="#/settings?tab=errors" className="btn-ghost">去设置 · 查看错误日志</a>
          </div>
        </div>
      </div>
    )
  }
}

export function ErrorBar() {
  const entry = useErrorBar((s) => s.entry)
  const dismiss = useErrorBar((s) => s.dismiss)
  if (!entry) return null
  return (
    <div className="error-bar" role="alert">
      <span className="error-bar-dot" aria-hidden />
      <span className="error-bar-text">
        <b>{entry.where}</b>：{entry.message}
      </span>
      <Link to="/settings?tab=errors" className="error-bar-link" onClick={dismiss}>
        查看日志
      </Link>
      <button type="button" className="error-bar-close" aria-label="关闭错误提示" onClick={dismiss}>
        ✕
      </button>
    </div>
  )
}
