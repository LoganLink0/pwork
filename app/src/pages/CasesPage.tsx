import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfiles } from '../store/profiles'
import { useBlocks } from '../store/blocks'
import type { Profile, ProfileStatus } from '../types/models'

const STATUS_LIST: ProfileStatus[] = ['进行中', '已交付', '已收款']

/** 案例库（案例模块）：客户 × 目标岗位为一个案例。单机自用版——协作模式留待二期。 */
export function CasesPage() {
  const { profiles, load: loadProfiles, save: saveProfile, remove: removeProfile } = useProfiles()
  const blocks = useBlocks((s) => s.blocks)
  const loadBlocks = useBlocks((s) => s.load)
  const [name, setName] = useState('')
  const [clientName, setClientName] = useState('')
  const [targetRole, setTargetRole] = useState('')
  const [kind, setKind] = useState('简历辅导')

  useEffect(() => {
    void loadProfiles()
    void loadBlocks()
  }, [loadProfiles, loadBlocks])

  const create = async () => {
    if (!name.trim()) return
    await saveProfile({
      name: name.trim(),
      kind,
      clientName: kind === '简历辅导' ? clientName.trim() || undefined : undefined,
      targetRole: targetRole.trim() || undefined,
    })
    setName('')
    setClientName('')
    setTargetRole('')
  }

  const active = profiles.filter((p) => (p.status ?? '进行中') === '进行中')
  const closed = profiles.filter((p) => (p.status ?? '进行中') !== '进行中')
  const blockCount = (id: string) => blocks.filter((b) => b.profileId === id).length

  const renderRow = (p: Profile) => (
    <div className="set-row" key={p.id} style={{ alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link to={`/cases/${p.id}`} style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--ink)' }}>
          {p.name}
        </Link>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
          {p.clientName ? `客户 ${p.clientName} · ` : ''}
          {p.targetRole ? `目标岗位 ${p.targetRole} · ` : ''}
          {blockCount(p.id)} 份材料
        </div>
      </div>
      <select
        className="lane-select"
        value={p.status ?? '进行中'}
        aria-label={`案例状态：${p.name}`}
        onChange={(e) => void saveProfile({ id: p.id, name: p.name, kind: p.kind, note: p.note, status: e.target.value as ProfileStatus })}
      >
        {STATUS_LIST.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <button
        type="button"
        className="mini-btn"
        data-testid={`case-delete-${p.id}`}
        onClick={() => {
          if (window.confirm(`删除案例「${p.name}」？\n外部数据里挂在它下面的数据块会回到"未归类"；案例文件随案例一起删除（软删除，备份中可找回）。`)) void removeProfile(p.id)
        }}
      >
        删除
      </button>
    </div>
  )

  return (
    <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
      <div className="page-head">
        <h1>案例库</h1>
        <span className="sub">案例模块 · 简历辅导与售前的服务案例——客户 × 目标岗位为一个案例</span>
      </div>

      <div className="set-card">
        <h2>新建案例</h2>
        <div className="set-body">
          <div className="set-row">
            <label>案例名</label>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="如：张三 · XX银行信贷岗（一个客户 × 一个目标岗位）"
              value={name}
              aria-label="案例名称"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="set-row">
            <label>类型</label>
            <div className="radio">
              <button type="button" className={kind === '简历辅导' ? 'on' : ''} onClick={() => setKind('简历辅导')}>简历辅导</button>
              <button type="button" className={kind === '售前调研' ? 'on' : ''} onClick={() => setKind('售前调研')}>售前调研</button>
            </div>
          </div>
          {kind === '简历辅导' && (
            <div className="set-row">
              <label>客户姓名</label>
              <input
                className="input"
                style={{ maxWidth: 200 }}
                placeholder="客户姓名（可选）"
                value={clientName}
                aria-label="客户姓名"
                onChange={(e) => setClientName(e.target.value)}
              />
              <label style={{ marginLeft: 'var(--sp-3)' }}>目标岗位</label>
              <input
                className="input"
                style={{ maxWidth: 200 }}
                placeholder="目标岗位（可选）"
                value={targetRole}
                aria-label="目标岗位"
                onChange={(e) => setTargetRole(e.target.value)}
              />
            </div>
          )}
          <div className="set-row">
            <button type="button" className="btn-primary" disabled={!name.trim()} onClick={() => void create()} data-testid="case-create">
              ＋ 创建案例
            </button>
            <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>创建后进案例工作台：传文件 → 解码 JD → 诊断 → 出建议</span>
          </div>
        </div>
      </div>

      {profiles.length === 0 ? (
        <div className="empty">
          <div className="e-ico" aria-hidden>📋</div>
          <p>还没有案例。上面创建第一个——创建后进入案例工作台。</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="set-card">
              <h2>进行中（{active.length}）</h2>
              <div className="set-body">{active.map(renderRow)}</div>
            </div>
          )}
          {closed.length > 0 && (
            <div className="set-card">
              <h2>已结束（{closed.length}）</h2>
              <div className="set-body">{closed.map(renderRow)}</div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
