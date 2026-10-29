import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCollect } from '../store/collect'
import { Icon } from '../components/shell/icons'
import { DOMAINS, TIER_LABEL, TIER_WEIGHT, SOURCE_CATALOG } from '../content/collect'
import { SourceCatalog } from '../components/collect/SourceCatalog'
import type { SourceInput } from '../db/collect'
import { downloadFile } from '../db/repo'
import { exportSourcesJson } from '../db/collect'
import { voteStatsBySource } from '../engine/sourceCredit'
import { fmtLocal } from '../engine/datetime'
import { sourcesToOpml, parseOpml } from '../engine/opml'
import type { Source } from '../types/models'

function tierCls(tier: number): string {
  return tier === 1 ? 'tier-1' : tier === 1.5 ? 'tier-15' : 'tier-2'
}

function HealthCell({ s }: { s: Source }) {
  const stopped = !s.active && s.health.failStreak >= 3
  const failing = s.health.failStreak > 0 && s.active
  const tip = stopped
    ? `连败 ${s.health.failStreak} 次自动停用。最近错误：${s.health.lastError ?? '未知'}——换地址后点本行「启用」开关重新启用，失败计数会清零重新开始`
    : s.health.lastError
      ? `最近错误：${s.health.lastError}`
      : s.health.lastOkAt
        ? `上次成功 ${fmtLocal(s.health.lastOkAt)}`
        : '还没抓取过'
  return (
    <span title={tip}>
      <span className={`health-dot ${stopped ? 'health-stopped' : failing ? 'health-fail' : 'health-ok'}`} />
      {stopped ? '已停用' : failing ? `连败×${s.health.failStreak}` : '正常'}
    </span>
  )
}

const EMPTY_FORM: SourceInput = { name: '', url: '', domain: 'ai', tier: 1.5 }

