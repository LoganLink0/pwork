import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { downloadFile } from '../db/repo'
import { importBundle } from '../db/backup'
import { syncFromCloud, pushSourcesToCloud, loadCloudConfig, saveCloudConfig, lastSyncAt, testConnection, syncIngestBlocks, type CloudConfig } from '../db/cloudSync'
import { useNotes } from '../store/notes'
import { useCollect, buildBackupBundle } from '../store/collect'
import { useTasks } from '../store/tasks'
import { useUi } from '../store/ui'
import { loadCoachConfig, saveCoachConfig, llmConfigFrom, type CoachConfig } from '../modules/review/engine/coach'
import { chatCompletion } from '../modules/review/engine/llm'
import { fmtLocal, monthLocal } from '../engine/datetime'
import { listErrors, clearErrors, formatErrorLog, type ErrorKind } from '../engine/errorLog'
import { starStats, type StarStats } from '../engine/starStats'
import { DEFAULT_WEIGHTS } from '../engine/rules'
import { loadAutoBackup, saveAutoBackup } from '../engine/autoBackup'
import { isDesktopApp } from '../engine/platform'
import { starAdvice, type StarAdvice } from '../engine/starAdvice'
import { db } from '../db/schema'
import type { ErrorLogEntry, ScoreWeights } from '../types/models'
import type { ThemePref } from '../engine/appearance'

const THEMES: { key: ThemePref; label: string }[] = [
  { key: 'auto', label: '跟随系统' },
  { key: 'light', label: '明亮' },
  { key: 'dark', label: '暗色' },
]

const ERR_KIND_LABEL: Record<ErrorKind, string> = {
  render: '页面崩溃',
  promise: '异步错误',
  window: '脚本错误',
  app: '内部错误',
}

const WEIGHT_FIELDS: { key: keyof ScoreWeights; label: string }[] = [
  { key: 'source', label: '信源' },
  { key: 'novelty', label: '新鲜度' },
  { key: 'relevance', label: '相关度' },
  { key: 'utility', label: '实用度' },
]

