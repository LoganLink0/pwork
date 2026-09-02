import { useEffect, useState } from 'react'
import { useBlocks } from '../store/blocks'

/**
 * 外部数据（输入第三通道）：速记 = 我想到的，信源 = 网上来的，外部数据 = 我从别的系统带来的。
 * 数据在这里管理（模块归属规则：数据在哪里管理就属于哪个模块），保存后自动并入报告/朗读/PPT——输出只按引用取，不另存一份。
 */
export function InputBlocks() {
  const { blocks, load: loadBlocks, save: saveBlock, remove: removeBlock } = useBlocks()
  const [editing, setEditing] = useState<{ id?: string; title: string; content: string } | null>(null)

  useEffect(() => {
    void loadBlocks()
  }, [loadBlocks])

  return (
    <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
      <div className="page-head">
        <h1>外部数据</h1>
        <span className="sub">输入 · 第三通道——从别的系统带来的数据在这里进管线，报告/朗读/PPT 自动引用</span>
      </div>

      <div className="set-card">
        <h2>数据块</h2>
        <div className="desc">
          一行一条，"键: 值"形态渲染成指标行，其余为文字。例如每周从 CRM/ERP/表格里抄的几个数——保存后自动并入周报、月报与 PPT，无需在输出侧重复录入
        </div>
        <div className="set-body">
          {blocks.length === 0 && !editing && (
            <div className="notice">还没有数据块。粘一段你每周要汇报的数据进来试试，报告会多出一个"外部数据"章节。</div>
          )}
          {blocks.map((b) => (
            <div className="set-row" key={b.id} style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{b.title}</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', whiteSpace: 'pre-wrap' }}>{b.content}</div>
              </div>
              <button
                type="button"
                className="mini-btn"
                onClick={() => setEditing({ id: b.id, title: b.title, content: b.content })}
              >
                编辑
              </button>
              <button
                type="button"
                className="mini-btn"
                onClick={() => {
                  if (window.confirm(`删除数据块「${b.title}」？（软删除，备份中仍可找回）`)) void removeBlock(b.id)
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
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={!editing.title.trim()}
                  onClick={() => {
                    void saveBlock(editing).then(() => setEditing(null))
                  }}
                >
                  保存
                </button>
                <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className="set-row">
              <button type="button" className="btn-ghost" onClick={() => setEditing({ title: '', content: '' })} data-testid="add-block">
                ＋ 新数据块
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="set-card">
        <h2>这些数据会去哪里</h2>
        <div className="set-body">
          <div className="set-row">
            <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-sm)' }}>
              周报 / 月报：新增"外部数据"章节（<code>output/report</code> 可预览下载）
            </span>
          </div>
          <div className="set-row">
            <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-sm)' }}>
              PPT 导出：每个数据块一页
            </span>
          </div>
          <div className="set-row">
            <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-sm)' }}>
              后续：文件导入（CSV/JSON）与开放推送接口也将落在这一页所属的输入模块
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
