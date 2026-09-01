import { useState } from 'react'
import { useCollect } from '../store/collect'
import { DOMAINS, TIER_LABEL, TIER_WEIGHT } from '../content/collect'
import type { SourceInput } from '../db/collect'
import { downloadFile } from '../db/repo'
import { exportSourcesJson } from '../db/collect'
import { fmtLocal } from '../engine/datetime'
import type { Source } from '../types/models'

function tierCls(tier: number): string {
  return tier === 1 ? 'tier-1' : tier === 1.5 ? 'tier-15' : 'tier-2'
}

function HealthCell({ s }: { s: Source }) {
  const stopped = !s.active && s.health.failStreak >= 3
  const failing = s.health.failStreak > 0 && s.active
  return (
    <span title={s.health.lastError ? `最近错误：${s.health.lastError}` : s.health.lastOkAt ? `上次成功 ${fmtLocal(s.health.lastOkAt)}` : '还没抓取过'}>
      <span className={`health-dot ${stopped ? 'health-stopped' : failing ? 'health-fail' : 'health-ok'}`} />
      {stopped ? '已停用' : failing ? `连败×${s.health.failStreak}` : '正常'}
    </span>
  )
}

const EMPTY_FORM: SourceInput = { name: '', url: '', domain: 'ai', tier: 1.5 }

/** 信源管理页（PRD §4.4）：tier 徽章 / health 点 / JSON 导入导出 / 自动停用告警 */
export function Sources() {
  const { sources, items7d, addSource, editSource, toggleActive, removeSource, importSample, importJson, fetch: fetchState } = useCollect()
  const [form, setForm] = useState<SourceInput | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const autoStopped = fetchState.summary?.results.filter((r) => r.autoStopped) ?? []
  const inactiveFail = sources.filter((s) => !s.active && s.health.failStreak >= 3)

  const submit = async () => {
    if (!form || !form.name.trim() || !form.url.trim()) return
    if (editId) {
      await editSource(editId, form)
      setEditId(null)
    } else {
      await addSource(form)
    }
    setForm(null)
    setMsg('已保存')
  }

  const doExport = async () => {
    downloadFile('pwork-sources.json', await exportSourcesJson(), 'application/json')
  }

  const doImport = async (file: File) => {
    try {
      const r = await importJson(await file.text())
      setMsg(`导入 ${r.imported} 个源，跳过 ${r.skipped} 个（缺字段或 URL 重复）`)
    } catch {
      setMsg('导入失败：不是合法的 JSON 数组')
    }
  }

  return (
    <section>
      <div className="page-head">
        <h1>信源</h1>
        <span className="sub">{sources.filter((s) => s.active).length} 个活跃 / 共 {sources.length} · C1 手动抓取，无定时</span>
        <div className="right">
          <button type="button" className="btn-ghost" onClick={() => void doExport()}>⬇ 导出 JSON</button>
          <label className="btn-ghost" style={{ cursor: 'pointer' }}>
            ⬆ 导入 JSON
            <input
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void doImport(f)
                e.target.value = ''
              }}
            />
          </label>
          {form === null && (
            <button type="button" className="btn-primary" onClick={() => { setForm({ ...EMPTY_FORM }); setEditId(null) }}>＋ 添加信源</button>
          )}
        </div>
      </div>

      {(autoStopped.length > 0 || inactiveFail.length > 0) && (
        <div className="run-banner" role="alert">
          <span className="warn">⚠ {inactiveFail.length} 个源连续失败 ≥3 次已自动停用</span>
          （死源静默污染数据是最常见死法）：{inactiveFail.map((s) => s.name).join('、')}。请在编辑里检查地址或重新启用。
        </div>
      )}
      {msg && <div className="run-banner" data-testid="src-msg">{msg}</div>}

      {form !== null && (
        <div className="src-form" data-testid="src-form">
          <div className="form-grid">
            <label>名称
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>地址
              <input className="input" value={form.url} placeholder="https://…（原生 RSS / RSSHub 路由）" onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </label>
            <label>主题域
              <select value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })}>
                {DOMAINS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </label>
            <label>分级
              <select
                value={String(form.tier)}
                onChange={(e) => {
                  const t = Number(e.target.value) as 1 | 1.5 | 2
                  setForm({ ...form, tier: t, weight: TIER_WEIGHT[t] })
                }}
              >
                <option value="1">T1</option>
                <option value="1.5">T1.5</option>
                <option value="2">T2</option>
              </select>
            </label>
            <label>权重
              <input
                className="input"
                type="number" min="0" max="1" step="0.1"
                placeholder="tier 映射，可微调"
                value={form.weight ?? TIER_WEIGHT[form.tier] ?? 0.4}
                onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
              />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', fontSize: 'var(--fs-xs)', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
              操作
              <span style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <button type="button" className="btn-primary" onClick={() => void submit()}>保存</button>
                <button type="button" className="btn-ghost" onClick={() => { setForm(null); setEditId(null) }}>取消</button>
              </span>
            </div>
          </div>
        </div>
      )}

      {sources.length === 0 ? (
        <div className="empty">
          <div className="e-ico" aria-hidden>⛓</div>
          <p>还没有信源。C1 的验收是 5–10 个源跑两周，能回答"哪些源值得继续订"。</p>
          <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'center' }}>
            <button type="button" className="btn-primary" onClick={() => { setForm({ ...EMPTY_FORM }); setEditId(null) }}>＋ 添加第一个信源</button>
            <button type="button" className="btn-ghost" onClick={() => { void importSample().then((r) => setMsg(`已导入示例 ${r.imported} 个（原生 RSS，已实测可经转接抓取）`)) }}>
              导入 5 个示例源
            </button>
          </div>
        </div>
      ) : (
        <table className="src-table" data-testid="src-table">
          <thead>
            <tr>
              <th>名称</th><th>分级</th><th>主题域</th><th>地址</th><th>健康</th><th>近7天</th><th>启用</th><th></th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} data-testid="src-row">
                <td className="src-name">{s.name}</td>
                <td><span className={`tier-badge ${tierCls(s.tier)}`}>{TIER_LABEL[s.tier]}</span></td>
                <td>{DOMAINS.find((d) => d.key === s.domain)?.label ?? s.domain}</td>
                <td><span className="src-url" title={s.url}>{s.url}</span></td>
                <td><HealthCell s={s} /></td>
                <td className="tnum">{items7d[s.id] ?? 0}</td>
                <td>
                  <button
                    type="button"
                    className={`switch${s.active ? ' on' : ''}`}
                    role="switch"
                    aria-checked={s.active}
                    aria-label={`${s.active ? '停用' : '启用'} ${s.name}`}
                    onClick={() => void toggleActive(s.id, !s.active)}
                  />
                </td>
                <td>
                  <div className="src-actions">
                    <button type="button" className="mini-btn" onClick={() => { setForm({ name: s.name, url: s.url, domain: s.domain, tier: s.tier, weight: s.weight }); setEditId(s.id) }}>编辑</button>
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => {
                        if (window.confirm(`删除信源「${s.name}」？（软删除，条目保留）`)) void removeSource(s.id)
                      }}
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