/** 设置页（PRD §4.8）：W1 交付外观与数据导出；AI·BYOK 与导入随 W2/W3 点亮 */
export function Settings() {
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  const noteCount = useNotes((s) => s.notes.length)
  const trashCount = useNotes((s) => s.trash.length)
  const { config, setConfig, sources, items } = useCollect()
  const [lastBackup, setLastBackup] = useState<string | null>(
    () => localStorage.getItem('pwork-last-backup'),
  )
  const [autoBk, setAutoBk] = useState(() => loadAutoBackup())
  const setAutoBackup = (patch: Partial<typeof autoBk>) => {
    const next = { ...autoBk, ...patch }
    setAutoBk(next)
    saveAutoBackup(next)
  }
  const [interestDraft, setInterestDraft] = useState('')
  const [dislikeDraft, setDislikeDraft] = useState('')
  const [contextDraft, setContextDraft] = useState<string | null>(null)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [cloud, setCloud] = useState<CloudConfig>(() => loadCloudConfig())
  const [cloudMsg, setCloudMsg] = useState<string | null>(null)
  const [cloudBusy, setCloudBusy] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(() => lastSyncAt())

  // 错误日志（2026-10 用户要求：出错立即暴露 + 可查"哪里发生了什么"）
  const [errors, setErrors] = useState<ErrorLogEntry[]>([])
  const [errBusy, setErrBusy] = useState(false)
  const refreshErrors = async () => {
    setErrBusy(true)
    try {
      setErrors(await listErrors(50))
    } finally {
      setErrBusy(false)
    }
  }
  useEffect(() => {
    void refreshErrors()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 挂载取一次，手动点刷新更新
  }, [])

  // 星级反馈统计（方案 A：调权重/兴趣词的依据）
  const [stats, setStats] = useState<StarStats | null>(null)
  const [statsBusy, setStatsBusy] = useState(false)
  const refreshStats = async () => {
    setStatsBusy(true)
    try {
      const all = await db.items.toArray()
      setStats(starStats(all.filter((i) => !i.deletedAt), config.interests, sources))
    } finally {
      setStatsBusy(false)
    }
  }
  useEffect(() => {
    void refreshStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 挂载取一次，手动点刷新更新
  }, [])

  /** 权重以百分比直觉值编辑（40/25/20/15）；引擎按比例折算，不要求恰好 100 */
  const setWeight = (key: keyof ScoreWeights, pct: number) => {
    const next = { ...(config.weights ?? DEFAULT_WEIGHTS), [key]: Math.max(0, Math.min(100, pct)) / 100 }
    setConfig({ weights: next })
  }

  const saveCloud = (next: CloudConfig) => {
    setCloud(next)
    saveCloudConfig(next)
  }

  const doSync = async () => {
    setCloudBusy(true)
    setCloudMsg(null)
    try {
      const r = await syncFromCloud()
      setCloudMsg(r.ok ? `同步完成：新 ${r.newCount} 条 · 跳过 ${r.skipCount} 条（按指纹去重）` : `同步失败：${r.error}`)
      if (r.ok) setLastSync(lastSyncAt())
      if (r.ok && r.newCount > 0) await useCollect.getState().load()
    } finally {
      setCloudBusy(false)
    }
  }

  const doPush = async () => {
    setCloudBusy(true)
    setCloudMsg(null)
    try {
      const r = await pushSourcesToCloud()
      setCloudMsg(r.ok ? `信源已推送：云端导入 ${r.imported} 个` : `推送失败：${r.error}`)
    } finally {
      setCloudBusy(false)
    }
  }

  const doIngest = async () => {
    setCloudBusy(true)
    setCloudMsg(null)
    try {
      const r = await syncIngestBlocks()
      setCloudMsg(r.ok ? `推送数据已拉取：新 ${r.pulled} 块（去 输入 → 外部数据 查看）` : `拉取失败：${r.error}`)
    } finally {
      setCloudBusy(false)
    }
  }

  // AI · BYOK（全工作台一把钥匙：fupan-coach 配置复用，02 §4 凭据只存 localStorage）
  const [ai, setAi] = useState<CoachConfig>(() => loadCoachConfig())
  const [aiTesting, setAiTesting] = useState(false)
  const [aiTestMsg, setAiTestMsg] = useState('')
  const [aiTestOk, setAiTestOk] = useState(false)
  const [usageBusy, setUsageBusy] = useState(false)
  const [usageMsg, setUsageMsg] = useState('')
  const saveAi = (next: CoachConfig) => {
    setAi(next)
    saveCoachConfig(next)
  }
  const testAi = async () => {
    setAiTesting(true)
    setAiTestMsg('')
    try {
      const reply = await chatCompletion(llmConfigFrom(ai), '你是连通性测试器。', '回复 ok 即可。', { maxTokens: 10, timeoutMs: 15000 })
      setAiTestMsg(`连通正常（回复：${reply.trim().slice(0, 20)}）`)
      setAiTestOk(true)
    } catch (e) {
      setAiTestMsg(`失败：${e instanceof Error ? e.message : String(e)}`)
      setAiTestOk(false)
    } finally {
      setAiTesting(false)
    }
  }

  const doImport = async (file: File) => {
    try {
      const r = await importBundle(await file.text())
      // 各域重新加载（导入可能影响所有模块）
      await Promise.all([useNotes.getState().load(), useCollect.getState().load(), useTasks.getState().load()])
      const detail = Object.entries(r.counts).map(([k, v]) => `${k} ${v}`).join(' · ')
      setImportMsg(`导入成功（${r.format}）：${detail || '无变化'}`)
    } catch (e) {
      setImportMsg(`导入失败：${e instanceof Error ? e.message : '不是合法的 JSON'}`)
    }
  }

  const doExport = async () => {
    const bundle = await buildBackupBundle()
    const now = new Date()
    const stamp = `${monthLocal(now).replace('-', '')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
    downloadFile(`pwork-backup-${stamp}.json`, JSON.stringify(bundle, null, 2), 'application/json')
    const at = now.toISOString()
    localStorage.setItem('pwork-last-backup', at)
    setLastBackup(at)
  }

  const addInterest = () => {
    const v = interestDraft.trim().replace(/^#/, '')
    if (v && !config.interests.includes(v)) setConfig({ interests: [...config.interests, v] })
    setInterestDraft('')
  }
  const addDislike = () => {
    const v = dislikeDraft.trim().replace(/^#/, '')
    if (v && !config.dislikes.includes(v)) setConfig({ dislikes: [...config.dislikes, v] })
    setDislikeDraft('')
  }

  return (
    <section className="settings">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>设置</h1>
        <span className="sub">壳级配置 · 凭据未来只存 localStorage，永不进备份</span>
        <div className="right">
          <Link to="/welcome" className="btn-ghost">↩ 首访引导</Link>
        </div>
      </div>

      <div className="set-card">
        <h2>外观</h2>
        <div className="desc">v3「冷静的工作台」· 明暗机制沿用既有实现</div>
        <div className="set-body">
          <div className="set-row">
            <label>主题</label>
            <div className="radio" role="radiogroup" aria-label="主题">
              {THEMES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={theme === t.key ? 'on' : ''}
                  onClick={() => setTheme(t.key)}
                  aria-pressed={theme === t.key}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="set-card">
        <h2>数据</h2>
        <div className="desc">备份先行（铁律 6）：任何删除、迁移、清理前，先全量导出</div>
        <div className="set-body">
          {(noteCount > 0 || sources.length > 0 || items.length > 0 || trashCount > 0) && (
            <div className="notice" style={{ marginBottom: 'var(--sp-3)' }}>
              <b>换电脑 / 换浏览器 / 换到桌面版时</b>：① 在当前环境的这一页点「全量导出」，会得到一个 JSON 备份文件；② 在新环境这一页点「导入」选中该文件，所有数据合并进来（相同的按时间新者为准）。
            </div>
          )}
          <div className="set-row">
            <label>全量备份</label>
            <button type="button" className="btn-primary" onClick={() => void doExport()}>
              ⬇ 全量导出
            </button>
              <label className="btn-ghost" style={{ cursor: 'pointer' }} title="支持 PWORK v2/v1 与 FUPAN 旧版导出">
                ⬆ 导入
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
            <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
              {lastBackup ? `上次导出：${fmtLocal(lastBackup)}` : '还没有导出过'}
            </span>
          </div>
          <div className="set-row">
            <label>库内数据</label>
            <span className="val tnum">
              速记 {noteCount} 条 · 信源 {sources.length} 个 · 条目 {items.length} 条（近30天）· 回收站 {trashCount} · 导出包裹 version 1
            </span>
          </div>
          <div className="set-row">
            <label>自动备份</label>
            <div className="radio" role="radiogroup" aria-label="自动备份开关">
              <button type="button" className={autoBk.enabled ? 'on' : ''} onClick={() => setAutoBackup({ enabled: true })} aria-pressed={autoBk.enabled}>
                开
              </button>
              <button type="button" className={!autoBk.enabled ? 'on' : ''} onClick={() => setAutoBackup({ enabled: false })} aria-pressed={!autoBk.enabled}>
                关
              </button>
            </div>
            <div className="radio" role="radiogroup" aria-label="自动备份周期">
              {[7, 14, 30].map((d) => (
                <button key={d} type="button" className={autoBk.everyDays === d ? 'on' : ''} onClick={() => setAutoBackup({ everyDays: d })} aria-pressed={autoBk.everyDays === d}>
                  {d === 30 ? '每月' : d === 14 ? '每两周' : '每周'}
                </button>
              ))}
            </div>
            <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
              {autoBk.enabled
                ? `到期后打开应用自动备份${isDesktopApp() ? '到应用数据目录的 backups 文件夹' : '到浏览器下载文件夹'}${autoBk.lastAt ? `（上次自动备份：${fmtLocal(autoBk.lastAt)}）` : '（还没备份过，下次打开应用时执行）'}`
                : '本地优先应用，建议开启——数据只存在这台电脑上'}
            </span>
          </div>
          <div className="notice" style={{ marginTop: 'var(--sp-3)' }}>
            导出为统一包裹 <code>{'{ version, exportedAt, entities }'}</code>：notes + sources + 条目（仅 scored/kept，raw/discarded 不备份）+ 采集配置 + 复盘/行动/洞察 + 任务；导入按 id + updatedAt last-writer-wins 合并，兼容 FUPAN 旧版导出。
          </div>
          {importMsg && (
            <div className="run-banner" style={{ marginTop: 'var(--sp-3)' }} data-testid="import-msg" role="status">
              {importMsg}
            </div>
          )}
        </div>
      </div>

      <div className="set-card">
        <h2>采集偏好</h2>
        <div className="desc">兴趣域是评分的锚点（04 §4.2）——你的经验物化点，随使用持续修订</div>
        <div className="set-body">
          <div className="set-row">
            <label>兴趣域</label>
            <div className="chips" style={{ flex: 1 }}>
              {config.interests.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="chip on"
                  title="点击移除"
                  onClick={() => setConfig({ interests: config.interests.filter((x) => x !== t) })}
                >
                  {t} ×
                </button>
              ))}
              <input
                className="input"
                style={{ maxWidth: 140 }}
                placeholder="添加后回车"
                value={interestDraft}
                onChange={(e) => setInterestDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addInterest()}
                aria-label="添加兴趣域"
              />
            </div>
          </div>
          <div className="set-row">
            <label>屏蔽词</label>
            <div className="chips" style={{ flex: 1 }}>
              {config.dislikes.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="chip on"
                  title="点击移除"
                  onClick={() => setConfig({ dislikes: config.dislikes.filter((x) => x !== t) })}
                >
                  {t} ×
                </button>
              ))}
              <input
                className="input"
                style={{ maxWidth: 140 }}
                placeholder="命中即筛除"
                value={dislikeDraft}
                onChange={(e) => setDislikeDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addDislike()}
                aria-label="添加屏蔽词"
              />
            </div>
          </div>
          <div className="set-row">
            <label>兴趣域 Context</label>
            <input
              className="input"
              value={contextDraft ?? config.context}
              placeholder="我在做……关注……（云端评分锚点以部署配置为准（wrangler.toml INTERESTS 等）；此处目前仅作本地备忘）"
              onChange={(e) => setContextDraft(e.target.value)}
              onBlur={() => contextDraft !== null && setConfig({ context: contextDraft })}
            />
          </div>
          <div className="set-row">
            <label>评分权重</label>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="weight-grid">
                {WEIGHT_FIELDS.map((f) => (
                  <label key={f.key} className="weight-cell">
                    {f.label}
                    <input
                      className="input tnum"
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      value={Math.round((config.weights ?? DEFAULT_WEIGHTS)[f.key] * 100)}
                      onChange={(e) => setWeight(f.key, Number(e.target.value))}
                      aria-label={`${f.label}权重百分比`}
                    />
                    ％
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginTop: 'var(--sp-2)', flexWrap: 'wrap' }}>
                <button type="button" className="text-btn" onClick={() => setConfig({ weights: { ...DEFAULT_WEIGHTS } })}>
                  恢复默认（30/25/25/20）
                </button>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                  评分时四项按比例折算，当前合计 {Math.round(WEIGHT_FIELDS.reduce((n, f) => n + (config.weights ?? DEFAULT_WEIGHTS)[f.key], 0) * 100)}%
                </span>
              </div>
            </div>
          </div>
          <div className="set-row">
            <label>转接服务</label>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="默认公共 rss2json（不稳定时可填自建地址，留空即用默认）"
              value={config.relayBase ?? ''}
              onChange={(e) => setConfig({ relayBase: e.target.value })}
              aria-label="RSS 转接服务地址"
            />
          </div>
        </div>
      </div>

      <div className="set-card">
        <h2>星级反馈</h2>
        <div className="desc">你给条目打的星级是调权重、调兴趣词的依据——这里汇总 4–5 星条目的共同点（按当前兴趣词表重算）</div>
        <div className="set-body">
          {!stats || statsBusy ? (
            <div className="val" style={{ color: 'var(--ink-faint)' }}>读取中…</div>
          ) : stats.rated === 0 ? (
            <div className="val" style={{ color: 'var(--ink-faint)' }}>
              还没有打过星级。在「信息日报」里给条目打星，这里就会告诉你高分条目集中在哪些兴趣词、信源和主题域。
            </div>
          ) : (
            <>
              <div className="set-row">
                <label>总体</label>
                <span className="val tnum">打过星 {stats.rated} 条 · 平均 {stats.avgStars} 星 · 高分（4–5 星）{stats.high} 条</span>
              </div>
              {stats.high > 0 && (
                <>
                  <div className="stat-group">高分条目的兴趣词</div>
                  <div className="stat-bars">
                    {stats.interestHits.length === 0 ? (
                      <div className="stat-empty">高分条目没有命中任何兴趣词——考虑把它们的关键词加进上面的兴趣域</div>
                    ) : (
                      stats.interestHits.map((e) => (
                        <div key={e.label} className="stat-bar">
                          <span className="stat-label">{e.label}</span>
                          <span className="stat-track"><span className="stat-fill" style={{ width: `${(e.count / stats.interestHits[0]!.count) * 100}%` }} /></span>
                          <span className="stat-count tnum">{e.count}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="stat-group">高分条目来自的信源</div>
                  <div className="stat-bars">
                    {stats.sources.map((e) => (
                      <div key={e.label} className="stat-bar">
                        <span className="stat-label">{e.label}</span>
                        <span className="stat-track"><span className="stat-fill alt" style={{ width: `${(e.count / stats.sources[0]!.count) * 100}%` }} /></span>
                        <span className="stat-count tnum">{e.count}</span>
                      </div>
                    ))}
                  </div>
                  <div className="stat-group">高分条目的主题域</div>
                  <div className="stat-bars">
                    {stats.domains.map((e) => (
                      <div key={e.label} className="stat-bar">
                        <span className="stat-label">{e.label}</span>
                        <span className="stat-track"><span className="stat-fill alt" style={{ width: `${(e.count / stats.domains[0]!.count) * 100}%` }} /></span>
                        <span className="stat-count tnum">{e.count}</span>
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const adviceList: StarAdvice[] = starAdvice(stats, config)
                    if (adviceList.length === 0) return null
                    return (
                      <>
                        <div className="stat-group">调整建议（依据上面的统计）</div>
                        {adviceList.map((a) => (
                          <div key={a.id} className="notice" style={{ marginBottom: 'var(--sp-2)', display: 'flex', gap: 'var(--sp-2)', alignItems: 'baseline', flexWrap: 'wrap' }}>
                            <span style={{ flex: 1, minWidth: '240px' }}>{a.text}</span>
                            {a.apply && (
                              <button type="button" className="mini-btn" onClick={() => setConfig({ weights: { ...DEFAULT_WEIGHTS, ...(config.weights ?? {}), ...a.apply!.weights } })}>
                                采纳（改权重）
                              </button>
                            )}
                            {a.goTo && (
                              <Link to={a.goTo} className="mini-btn" style={{ textDecoration: 'none' }}>去看看</Link>
                            )}
                          </div>
                        ))}
                      </>
                    )
                  })()}
                  <div className="notice" style={{ marginTop: 'var(--sp-3)' }}>
                    怎么用：某兴趣词高频出现 → 上调「相关度」权重或补充兴趣域；高分集中在少数信源 → 去信源管理页上调这些信源的分级。调整从下一次抓取开始生效。
                  </div>
                </>
              )}
            </>
          )}
          <div className="set-row" style={{ marginTop: 'var(--sp-3)' }}>
            <button type="button" className="btn-ghost" disabled={statsBusy} onClick={() => void refreshStats()}>
              {statsBusy ? '读取中…' : '↻ 刷新统计'}
            </button>
            <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>打星后回这里点刷新</span>
          </div>
        </div>
      </div>

      <div className="set-card">
        <h2>错误日志</h2>
        <div className="desc">程序出错时立即记录在这里：哪里出了什么问题、技术细节，供排查迭代。上限 300 条，最旧的先删。</div>
        <div className="set-body">
          {errors.length === 0 ? (
            <div className="val" style={{ color: 'var(--ink-faint)' }}>
              {errBusy ? '读取中…' : '没有记录到错误。'}
            </div>
          ) : (
            <div className="errlog-list" data-testid="errlog-list">
              {errors.map((e) => (
                <details key={e.id} className="errlog-item">
                  <summary>
                    <span className="errlog-time tnum">{fmtLocal(e.at)}</span>
                    <span className="errlog-kind">{ERR_KIND_LABEL[e.kind]}</span>
                    <span className="errlog-where">{e.where}</span>
                    <span className="errlog-msg">{e.message}</span>
                  </summary>
                  <pre className="errlog-detail">{e.stack ?? e.detail ?? '（没有更多细节）'}</pre>
                </details>
              ))}
            </div>
          )}
          <div className="set-row" style={{ marginTop: 'var(--sp-3)' }}>
            <button type="button" className="btn-ghost" disabled={errBusy} onClick={() => void refreshErrors()}>
              {errBusy ? '读取中…' : '↻ 刷新'}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={errors.length === 0}
              onClick={() => {
                const stamp = monthLocal(new Date()).replace('-', '') + String(new Date().getDate()).padStart(2, '0')
                downloadFile(`pwork-错误日志-${stamp}.md`, formatErrorLog(errors), 'text/markdown')
              }}
            >
              ⬇ 导出
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={errors.length === 0}
              onClick={async () => {
                if (!window.confirm(`确定清空 ${errors.length} 条错误日志？导出过的内容不受影响。`)) return
                await clearErrors()
                await refreshErrors()
              }}
            >
              清空
            </button>
            {errors.length > 0 && (
              <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
                显示最近 50 条
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="set-card">
        <h2>云端同步</h2>
        <div className="desc">Cloudflare Worker 定时抓取 → 本地拉取合并；云端数据随时可丢可重建，本地才是你的真实数据。不确定自己需不需要？<Link to="/help">看帮助 → 配置指南</Link>——不配云端，一切功能照常</div>
        <div className="set-body">
          <div className="set-row">
            <label>模式</label>
            <div className="radio" role="radiogroup" aria-label="同步模式">
              <button type="button" className={cloud.mode === 'd1' ? 'on' : ''} onClick={() => saveCloud({ ...cloud, mode: 'd1' })}>
                D1 直连（大陆推荐）
              </button>
              <button type="button" className={cloud.mode === 'endpoint' ? 'on' : ''} onClick={() => saveCloud({ ...cloud, mode: 'endpoint' })}>
                端点（workers.dev）
              </button>
            </div>
          </div>

          {cloud.mode === 'endpoint' ? (
            <>
              <div className="set-row">
                <label>同步端点</label>
                <input
                  className="input"
                  placeholder="https://pwork-collect.你的子域.workers.dev"
                  value={cloud.endpoint}
                  onChange={(e) => setCloud({ ...cloud, endpoint: e.target.value })}
                  onBlur={() => saveCloud(cloud)}
                  aria-label="同步端点"
                />
              </div>
              <div className="set-row">
                <label>访问 Token</label>
                <input
                  className="input"
                  type="password"
                  placeholder="wrangler.toml 中的 TOKEN（只存 localStorage）"
                  value={cloud.token}
                  onChange={(e) => setCloud({ ...cloud, token: e.target.value })}
                  aria-label="访问 Token"
                />
              </div>
            </>
          ) : (
            <>
              <div className="set-row">
                <label>账户 ID</label>
                <input
                  className="input"
                  value={cloud.accountId}
                  placeholder="32 位串（dash 首页右侧 / worker\wrangler.toml 附近）"
                  onChange={(e) => setCloud({ ...cloud, accountId: e.target.value })}
                  aria-label="账户 ID"
                />
              </div>
              <div className="set-row">
                <label>数据库 ID</label>
                <input
                  className="input"
                  value={cloud.databaseId}
                  placeholder="worker\wrangler.toml 里 database_id"
                  onChange={(e) => setCloud({ ...cloud, databaseId: e.target.value })}
                  aria-label="数据库 ID"
                />
              </div>
              <div className="set-row">
                <label>API Token</label>
                <input
                  className="input"
                  type="password"
                  placeholder="只存 localStorage"
                  value={cloud.token}
                  onChange={(e) => setCloud({ ...cloud, token: e.target.value })}
                  aria-label="D1 API Token"
                />
              </div>
              <div className="notice" style={{ marginBottom: 'var(--sp-2)' }}>
                <b>创建 Token（约 2 分钟）</b>：① 打开 <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer noopener">dash.cloudflare.com/profile/api-tokens</a> → 创建令牌 → 自定义令牌；② 权限选「账户 → D1 → 编辑」，账户资源选你的账户；③ 继续 → 创建，复制只显示一次的 Token 粘到上面。账户/数据库 ID 可从 <code>worker\wrangler.toml</code> 抄。
              </div>
            </>
          )}

          <div className="set-row">
            <label>同步</label>
            <button type="button" className="btn-primary" disabled={cloudBusy} onClick={() => void doSync()} data-testid="cloud-sync">
              {cloudBusy ? '⟳ 同步中…' : '⬇ 立即同步'}
            </button>
            <button type="button" className="btn-ghost" disabled={cloudBusy} onClick={() => void doPush()}>
              ⬆ 推送信源清单
            </button>
            <button type="button" className="btn-ghost" disabled={cloudBusy} onClick={() => void doIngest()} data-testid="ingest-pull">
              ⬇ 拉取推送数据
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={cloudBusy}
              onClick={async () => {
                saveCloud(cloud)
                setCloudBusy(true)
                setCloudMsg(null)
                try {
                  const r = await testConnection()
                  setCloudMsg(`${r.ok ? '✅ ' : '❌ '}${r.message}`)
                } finally {
                  setCloudBusy(false)
                }
              }}
              data-testid="cloud-test"
            >
              测试连接
            </button>
            <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
              {lastSync ? `上次同步：${fmtLocal(lastSync)}` : '从未同步'}
            </span>
          </div>
          {cloudMsg && (
            <div className="run-banner" style={{ marginTop: 'var(--sp-3)' }} data-testid="cloud-msg" role="status">
              {cloudMsg}
            </div>
          )}
          <div className="notice" style={{ marginTop: 'var(--sp-3)' }}>
            cron 在云端服务器按计划抓取（不需要你的网络可达 workers.dev）；D1 直连模式绕过 workers.dev 域名阻断，走实测可达的 api.cloudflare.com。部署与配置详见 <code>worker/README.md</code>。
          </div>
        </div>
      </div>

      <div className="set-card">
        <h2>AI · BYOK</h2>
        <div className="desc">自带 Key，全工作台共用一把（复盘 AI 教练 / 全库问答 / 采集筛选）；失败自动回落规则引擎</div>
        <div className="set-body">
          <div className="set-row">
            <label>模式</label>
            <div className="radio">
              <button type="button" className={ai.mode === 'rule' ? 'on' : ''} onClick={() => saveAi({ ...ai, mode: 'rule' })}>规则引擎</button>
              <button type="button" className={ai.mode === 'llm' ? 'on' : ''} onClick={() => saveAi({ ...ai, mode: 'llm' })}>LLM（BYOK）</button>
            </div>
          </div>
          {ai.mode === 'llm' && (
            <>
              <div className="set-row">
                <label>接入方式</label>
                <div className="radio">
                  <button type="button" className={ai.viaGateway ? 'on' : ''} onClick={() => saveAi({ ...ai, viaGateway: true, gatewayUrl: ai.gatewayUrl || 'http://127.0.0.1:8788' })}>本地网关（推荐）</button>
                  <button type="button" className={!ai.viaGateway ? 'on' : ''} onClick={() => saveAi({ ...ai, viaGateway: false })}>浏览器直连</button>
                </div>
                <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                  {ai.viaGateway ? 'Key 只存本机 .env.local，浏览器接触不到' : 'Key 明文存 localStorage，仅限本机个人使用'}
                </span>
              </div>
              {ai.viaGateway ? (
                <>
                  <div className="set-row">
                    <label>网关地址</label>
                    <input
                      className="input"
                      style={{ flex: 1 }}
                      value={ai.gatewayUrl ?? 'http://127.0.0.1:8788'}
                      aria-label="网关地址"
                      onChange={(e) => saveAi({ ...ai, gatewayUrl: e.target.value })}
                    />
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={async () => {
                        setAiTesting(true)
                        setAiTestMsg('')
                        try {
                          const base = (ai.gatewayUrl || 'http://127.0.0.1:8788').replace(/\/+$/, '')
                          const r = await fetch(`${base}/health`)
                          const j = (await r.json()) as { ok?: boolean; chatConfigured?: boolean }
                          setAiTestOk(Boolean(j.ok && j.chatConfigured))
                          setAiTestMsg(j.ok && j.chatConfigured ? '网关在线，Key 已配置' : '网关在线，但 .env.local 还没配置 PWORK_LLM_API_KEY')
                        } catch {
                          setAiTestOk(false)
                          setAiTestMsg(isDesktopApp() ? '无法连接网关——重启应用后再试' : '无法连接网关——先在 app 目录运行 npm run gateway')
                        } finally {
                          setAiTesting(false)
                        }
                      }}
                    >
                      {aiTesting ? '检测中…' : '测试网关'}
                    </button>
                  </div>
                  {aiTestMsg && (
                    <div className="set-row">
                      <span className="val" style={{ fontSize: 'var(--fs-xs)', color: aiTestOk ? 'var(--ok)' : 'var(--danger)' }}>{aiTestMsg}</span>
                    </div>
                  )}
                  <div className="set-row">
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={usageBusy}
                      onClick={async () => {
                        setUsageBusy(true)
                        setUsageMsg('')
                        try {
                          const base = (ai.gatewayUrl || 'http://127.0.0.1:8788').replace(/\/+$/, '')
                          const r = await fetch(`${base}/usage`)
                          const j = (await r.json()) as { calls?: number; tokens?: number; byModel?: Record<string, number>; since?: string | null }
                          const models = Object.entries(j.byModel ?? {})
                            .map(([m, t]) => `${m}：${t.toLocaleString()} tokens`)
                            .join('；')
                          setUsageMsg(
                            j.calls
                              ? `近 30 天经网关 ${j.calls} 次调用，共 ${(j.tokens ?? 0).toLocaleString()} tokens。${models}`
                              : '还没有经网关调用的记录（直连模式的用量不在此统计）',
                          )
                        } catch {
                          setUsageMsg('无法读取用量——网关需为记账版并正在运行（npm run gateway）')
                        } finally {
                          setUsageBusy(false)
                        }
                      }}
                    >
                      {usageBusy ? '统计中…' : '查看网关用量'}
                    </button>
                    {usageMsg && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{usageMsg}</span>}
                  </div>
                  <div className="notice" style={{ marginTop: 'var(--sp-2)' }}>
                    {isDesktopApp() ? (
                      <>网关随应用自动启动。Key 配置：在 <b>%APPDATA%/com.pwork.workbench/</b> 新建 <b>gateway.env</b>，写入一行 <b>PWORK_LLM_API_KEY=你的Key</b>（可选 <b>PWORK_LLM_BASE_URL=服务商地址</b>），重启应用生效。</>
                    ) : (
                      <>启动：app 目录运行 <b>npm run gateway</b>（仅绑定 127.0.0.1）。Key 配置：复制 <b>app/tools/.env.example</b> 为 <b>app/.env.local</b>，填写 PWORK_LLM_API_KEY 后重启网关。</>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="set-row">
                    <label>Base URL</label>
                    <input className="input" value={ai.baseURL} onChange={(e) => saveAi({ ...ai, baseURL: e.target.value })} aria-label="Base URL" />
                  </div>
                  <div className="set-row">
                    <label>API Key</label>
                    <input className="input" type="password" value={ai.apiKey} placeholder="只存 localStorage，永不进备份" onChange={(e) => saveAi({ ...ai, apiKey: e.target.value })} aria-label="API Key" />
                  </div>
                  <div className="set-row">
                    <label></label>
                    <button type="button" className="btn-ghost" disabled={aiTesting} onClick={() => void testAi()} data-testid="ai-test">
                      {aiTesting ? '测试中…' : '测试连接'}
                    </button>
                    {aiTestMsg && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: aiTestOk ? 'var(--ok)' : 'var(--danger)' }}>{aiTestMsg}</span>}
                  </div>
                </>
              )}
              <div className="set-row">
                <label>模型</label>
                <input className="input" value={ai.model} onChange={(e) => saveAi({ ...ai, model: e.target.value })} aria-label="模型" />
              </div>
            </>
          )}
          <div className="notice" style={{ marginTop: 'var(--sp-3)' }}>
            <b>L2 外发明示</b>：LLM 模式下，被你主动调用的内容（提问、措辞检查、采集评分的字段）将发往上方配置的服务商；其余数据一律留在本机（L1）。网关模式下 Key 只存本机 .env.local，浏览器不接触。拔掉 AI，规则引擎兜底，产品完整可用。
          </div>
        </div>
      </div>

      <div className="set-card">
        <h2>关于</h2>
        <div className="desc">本地优先的四模块个人操作系统 · 数据只属于你</div>
        <div className="set-body">
          <div className="set-row">
            <label>版本</label>
            <span className="val">v1.0 · 四模块全量可用（输入 / 处理 / 输出 / 回路）</span>
          </div>
          <div className="set-row">
            <label>进度</label>
            <span className="val">速记、信息日报、任务/目标、报告导出、文章草稿、复盘、案例工作台均已上线；数据视频为远期规划</span>
          </div>
          <div className="set-row">
            <label>快捷键</label>
            <span className="val">
              <kbd>N</kbd> 速记浮层 · <kbd>Ctrl K</kbd> / <kbd>/</kbd> 命令面板 · 浮层内 <kbd>Esc</kbd> 存草稿
            </span>
          </div>
          <div className="set-row">
            <label>设计系统</label>
            <span className="val"><a href="#/design">组件样例页 /design</a></span>
          </div>
        </div>
      </div>
    </section>
  )
}