/** 信源管理页（PRD §4.4）：tier 徽章 / health 点 / JSON 导入导出 / 自动停用告警 */
export function Sources() {
  const { sources, items, items7d, loaded, addSource, editSource, toggleActive, removeSource, importJson, fetch: fetchState, runFetchAll } = useCollect()
  const [form, setForm] = useState<SourceInput | null>(null)
  // 信源信用可见性：各源近 60 天投票统计（store 载 60 天，与引擎 applySourceCredit 同口径；升降由引擎在打开应用时自动做，这里只展示依据）
  const credit = useMemo(() => voteStatsBySource(items), [items])
  const [editId, setEditId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  // 信息日报空态「去挑推荐信源」带 ?catalog=1 直达展开态
  const [searchParams] = useSearchParams()
  const [catalogOpen, setCatalogOpen] = useState(() => searchParams.get('catalog') === '1')
  const catalogTotal = useMemo(() => SOURCE_CATALOG.reduce((n, g) => n + g.sources.length, 0), [])

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

  const doExportOpml = async () => {
    downloadFile('pwork-sources.opml', sourcesToOpml(sources), 'text/x-opml')
  }

  /** OPML 导入：解析后转成与「导入 JSON」相同的数组走同一条入库通道（URL 去重） */
  const doImportOpml = async (file: File) => {
    try {
      const entries = parseOpml(await file.text())
      const r = await importJson(JSON.stringify(entries))
      setMsg(`从 OPML 导入 ${r.imported} 个源，跳过 ${r.skipped} 个（地址重复或字段缺失）`)
    } catch (e) {
      setMsg(`OPML 导入失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const doImport = async (file: File) => {
    let text: string
    try {
      text = await file.text()
    } catch {
      setMsg('导入失败：文件读取失败')
      return
    }
    try {
      JSON.parse(text)
    } catch {
      setMsg('导入失败：不是合法的 JSON 数组')
      return
    }
    try {
      const r = await importJson(text)
      setMsg(`导入 ${r.imported} 个源，跳过 ${r.skipped} 个（缺字段或 URL 重复）`)
    } catch (e) {
      setMsg(`导入失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <section>
      <div className="page-head">
        <h1>信源</h1>
        <span className="sub">{sources.filter((s) => s.active).length} 个活跃 / 共 {sources.length} · 信息日报页进页自动抓；这里可随时手动抓</span>
        <div className="right">
          <button type="button" className="btn-primary" disabled={fetchState.running || sources.filter((s) => s.active).length === 0} onClick={() => void runFetchAll()}>
            {fetchState.running ? '抓取中…' : '立即抓取'}
          </button>
          <button type="button" className="btn-ghost" onClick={() => void doExport()}>导出 JSON</button>
          <button type="button" className="btn-ghost" title="导出为 RSS 阅读器通用格式（Feedly/Inoreader 等可直接订阅）" onClick={() => void doExportOpml()}>导出 OPML</button>
          <label className="btn-ghost" style={{ cursor: 'pointer' }} title="JSON 数组文件，每项含名称与地址；重复地址自动跳过。格式说明见 帮助 → 排错">
            导入 JSON
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
          <label className="btn-ghost" style={{ cursor: 'pointer' }} title="从其他 RSS 阅读器导出的 OPML 文件迁入订阅；重复地址自动跳过">
            导入 OPML
            <input
              type="file"
              accept=".opml,.xml,text/x-opml,application/xml,text/xml"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void doImportOpml(f)
                e.target.value = ''
              }}
            />
          </label>
          {sources.length > 0 && (
            <button
              type="button"
              className="btn-ghost"
              title={`推荐信源目录：${catalogTotal} 个实测可用的源按领域分组，勾选导入；可反复打开，已导入的源会标注，重复导入安全`}
              onClick={() => setCatalogOpen((v) => !v)}
            >
              {catalogOpen ? '收起目录' : `从目录添加（${catalogTotal} 个推荐源）`}
            </button>
          )}
          {form === null && (
            <button type="button" className="btn-primary" onClick={() => { setForm({ ...EMPTY_FORM }); setEditId(null) }}>＋ 添加信源</button>
          )}
          {sources.length > 1 && (
            sources.every((s) => !s.active) ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  if (!window.confirm(`全部启用 ${sources.length} 个信源？`)) return
                  for (const s of sources.filter((x) => !x.active)) void toggleActive(s.id, true)
                }}
              >
                全部启用
              </button>
            ) : (
              <button
                type="button"
                className="btn-ghost"
                title="临时停用全部信源（如调试时不想抓取）；逐个恢复或再点全部启用"
                onClick={() => {
                  if (!window.confirm(`全部暂停 ${sources.filter((s) => s.active).length} 个活跃信源？暂停后不参与抓取，随时可恢复。`)) return
                  for (const s of sources.filter((x) => x.active)) void toggleActive(s.id, false)
                }}
              >
                全部暂停
              </button>
            )
          )}
        </div>
      </div>

      {(autoStopped.length > 0 || inactiveFail.length > 0) && (
        <div className="run-banner" role="alert">
          <span className="warn"><Icon name="alert" size={13} /> {inactiveFail.length} 个源连续失败 ≥3 次已自动停用</span>
          ：{inactiveFail.map((s) => s.name).join('、')}。请在编辑里检查地址或重新启用。
        </div>
      )}
      {msg && <div className="run-banner" data-testid="src-msg">{msg}</div>}

      {catalogOpen && sources.length > 0 && (
        <div className="set-card" style={{ marginBottom: 'var(--sp-3)' }}>
          <h2>推荐信源目录</h2>
          <div className="set-body">
            <SourceCatalog onDone={setMsg} />
          </div>
        </div>
      )}

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
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>投票攒够 8 条后由你的投票自动调整</span>
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
        <>
          <div className="empty">
            <div className="e-ico" aria-hidden><Icon name="rss" size={32} /></div>
            <p>{!loaded ? '正在读取信源…' : '还没有信源。从下面的目录挑几个开始，用两周再决定哪些值得长期订阅。'}</p>
            <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'center' }}>
              <button type="button" className="btn-primary" onClick={() => { setForm({ ...EMPTY_FORM }); setEditId(null) }}>＋ 手动添加信源</button>
            </div>
          </div>
          <div className="set-card">
            <h2>推荐信源目录</h2>
            <div className="set-body">
              <SourceCatalog onDone={setMsg} />
            </div>
          </div>
        </>
      ) : (
        <table className="src-table" data-testid="src-table">
          <thead>
            <tr>
              <th>名称</th><th>分级</th><th>多推率</th><th>主题域</th><th>地址</th><th>健康</th><th>近7天</th><th>启用</th><th></th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} data-testid="src-row">
                <td className="src-name">{s.name}</td>
                <td>
                  <span
                    className={`tier-badge ${tierCls(s.tier)}`}
                    title="分级由你的投票自动升降（多推率 ≥60% 升 T1、≥30% 升 T1.5、其余 T2；近 60 天投票 ≥8 条才动）"
                  >
                    {TIER_LABEL[s.tier]}
                  </span>
                </td>
                <td className="tnum">
                  {(() => {
                    const st = credit.get(s.id)
                    if (!st) return '—'
                    return `${Math.round((st.want / st.rated) * 100)}%（${st.rated} 票）`
                  })()}
                </td>
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
