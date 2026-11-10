import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCollect } from '../../../store/collect'
import { Icon } from '../../../components/shell/icons'
import { DOMAINS, TIER_LABEL, TIER_WEIGHT, SOURCE_CATALOG } from '../../../content/collect'
import { SourceCatalog } from '../components/SourceCatalog'
import type { SourceInput } from '../../../db/collect'
import { downloadFile } from '../../../db/repo'
import { exportSourcesJson } from '../../../db/collect'
import { voteStatsBySource } from '../engine/sourceCredit'
import { auditSources, verdictLabel, classifySourceError } from '../engine/sourceAudit'
import { probeFeedUrl } from '../engine/feedProbe'
import { discoverLeads } from '../engine/sourceDiscover'
import { probeYtdlp } from '../engine/ytdlp'
import { confirmDialog } from '../../../engine/confirm'
import { keywordFeedUrl } from '../engine/rss'
import { isDesktopApp } from '../../../engine/platform'
import { fmtLocal } from '../../../engine/datetime'
import { sourcesToOpml, parseOpml } from '../engine/opml'
import type { Source } from '../../../types/models'

function tierCls(tier: number): string {
  return tier === 1 ? 'tier-1' : tier === 1.5 ? 'tier-15' : 'tier-2'
}

function HealthCell({ s }: { s: Source }) {
  const stopped = !s.active && s.health.failStreak >= 3
  const failing = s.health.failStreak > 0 && s.active
  // 失败分类（融合批）：区分「本地到不了（云端可救）」与「源可能停更」——避免误删还活着的源
  const cls = classifySourceError(s.health.lastError)
  const tip = stopped
    ? `连败 ${s.health.failStreak} 次自动停用。最近错误：${s.health.lastError ?? '未知'}${cls ? `。${cls.hint}` : ''}——换地址后点本行「启用」开关重新启用，失败计数会清零重新开始`
    : s.health.lastError
      ? `最近错误：${s.health.lastError}${cls ? `。${cls.hint}` : ''}`
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

const EMPTY_FORM: SourceInput = { name: '', url: '', domain: 'ai', tier: 1.5, kind: 'rss' }

/** 信源管理页（PRD §4.4）：tier 徽章 / health 点 / JSON 导入导出 / 自动停用告警 */
export function Sources() {
  const { sources, items, items7d, loaded, addSource, editSource, toggleActive, removeSource, importJson, fetch: fetchState, runFetchAll } = useCollect()
  const [form, setForm] = useState<SourceInput | null>(null)
  // 本机 yt-dlp 版本（添加 yt-dlp 信源时的安装检测；仅桌面版探测——网页版没有本机进程，选项一并隐藏）
  const desktop = isDesktopApp()
  const [ytdlpVer, setYtdlpVer] = useState<string | null>(null)
  useEffect(() => {
    if (!desktop) return
    void probeYtdlp().then(setYtdlpVer)
  }, [desktop])
  // 引用发现卡的 feed 自动探测（融合批）：点「编辑后添加」先探测该域名的主页声明与惯例路径
  const [probingDomain, setProbingDomain] = useState<string | null>(null)
  const [probingForm, setProbingForm] = useState(false)
  const addLead = async (domain: string) => {
    setProbingDomain(domain)
    const r = await probeFeedUrl(`https://${domain}`)
    setProbingDomain(null)
    setForm({ name: domain, url: r.feedUrl ?? `https://${domain}`, domain: 'ai', tier: 1.5 })
    setEditId(null)
    setMsg(r.feedUrl ? `已探测到 feed 地址（${r.how === 'link' ? '页面声明' : '惯例路径'}），确认后保存即可` : '没探测到 feed 地址——已预填主页地址，可手动补全或换 RSSHub 路由')
  }
  // 信源信用可见性：各源近 60 天投票统计（store 载 60 天，与引擎 applySourceCredit 同口径；升降由引擎在打开应用时自动做，这里只展示依据）
  const credit = useMemo(() => voteStatsBySource(items), [items])
  // 播客信源标记（1.3 批）：该源有条目带音频附件即标记（源自 RSS 音频 enclosure，抓取时识别）
  const audioSources = useMemo(() => new Set(items.filter((i) => i.hasAudio).map((i) => i.sourceId)), [items])
  const [editId, setEditId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  // 关键词监控（1.4 批）：表单里输入关键词生成必应原生 RSS 订阅地址，零引擎改动
  const [kwMode, setKwMode] = useState(false)
  const [kw, setKw] = useState('')
  // 信息日报空态「去挑推荐信源」带 ?catalog=1 直达展开态
  const [searchParams] = useSearchParams()
  const [catalogOpen, setCatalogOpen] = useState(() => searchParams.get('catalog') === '1')
  const catalogTotal = useMemo(() => SOURCE_CATALOG.reduce((n, g) => n + g.sources.length, 0), [])

  const autoStopped = fetchState.summary?.results.filter((r) => r.autoStopped) ?? []
  const inactiveFail = sources.filter((s) => !s.active && s.health.failStreak >= 3)

  const submit = async () => {
    if (!form) return
    let url = form.url
    let name = form.name
    // 关键词监控（1.4 批）：关键词生成必应原生 RSS 地址，名称自动补默认；非新增模式不走此路
    if (kwMode && !editId && (form.kind ?? 'rss') === 'rss') {
      const word = kw.trim()
      if (!word) {
        setMsg('先输入要监控的关键词')
        return
      }
      url = keywordFeedUrl(word)
      name = form.name.trim() || `${word} · 关键词监控`
    }
    if (!name.trim() || !url.trim()) return
    const payload = { ...form, url, name }
    if (editId) {
      await editSource(editId, payload)
      setEditId(null)
    } else {
      await addSource(payload)
    }
    setForm(null)
    setKwMode(false)
    setKw('')
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
            <button type="button" className="btn-primary" onClick={() => { setForm({ ...EMPTY_FORM }); setEditId(null); setKwMode(false); setKw('') }}>＋ 添加信源</button>
          )}
          {sources.length > 1 && (
            sources.every((s) => !s.active) ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  void confirmDialog({ title: `全部启用 ${sources.length} 个信源？`, confirmLabel: '全部启用' }).then((ok) => { if (ok) for (const s of sources.filter((x) => !x.active)) void toggleActive(s.id, true) })
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
                  void confirmDialog({ title: `全部暂停 ${sources.filter((s) => s.active).length} 个活跃信源？`, body: '暂停后不参与抓取，随时可恢复。', confirmLabel: '全部暂停' }).then((ok) => { if (ok) for (const s of sources.filter((x) => x.active)) void toggleActive(s.id, false) })
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

      {/* 信源自检（主动识别·第一层）：30 天产出四指标 → 健康画像；只提示不动档位（升降由信用引擎自动做） */}
      {(() => {
        const audits = auditSources(items, sources)
        const issues = audits.filter((a) => a.verdict === 'noisy' || a.verdict === 'idle')
        const goods = audits.filter((a) => a.verdict === 'good')
        if (audits.length === 0 || sources.length === 0) return null
        return (
          <div className="set-card" style={{ marginBottom: 'var(--sp-3)' }} data-testid="source-audit">
            <h2>信源自检（近 30 天）</h2>
            <div className="set-body">
              <div className="set-row">
                <label>总体</label>
                <span className="val" style={{ fontSize: 'var(--fs-xs)' }}>
                  产出健康 {goods.length} 个 ｜ 噪声偏高 {audits.filter((a) => a.verdict === 'noisy').length} 个 ｜ 零命中 {audits.filter((a) => a.verdict === 'idle').length} 个 ｜ 观察中 {audits.filter((a) => a.verdict === 'young').length} 个
                </span>
              </div>
              {issues.map((a) => (
                <div className="set-row" key={a.sourceId}>
                  <label style={{ color: a.verdict === 'noisy' ? 'var(--warn, var(--accent))' : 'var(--ink-soft)' }}>
                    {verdictLabel(a.verdict)}
                  </label>
                  <span className="val" style={{ fontSize: 'var(--fs-xs)' }}>
                    <b>{a.name}</b>：{a.advice}
                  </span>
                </div>
              ))}
              {issues.length === 0 && (
                <div className="set-row">
                  <label></label>
                  <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                    没有需要处理的信源——降档与升档由投票信用自动完成，这里只报告健康状态。
                  </span>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* 引用发现（主动识别·第二层）：非订阅域名近 30 天被反复转引 → 值得直接订阅的源头。
          只发现不添加——feed 地址猜不出来，「编辑后添加」预填名称与主站地址，补全 feed 后入库 */}
      {(() => {
        const leads = discoverLeads(items, sources)
        if (leads.length === 0) return null
        return (
          <div className="set-card" style={{ marginBottom: 'var(--sp-3)' }} data-testid="source-leads">
            <h2>可能值得订阅的源头（近 30 天被你的信源反复转引）</h2>
            <div className="set-body">
              {leads.map((l) => (
                <div className="set-row" key={l.domain}>
                  <label>{l.domain}</label>
                  <span className="val" style={{ fontSize: 'var(--fs-xs)' }}>
                    被引用 {l.count} 次，如：{l.samples.map((s) => s.title).join('；')}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ flex: 'none' }}
                    disabled={probingDomain === l.domain}
                    onClick={() => void addLead(l.domain)}
                  >
                    {probingDomain === l.domain ? '探测 feed 中…' : '编辑后添加'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

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
            <label>类型
              <select value={form.kind ?? 'rss'} onChange={(e) => setForm({ ...form, kind: e.target.value as 'rss' | 'ytdlp' })}>
                <option value="rss">RSS / Atom（含 RSSHub 等桥接地址）</option>
                {desktop && <option value="ytdlp">yt-dlp 平台投稿清单（B站 UP 主 / YouTube 频道）</option>}
              </select>
              {desktop && form.kind === 'ytdlp' && (
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                  {ytdlpVer
                    ? `本机 yt-dlp ${ytdlpVer}——抓取时只拉标题与链接，不下载视频`
                    : '本机没检测到 yt-dlp：pip install yt-dlp 安装后即可抓取'}
                </span>
              )}
            </label>
            <label>地址
              {kwMode && !editId && (form.kind ?? 'rss') === 'rss' ? (
                <>
                  <input
                    className="input"
                    value={kw}
                    placeholder="输入要监控的关键词，如：人工智能"
                    onChange={(e) => setKw(e.target.value)}
                  />
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', wordBreak: 'break-all', marginTop: 4 }}>
                    {kw.trim()
                      ? `将订阅必应搜索结果：${keywordFeedUrl(kw)}`
                      : '输入关键词后自动生成订阅地址（必应搜索，大陆直连可达；每天自动更新）'}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ flex: 'none', marginTop: 4, alignSelf: 'flex-start' }}
                    onClick={() => { setKwMode(false); setKw('') }}
                  >
                    改为手动输入地址
                  </button>
                </>
              ) : (
                <>
                  <input
                    className="input"
                    value={form.url}
                    placeholder={form.kind === 'ytdlp' ? 'https://space.bilibili.com/UP主ID/video 或 https://youtube.com/@频道/videos' : 'https://…（原生 RSS / RSSHub 路由）'}
                    onChange={(e) => setForm({ ...form, url: e.target.value })}
                  />
                  {(form.kind ?? 'rss') === 'rss' && !editId && (
                    <span style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ flex: 'none' }}
                        disabled={probingForm || !form.url.trim()}
                        onClick={() => {
                          setProbingForm(true)
                          void probeFeedUrl(form.url).then((r) => {
                            setProbingForm(false)
                            if (r.feedUrl) {
                              setForm((f) => (f ? { ...f, url: r.feedUrl! } : f))
                              setMsg(`已探测到 feed 地址（${r.how === 'input' ? '输入本身就是 feed' : r.how === 'link' ? '页面声明' : '惯例路径'}）`)
                            } else {
                              setMsg('没探测到 feed 地址——试 RSSHub 路由，或看 帮助 → 配置指南 的找 feed 方法')
                            }
                          })
                        }}
                      >
                        {probingForm ? '探测中…' : '自动探测 feed'}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ flex: 'none' }}
                        title="没有现成 feed？输入关键词订阅必应搜索结果"
                        onClick={() => { setKwMode(true); setKw(''); setForm((f) => (f ? { ...f, url: '' } : f)) }}
                      >
                        用关键词订阅
                      </button>
                      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>只有站点主页地址？点它自动找 feed</span>
                    </span>
                  )}
                </>
              )}
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
                <button type="button" className="btn-ghost" onClick={() => { setForm(null); setEditId(null); setKwMode(false); setKw('') }}>取消</button>
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
                <td className="src-name">
                  {s.kind === 'ytdlp' && <span className="tier-badge tier-15" title="yt-dlp 信源：抓取时调本机 yt-dlp 拉投稿清单（标题+链接）" style={{ marginRight: 6 }}>yt</span>}
                  {s.kind !== 'ytdlp' && audioSources.has(s.id) && <span className="tier-badge tier-15" title="播客信源：条目带音频附件（只做发现与记录，播放请用播客客户端）" style={{ marginRight: 6 }}>播客</span>}
                  {s.name}
                </td>
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
                    <button type="button" className="mini-btn" onClick={() => { setForm({ name: s.name, url: s.url, domain: s.domain, tier: s.tier, weight: s.weight, kind: s.kind }); setEditId(s.id); setKwMode(false); setKw('') }}>编辑</button>
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => {
                        void confirmDialog({ title: `删除信源「${s.name}」？`, body: '软删除：条目保留。', danger: true, confirmLabel: '删除' }).then((ok) => { if (ok) void removeSource(s.id) })
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
