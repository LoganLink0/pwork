import { useEffect, useState } from 'react'
import { buildCallUrl, usedPlaceholders } from '../engine/toolTemplates'
import { useNotes } from '../../../store/notes'
import { toast } from '../../../engine/toast'
import { isDesktopApp } from '../../../engine/platform'
import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import type { ProcessTool } from '../content/processTools'

/**
 * 带上下文调用区（2.4）：engine='external' 且定义了 callUrl 模板的工具页出现。
 * 文本框预填最近一条速记正文（可改可清），点按钮经模板引擎生成地址后打开——
 * URL 协议白名单在引擎侧校验（http/https/obsidian://），不安全模板如实报错不静默。
 * 桌面版自定义协议（obsidian://）走 open_external_url 系统命令；网页版用 window.open。
 */
export function ExternalCallPanel({ tool }: { tool: ProcessTool }) {
  if (!tool.callUrl) return null
  return <PanelInner tool={tool} />
}

function PanelInner({ tool }: { tool: ProcessTool }) {
  const notes = useNotes((s) => s.notes)
  const [text, setText] = useState('')
  const [preFilled, setPreFilled] = useState(false)

  // 预填最近一条未删除速记的正文（只填一次，用户改动后不再覆盖）
  useEffect(() => {
    if (preFilled) return
    const latest = notes.find((n) => !n.deletedAt)
    if (latest) {
      setText(latest.body.slice(0, 2000))
      setPreFilled(true)
    }
  }, [notes, preFilled])

  const placeholders = usedPlaceholders(tool.callUrl!)
  const needsSelection = placeholders.includes('{selected}')

  const open = () => {
    const vars = { selected: text, title: text.split('\n')[0]?.slice(0, 60) }
    const url = buildCallUrl(tool.callUrl!, vars)
    if (!url) {
      toast('error', '这个调用地址不安全（协议不在白名单）——工具定义有误')
      return
    }
    if (isDesktopApp()) {
      void tauriInvoke('open_external_url', { url })
        .then(() => toast('ok', `${tool.callLabel ?? '已打开'}（系统确认后进入外部工具）`))
        .catch((e: unknown) => toast('error', `打开失败：${e instanceof Error ? e.message : String(e)}`))
    } else {
      window.open(url, '_blank', 'noopener')
      toast('ok', tool.callLabel ?? '已打开')
    }
  }

  return (
    <div className="set-card" style={{ marginTop: 'var(--sp-4)' }} data-testid="external-call">
      <div className="set-body">
        <div className="set-row">
          <label>{tool.callLabel ?? '带上文本打开'}</label>
          <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
            会带的文本：{needsSelection ? '下方输入框内容' : '无'}
          </span>
        </div>
        {needsSelection && (
          <textarea
            className="input"
            style={{ width: '100%', minHeight: 120, marginBottom: 'var(--sp-2)', resize: 'vertical' }}
            value={text}
            placeholder={'要带过去的文本（已预填最近一条速记，可改可清空）'}
            aria-label="调用文本"
            onChange={(e) => {
              setText(e.target.value)
              setPreFilled(true)
            }}
          />
        )}
        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <button type="button" className="btn-primary" data-testid="external-call-open" onClick={open}>
            {tool.callLabel ?? '带上文本打开'}
          </button>
          {text && (
            <button type="button" className="btn-ghost" onClick={() => setText('')}>
              清空文本
            </button>
          )}
        </div>
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', marginTop: 'var(--sp-2)', margin: 'var(--sp-2) 0 0' }}>
          ℹ {tool.note ?? '文本经编码传递给外部工具，只在你点击时打开；工作台不代你自动发送任何内容。'}
        </p>
      </div>
    </div>
  )
}
