import { useEffect, useRef, useState } from 'react'
import { useBlocks } from '../store/blocks'
import { useProfiles } from '../store/profiles'
import { fileToBlockContent } from '../engine/fileImport'

/**
 * 外部数据（输入第三通道）：速记 = 我想到的，信源 = 网上来的，外部数据 = 我从别的系统带来的。
 * 数据按「调研对象」归组（一家公司、一个客户……），分析产出（报告撰写）从对象取材料——
 * 模块归属规则：数据在哪里管理就属于哪个模块；输出只按引用取，不另存一份。
 */
export function InputBlocks() {
  const { blocks, load: loadBlocks, save: saveBlock, remove: removeBlock } = useBlocks()
  const { profiles, load: loadProfiles, save: saveProfile, remove: removeProfile } = useProfiles()
  const [editing, setEditing] = useState<{ id?: string; title: string; content: string; profileId?: string } | null>(null)
  const [importMsg, setImportMsg] = useState('')
  const [filter, setFilter] = useState<'all' | 'none' | string>('all')
  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileKind, setNewProfileKind] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadBlocks()
    void loadProfiles()
  }, [loadBlocks, loadProfiles])

  const onFile = async (file: File) => {
    try {
      const text = await file.text()
      const r = fileToBlockContent(file.name, text)
      setEditing({ title: file.name.replace(/\.[^.]+$/, ''), content: r.content, profileId: filter !== 'all' && filter !== 'none' ? filter : undefined })
      setImportMsg(`${r.note}——确认内容后点"保存"`)
    } catch (e) {
      setImportMsg(`导入失败：${e instanceof Error ? e.message : '文件解析出错'}`)
    }
  }

  const visible = blocks.filter((b) => {
    if (filter === 'all') return true
    if (filter === 'none') return !b.profileId
    return b.profileId === filter
  })

  const addProfile = async () => {
    if (!newProfileName.trim()) return
    const p = await saveProfile({ name: newProfileName, kind: newProfileKind })
    setNewProfileName('')
    setNewProfileKind('')
    setFilter(p.id)
  }

  return (
    <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
      <div className="page-head">
        <h1>外部数据</h1>
        <span className="sub">输入 · 第三通道——从别的系统带来的数据按调研对象归组，报告撰写从这里取材料</span>
      </div>

      <div className="set-card">
        <h2>调研对象</h2>
        <div className="desc">一家公司、一个客户……材料挂在对象下面，做分析时按对象一键带出。标签随意填（客户 / 目标公司 / 供应商）。</div>
        <div className="set-body">
          <div className="set-row">
            <input
              className="input"
              style={{ maxWidth: 220 }}
              placeholder="对象名称（如：XX 银行）"
              value={newProfileName}
              aria-label="新调研对象名称"
              onChange={(e) => setNewProfileName(e.target.value)}
            />
            <input
              className="input"
              style={{ maxWidth: 140 }}
              placeholder="标签（可选）"
              value={newProfileKind}
              aria-label="新调研对象标签"
              onChange={(e) => setNewProfileKind(e.target.value)}
            />
            <button type="button" className="btn-ghost" disabled={!newProfileName.trim()} onClick={() => void addProfile()}>
              ＋ 新建对象
            </button>
          </div>
          {profiles.map((p) => {
            const count = blocks.filter((b) => b.profileId === p.id).length
            return (
              <div className="set-row" key={p.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{p.name}</span>
                  {p.kind && <span className="val" style={{ marginLeft: 8, fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{p.kind}</span>}
                  <span className="val" style={{ marginLeft: 8, fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{count} 份材料</span>
                </div>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => {
                    if (window.confirm(`删除对象「${p.name}」？它名下的材料会回到"未归类"，不会丢失。`)) void removeProfile(p.id)
                  }}
                >
                  删除
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="set-card">
        <h2>材料（数据块）</h2>
        <div className="desc">
          一行一条，"键: 值"形态渲染成指标行，其余为文字。保存后自动并入周报、月报与 PPT；归属到调研对象后，报告撰写可按对象一键带入。
        </div>
        <div className="set-body">
          <div className="set-row" style={{ flexWrap: 'wrap' }}>
            <button type="button" className={`chip${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>
              全部 {blocks.length}
            </button>
            <button type="button" className={`chip${filter === 'none' ? ' on' : ''}`} onClick={() => setFilter('none')}>
              未归类 {blocks.filter((b) => !b.profileId).length}
            </button>
            {profiles.map((p) => (
              <button key={p.id} type="button" className={`chip${filter === p.id ? ' on' : ''}`} onClick={() => setFilter(p.id)}>
                {p.name} {blocks.filter((b) => b.profileId === p.id).length}
              </button>
            ))}
          </div>
          {editing === null && visible.length === 0 && filter !== 'all' && filter !== 'none' && (
            <div className="notice">该对象下还没有材料——在下方添加或导入，会自动归属到这个对象。</div>
          )}
          {visible.map((b) => (
            <div className="set-row" key={b.id} style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{b.title}</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', whiteSpace: 'pre-wrap' }}>{b.content}</div>
              </div>
              <button type="button" className="mini-btn" onClick={() => setEditing({ id: b.id, title: b.title, content: b.content, profileId: b.profileId })}>
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
                placeholder="材料名称（如：销售周数据）"
                value={editing.title}
                aria-label="材料名称"
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
              <select
                className="lane-select"
                value={editing.profileId ?? ''}
                aria-label="材料归属对象"
                onChange={(e) => setEditing({ ...editing, profileId: e.target.value || undefined })}
              >
                <option value="">未归类</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <textarea
                className="input"
                rows={5}
                placeholder={'一行一条，支持"键: 值"形态，例如：\n新增线索: 23\n成交金额: 86万\n也可以写普通文字行'}
                value={editing.content}
                aria-label="材料内容"
                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              />
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={!editing.title.trim()}
                  onClick={() => {
                    void saveBlock(editing).then(() => {
                      setEditing(null)
                      setImportMsg('')
                      void loadBlocks()
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
                onClick={() =>
                  setEditing({
                    title: '',
                    content: '',
                    profileId: filter !== 'all' && filter !== 'none' ? filter : undefined,
                  })
                }
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
              报告撰写：按调研对象一键带入材料，生成分析文档
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
