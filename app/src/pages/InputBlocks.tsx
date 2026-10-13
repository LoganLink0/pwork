import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useBlocks } from '../store/blocks'
import { fileToBlockContent } from '../engine/fileImport'

/**
 * 外部数据（2026-10-13 降级定位）：周报的数据源。手工添加 / CSV·JSON 导入 / 推送接口
 * 落地的数据块全部自动并入「周报导出」。调研任务的发现在 输出 → 调研分析 里管理，
 * 不在本页显示——侧边栏入口已撤，从周报导出页进出。
 */
export function InputBlocks() {
  const { blocks, load, save, remove } = useBlocks()
  const [editing, setEditing] = useState<{ id?: string; title: string; content: string; usage?: 'internal' | 'client' } | null>(null)
  const [importMsg, setImportMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void load()
  }, [load])

  const onFile = async (file: File) => {
    try {
      const text = await file.text()
      const r = fileToBlockContent(file.name, text)
      setEditing({ title: file.name.replace(/\.[^.]+$/, ''), content: r.content, usage: 'client' })
      setImportMsg(`${r.note}——确认内容后点"保存"`)
    } catch (e) {
      setImportMsg(`导入失败：${e instanceof Error ? e.message : '文件解析出错'}`)
    }
  }

  const visible = blocks.filter((b) => !b.profileId)

  return (
    <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
      <div className="page-head">
        <h1>外部数据</h1>
        <span className="sub">周报的数据源——这里的数据块自动并入「周报导出」</span>
      </div>

      <div className="notice" style={{ marginBottom: 'var(--sp-4)' }}>
        <b>这页管周报的"外部数据"</b>：手工添加、CSV/JSON 导入、推送接口落地的数据块都在这里维护，
        <Link to="/output/report">周报导出</Link>会自动把它们并进报告。调研任务的发现在
        <Link to="/output/research"> 输出 → 调研分析</Link> 里管理，不占这里的列表。
      </div>

      <div className="set-card">
        <h2>数据块</h2>
        <div className="desc">一行一条，"键: 值"形态渲染成周报里的指标行，其余为文字</div>
        <div className="set-body">
          {editing === null && visible.length === 0 && (
            <div className="notice">还没有数据块——点下方「＋ 新数据块」手工添加，或导入文件。</div>
          )}
          {visible.map((b) => (
            <div className="set-row" key={b.id} style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>
                  {b.title}
                  {b.usage === 'client' && (
                    <span className="val" style={{ marginLeft: 8, fontSize: 'var(--fs-xs)', color: 'var(--ok)' }}>给客户</span>
                  )}
                </div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', whiteSpace: 'pre-wrap' }}>{b.content}</div>
              </div>
              <button type="button" className="mini-btn" onClick={() => setEditing({ id: b.id, title: b.title, content: b.content, usage: b.usage })}>
                编辑
              </button>
              <button
                type="button"
                className="mini-btn"
                onClick={() => {
                  if (window.confirm(`删除数据块「${b.title}」？（软删除，备份中仍可找回）`)) void remove(b.id)
                }}
              >
                删除
              </button>
            </div>
          ))}
          {editing ? (
            <div className="set-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--sp-2)' }}>
              <input
                className="input"
                placeholder="数据块名称（如：销售周数据）"
                value={editing.title}
                aria-label="数据块名称"
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
              <textarea
                className="input"
                rows={5}
                placeholder={'一行一条，支持"键: 值"形态，例如：\n新增线索: 23\n成交金额: 86万\n也可以写普通文字行'}
                value={editing.content}
                aria-label="数据块内容"
                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              />
              <div className="set-row">
                <label>用途</label>
                <div className="radio">
                  <button type="button" className={(editing.usage ?? 'internal') === 'internal' ? 'on' : ''} onClick={() => setEditing({ ...editing, usage: 'internal' })}>自己用</button>
                  <button type="button" className={editing.usage === 'client' ? 'on' : ''} onClick={() => setEditing({ ...editing, usage: 'client' })}>给客户</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={!editing.title.trim()}
                  onClick={() => {
                    void save(editing).then(() => {
                      setEditing(null)
                      setImportMsg('')
                      void load()
                    })
                  }}
                >
                  保存
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setEditing(null)
                    setImportMsg('')
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className="set-row">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setEditing({ title: '', content: '', usage: 'client' })}
                data-testid="add-block"
              >
                ＋ 新数据块
              </button>
              <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()} data-testid="import-file">
                ⬆ 导入文件（CSV/JSON）
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.json,.txt,.tsv"
                style={{ display: 'none' }}
                aria-label="选择要导入的文件"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void onFile(f)
                  e.target.value = ''
                }}
              />
            </div>
          )}
          {importMsg && (
            <div className="set-row" role="status">
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{importMsg}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
