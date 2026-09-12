import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listCases, saveCase, softDeleteCase, CASE_STATUS_LIST } from '../db/repo'
import type { Case, CaseStatus } from '../types'

/** 案例库：新建（案例名/类型/客户/目标岗位）+ 进行中/已结束分组 + 状态切换 + 删除 */
export function CasesList() {
  const [cases, setCases] = useState<Case[]>([])
  const [name, setName] = useState('')
  const [clientName, setClientName] = useState('')
  const [targetRole, setTargetRole] = useState('')
  const [kind, setKind] = useState('简历辅导')
  const [loadErr, setLoadErr] = useState('')

  const refresh = async () => {
    try {
      setCases(await listCases())
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const create = async () => {
    if (!name.trim()) return
    await saveCase({ name: name.trim(), kind, clientName: kind === '简历辅导' ? clientName.trim() || undefined : undefined, targetRole: targetRole.trim() || undefined })
    setName('')
    setClientName('')
    setTargetRole('')
    await refresh()
  }

  const setStatus = async (c: Case, status: CaseStatus) => {
    await saveCase({ id: c.id, name: c.name, kind: c.kind, clientName: c.clientName, targetRole: c.targetRole, status })
    await refresh()
  }

  const remove = async (c: Case) => {
    if (!window.confirm(`删除案例「${c.name}」？名下的材料与过程文档一并删除（软删除，备份中可找回）。`)) return
    await softDeleteCase(c.id)
    await refresh()
  }

  const active = cases.filter((c) => (c.status ?? '进行中') === '进行中')
  const closed = cases.filter((c) => (c.status ?? '进行中') !== '进行中')

  const renderRow = (c: Case) => (
    <div className="case-row" key={c.id}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link to={`/cases/${c.id}/materials`} className="name">{c.name}</Link>
        <div className="meta">
          {c.clientName ? `客户 ${c.clientName} · ` : ''}
          {c.targetRole ? `目标岗位 ${c.targetRole} · ` : ''}
          {c.kind}
        </div>
      </div>
      <select className="status-select" value={c.status ?? '进行中'} aria-label={`案例状态：${c.name}`} onChange={(e) => void setStatus(c, e.target.value as CaseStatus)}>
        {CASE_STATUS_LIST.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <button type="button" className="mini-btn" onClick={() => void remove(c)}>删除</button>
    </div>
  )

  return (
    <main className="app-main">
      <div className="page-head">
        <h1>案例库</h1>
        <span className="sub">一个客户 × 一个目标岗位 = 一个案例，从自检包走到交付</span>
      </div>

      <div className="card">
        <h2>新建案例</h2>
        <div className="col">
          <div className="row">
            <label>案例名</label>
            <input className="input" style={{ flex: 1, minWidth: 220 }} placeholder="如：张三 · XX银行信贷岗" value={name} aria-label="案例名称" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="row">
            <label>类型</label>
            <div className="radio">
              <button type="button" className={kind === '简历辅导' ? 'on' : ''} onClick={() => setKind('简历辅导')}>简历辅导</button>
              <button type="button" className={kind === '售前调研' ? 'on' : ''} onClick={() => setKind('售前调研')}>售前调研</button>
            </div>
          </div>
          {kind === '简历辅导' && (
            <div className="row">
              <label>客户姓名</label>
              <input className="input" style={{ width: 160 }} placeholder="可选" value={clientName} aria-label="客户姓名" onChange={(e) => setClientName(e.target.value)} />
              <label>目标岗位</label>
              <input className="input" style={{ width: 160 }} placeholder="可选" value={targetRole} aria-label="目标岗位" onChange={(e) => setTargetRole(e.target.value)} />
            </div>
          )}
          <div className="row">
            <button type="button" className="btn primary" disabled={!name.trim()} onClick={() => void create()}>＋ 创建案例</button>
            <span className="hint">创建后进入案例工作台：材料 → 解码 → 追问 → 诊断 → 改写 → 简历稿 → 交付</span>
          </div>
        </div>
      </div>

      {loadErr && <div className="notice err-text">{loadErr}</div>}
      {cases.length === 0 ? (
        <div className="notice">还没有案例。上面创建第一个。</div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="card">
              <h2>进行中（{active.length}）</h2>
              {active.map(renderRow)}
            </div>
          )}
          {closed.length > 0 && (
            <div className="card">
              <h2>已结束（{closed.length}）</h2>
              {closed.map(renderRow)}
            </div>
          )}
        </>
      )}
    </main>
  )
}
