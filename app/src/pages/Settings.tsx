import { Link, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { downloadFile } from '../db/repo'
import { importBundle } from '../db/backup'
import { syncFromCloud, pushSourcesToCloud, loadCloudConfig, saveCloudConfig, lastSyncAt, testConnection, syncIngestBlocks, type CloudConfig } from '../db/cloudSync'
import { useNotes } from '../store/notes'
import { useCollect, buildBackupBundle } from '../store/collect'
import { useTasks } from '../store/tasks'
import { useGoals } from '../store/goals'
import { useUi } from '../store/ui'
import { loadCoachConfig, saveCoachConfig, llmConfigFrom, type CoachConfig } from '../modules/review/engine/coach'
import { chatCompletion } from '../modules/review/engine/llm'
import { fmtLocal, monthLocal } from '../engine/datetime'
import { listErrors, clearErrors, formatErrorLog, type ErrorKind } from '../engine/errorLog'
import { loadAutoBackup, saveAutoBackup, customBackupDirSupported, pickBackupDir, clearBackupDir, getBackupDirName } from '../engine/autoBackup'
import { isDesktopApp } from '../engine/platform'
import { refreshInterestProfile, PROFILE_MIN_WANTS } from '../engine/interestProfile'
import { deviceId, loadSyncConfig, saveSyncConfig, syncNow, type SyncConfig } from '../db/syncRecords'
import type { ErrorLogEntry } from '../types/models'
import type { ThemePref } from '../engine/appearance'
import { SettingsNav } from '../components/shell/SettingsNav'

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

const SETTINGS_TABS = [
  { id: 'appearance', label: '外观', icon: 'appearance' },
  { id: 'data', label: '数据', icon: 'data' },
  { id: 'collect', label: '采集偏好', icon: 'collect' },
  { id: 'errors', label: '错误日志', icon: 'errors' },
  { id: 'cloud', label: '云端同步', icon: 'cloud' },
  { id: 'ai', label: 'AI', icon: 'ai' },
  { id: 'about', label: '关于', icon: 'about' },
] as const

/** 设置页（VS Code / GitHub 同款布局）：左侧分类导航 + 右侧当前分类全宽内容 */
export function Settings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = SETTINGS_TABS.find((t) => t.id === searchParams.get('tab'))?.id ?? 'appearance'
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  const noteCount = useNotes((s) => s.notes.length)
  const trashCount = useNotes((s) => s.trash.length)
  const { config, setConfig, sources, items } = useCollect()
  const [lastBackup, setLastBackup] = useState<string | null>(
    () => localStorage.getItem('pwork-last-backup'),
  )
  const [autoBk, setAutoBk] = useState(() => loadAutoBackup())
  // 自定义备份目录（FS Access）：文件夹句柄存 IndexedDB，这里只持有名字做展示
  const [backupDirName, setBackupDirName] = useState<string | null>(null)
  const [bkMsg, setBkMsg] = useState('')
  useEffect(() => {
    void getBackupDirName().then(setBackupDirName)
  }, [])
  const setAutoBackup = (patch: Partial<typeof autoBk>) => {
    const next = { ...autoBk, ...patch }
    setAutoBk(next)
    saveAutoBackup(next)
  }
  const [interestDraft, setInterestDraft] = useState('')
  const [dislikeDraft, setDislikeDraft] = useState('')
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [cloud, setCloud] = useState<CloudConfig>(() => loadCloudConfig())
  const [cloudMsg, setCloudMsg] = useState<string | null>(null)
  const [cloudBusy, setCloudBusy] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(() => lastSyncAt())

  // 错误日志（2026-10 用户要求：出错立即暴露 + 可查"哪里发生了什么"）——默认只看最近 5 条，其余折叠
  const [errors, setErrors] = useState<ErrorLogEntry[]>([])
  const [errBusy, setErrBusy] = useState(false)
  const [errExpanded, setErrExpanded] = useState(false)
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

  // AI 兴趣画像（2026-10-20 第一性重设计：投票 → AI 归纳词表，替代权重手调/星级统计那一层）
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')

  const saveCloud = (next: CloudConfig) => {
    setCloud(next)
    saveCloudConfig(next)
  }

  // 设备同步（记录级增量，2026-10-19 替换镜像档 1）
  const [sync, setSyncState] = useState(() => loadSyncConfig())
  const [syncBusy, setSyncBusy] = useState(false)
  const setSync = (next: SyncConfig) => {
    setSyncState(next)
    saveSyncConfig(next)
  }
  const doDeviceSync = async () => {
    setSyncBusy(true)
    setCloudMsg(null)
    try {
      const { pull, push } = await syncNow()
      const changed = pull.merged ?? 0
      if (changed > 0 || pull.configApplied) {
        await Promise.all([useNotes.getState().load(), useCollect.getState().load(), useTasks.getState().load(), useGoals.getState().load()])
      }
      setSync({ ...sync, lastSyncAt: new Date().toISOString(), lastPushed: push.pushed, lastPulled: pull.pulled })
      setCloudMsg(`同步完成：拉取 ${pull.pulled} 条（合并 ${changed} 条${pull.configApplied ? '，采集配置已更新' : ''}），推送 ${push.pushed} 条增量`)
    } catch (e) {
      setCloudMsg(`设备同步失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSyncBusy(false)
    }
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
      setCloudMsg(r.ok ? `推送数据已拉取：新 ${r.pulled} 块（在 输出 → 周报导出 → 外部数据块 查看）` : `拉取失败：${r.error}`)
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
  /** 网关侧固定的模型（PWORK_LLM_MODEL）：设了则浏览器端的模型字段不生效，明示避免困惑 */
  const [pinnedModel, setPinnedModel] = useState<string | null>(null)
  useEffect(() => {
    if (!ai.viaGateway) return
    const base = (ai.gatewayUrl || 'http://127.0.0.1:8788').replace(/\/+$/, '')
    void fetch(`${base}/health`)
      .then((r) => r.json())
      .then((j: { model?: string | null }) => setPinnedModel(j.model ?? null))
      .catch(() => setPinnedModel(null))
  }, [ai.viaGateway, ai.gatewayUrl])
  const saveAi = (next: CoachConfig) => {
    setAi(next)
    saveCoachConfig(next)
  }
  const testAi = async () => {
    setAiTesting(true)
    setAiTestMsg('')
    try {
      const reply = await chatCompletion(llmConfigFrom(ai), '你是连通性测试器。', '回复 ok 即可。', { maxTokens: 512, timeoutMs: 15000 })
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
    <section className="settings-page">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>设置</h1>
        <span className="sub">凭据只存本机，永不进备份</span>
        <div className="right">
          <Link to="/welcome" className="btn-ghost">↩ 首访引导</Link>
        </div>
      </div>

      <div className="settings-layout">
        <SettingsNav
          tabs={SETTINGS_TABS}
          active={tab}
          onSelect={(id) => setSearchParams({ tab: id }, { replace: true })}
          ariaLabel="设置分类"
        />

        <div className="settings-content">
      <div className="set-card" data-tab="appearance" style={{ display: tab === 'appearance' ? undefined : 'none' }}>
        <h2>外观</h2>
        <div className="desc">选择明亮或暗色；「跟随系统」随电脑设置自动切换</div>
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

      <div className="set-card" data-tab="data" style={{ display: tab === 'data' ? undefined : 'none' }}>
        <h2>数据</h2>
        <div className="desc">全量导出、导入、自动备份与备份位置——换机迁移也从这里走</div>
        <div className="set-body">
          {(noteCount > 0 || sources.length > 0 || items.length > 0 || trashCount > 0) && (
            <div className="notice" style={{ marginBottom: 'var(--sp-3)' }}>
              <b>换电脑 / 换浏览器 / 换到桌面版时</b>：① 在当前环境的这一页点「全量导出」，会得到一个 JSON 备份文件；② 在新环境这一页点「导入」选中该文件，所有数据合并进来（相同的按时间新者为准）。
            </div>
          )}
          <div className="set-row">
            <label>全量备份</label>
            <button type="button" className="btn-primary" onClick={() => void doExport()}>
              全量导出
            </button>
              <label className="btn-ghost" style={{ cursor: 'pointer' }} title="可导入本应用的备份文件，也兼容 FUPAN 旧版导出">
                导入
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
              速记 {noteCount} 条 · 信源 {sources.length} 个 · 条目 {items.length} 条（近30天）· 回收站 {trashCount} · 备份格式 v2
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
                ? `到期后打开应用自动备份${isDesktopApp() ? '到应用数据目录的 backups 文件夹' : backupDirName ? `到「${backupDirName}」文件夹` : '到浏览器下载文件夹'}${autoBk.lastAt ? `（上次自动备份：${fmtLocal(autoBk.lastAt)}）` : '（还没备份过，下次打开应用时执行）'}`
                : '本地优先应用，建议开启——数据只存在这台电脑上'}
            </span>
          </div>
          {customBackupDirSupported() && (
            <div className="set-row">
              <label>备份位置</label>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  void pickBackupDir()
                    .then((name) => {
                      setBackupDirName(name)
                      setBkMsg(name ? `自动备份将写入「${name}」文件夹（授权一次长期有效）` : '未选择文件夹')
                    })
                    .catch(() => setBkMsg('未选择文件夹'))
                }}
              >
                选择文件夹…
              </button>
              {backupDirName && (
                <>
                  <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>当前：{backupDirName}</span>
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => {
                      void clearBackupDir().then(() => {
                        setBackupDirName(null)
                        setBkMsg('已恢复为浏览器下载文件夹')
                      })
                    }}
                  >
                    恢复默认
                  </button>
                </>
              )}
              {!backupDirName && (
                <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
                  默认存到浏览器下载文件夹；选一个自己的文件夹，授权一次后自动备份直接写进去
                </span>
              )}
              {bkMsg && (
                <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-soft)' }}>{bkMsg}</span>
              )}
            </div>
          )}
          <div className="notice" style={{ marginTop: 'var(--sp-3)' }}>
            导出内容：速记、信源、条目、采集偏好、任务、目标、复盘（含行动项与洞察）、外部数据块、简历辅导数据。条目只含已评分和已保留的，未处理与已筛除的不导出。导入时相同内容按修改时间新者为准；FUPAN 旧版导出的文件也能导入。
          </div>
          {importMsg && (
            <div className="run-banner" style={{ marginTop: 'var(--sp-3)' }} data-testid="import-msg" role="status">
              {importMsg}
            </div>
          )}
        </div>
      </div>

      <div className="set-card" data-tab="collect" style={{ display: tab === 'collect' ? undefined : 'none' }}>
        <h2>采集偏好</h2>
        <div className="desc">写清你关注的领域——越相关越可能进日报；随使用随时调整</div>
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
            <label>AI 兴趣画像</label>
            <button type="button" className="btn-ghost" disabled={profileBusy} onClick={() => {
              setProfileBusy(true)
              setProfileMsg('')
              void refreshInterestProfile()
                .then((r) => setProfileMsg(r.ok ? `词表已更新：${r.words} 个关键词` : `未执行：${r.error}`))
                .catch((e) => setProfileMsg(`失败：${e instanceof Error ? e.message : String(e)}（词表未动）`))
                .finally(() => setProfileBusy(false))
            }}>
              {profileBusy ? '归纳中…' : '用「多推」投票归纳兴趣域'}
            </button>
            <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
              {profileMsg || `据信息日报里你的「多推」投票归纳（需 ≥${PROFILE_MIN_WANTS} 条；攒够后打开应用也会自动更新）`}
            </span>
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


      <div className="set-card" data-tab="errors" style={{ display: tab === 'errors' ? undefined : 'none' }}>
        <h2>错误日志</h2>
        <div className="desc">程序出错时立即记录在这里：哪里出了什么问题、技术细节，供排查迭代。上限 300 条，最旧的先删。</div>
        <div className="set-body">
          {errors.length === 0 ? (
            <div className="val" style={{ color: 'var(--ink-faint)' }}>
              {errBusy ? '读取中…' : '没有记录到错误。'}
            </div>
          ) : (
            <div className="errlog-list" data-testid="errlog-list">
              {(errExpanded ? errors : errors.slice(0, 5)).map((e) => (
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
              {errors.length > 5 && (
                <button
                  type="button"
                  className="mini-btn"
                  style={{ marginTop: 'var(--sp-2)' }}
                  onClick={() => setErrExpanded((v) => !v)}
                >
                  {errExpanded ? `收起（只看最近 5 条）` : `展开全部 ${errors.length} 条`}
                </button>
              )}
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
              导出
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

      <div className="set-card" data-tab="cloud" style={{ display: tab === 'cloud' ? undefined : 'none' }}>
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
              {cloudBusy ? '同步中…' : '立即同步'}
            </button>
            <button type="button" className="btn-ghost" disabled={cloudBusy} onClick={() => void doPush()}>
              推送信源清单
            </button>
            <button type="button" className="btn-ghost" disabled={cloudBusy} onClick={() => void doIngest()} data-testid="ingest-pull">
              拉取推送数据
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
                  setCloudMsg(`${r.ok ? '' : ''}${r.message}`)
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

          <h3 style={{ fontSize: 'var(--fs-md)', margin: 'var(--sp-4) 0 0' }}>设备同步（手机 / 电脑数据一致 · 记录级增量）</h3>
          <div className="desc">每台设备都能读能写：打开应用自动"先拉后推"，只传各自变过的记录，相同记录按修改时间新者为准——没有"主从设备"之分</div>
          <div className="set-row" style={{ marginTop: 'var(--sp-2)' }}>
            <label>同步开关</label>
            <div className="radio" role="radiogroup" aria-label="设备同步开关">
              <button type="button" className={sync.enabled ? 'on' : ''} onClick={() => setSync({ ...sync, enabled: true })} aria-pressed={sync.enabled}>开</button>
              <button type="button" className={!sync.enabled ? 'on' : ''} onClick={() => setSync({ ...sync, enabled: false })} aria-pressed={!sync.enabled}>关</button>
            </div>
            <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
              {sync.enabled ? '打开应用自动同步；首批是全量初始化，之后每轮只传增量' : '关着就完全不动'}
            </span>
          </div>
          <div className="set-row">
            <label>本机标识</label>
            <span className="val tnum">{deviceId()}</span>
            <button type="button" className="btn-primary" disabled={syncBusy} onClick={() => void doDeviceSync()} data-testid="device-sync">
              {syncBusy ? '同步中…' : '⇄ 立即同步'}
            </button>
            <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
              {sync.lastSyncAt ? `上次 ${fmtLocal(sync.lastSyncAt)}：拉 ${sync.lastPulled} / 推 ${sync.lastPushed} 条` : '还没同步过'}
            </span>
          </div>
          <div className="notice" style={{ marginTop: 'var(--sp-2)' }}>
            <b>外发明示</b>：开启后你的数据<b>记录级</b>经你自己的 Cloudflare D1 中转（含速记/任务/调研发现等）——它只是管道，删掉云端表只断同步不丢数据，每台设备本地各有全量；需要云端同步已按 D1 直连配置。删除通过"软删除记录"传播（备份可找回）。
          </div>
        </div>
      </div>

      <div className="set-card" data-tab="ai" style={{ display: tab === 'ai' ? undefined : 'none' }}>
        <h2>AI · BYOK</h2>
        <div className="desc">自带 Key，全工作台共用一把（复盘 AI 教练 / 全库问答 / 采集筛选）；AI 不可用时自动改用规则评分</div>
        <div className="set-body">
          <div className="set-row">
            <label>模式</label>
            <div className="radio">
              <button type="button" className={ai.mode === 'rule' ? 'on' : ''} onClick={() => saveAi({ ...ai, mode: 'rule' })}>规则评分（不用 AI）</button>
              <button type="button" className={ai.mode === 'llm' ? 'on' : ''} onClick={() => saveAi({ ...ai, mode: 'llm' })}>AI（自带 Key）</button>
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
                {pinnedModel ? (
                  <>
                    <span className="val tnum">{pinnedModel}</span>
                    <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                      网关已固定模型（gateway.env 的 PWORK_LLM_MODEL）——下方字段不生效，换模型改网关配置
                    </span>
                  </>
                ) : null}
                <input
                  className="input"
                  value={ai.model}
                  placeholder={pinnedModel ? '（已被网关固定模型覆盖）' : '模型名'}
                  disabled={Boolean(pinnedModel)}
                  onChange={(e) => saveAi({ ...ai, model: e.target.value })}
                  aria-label="模型"
                />
              </div>
            </>
          )}
          <div className="notice" style={{ marginTop: 'var(--sp-3)' }}>
            <b>外发明示</b>：LLM 模式下，被你主动调用的内容（提问、措辞检查、采集评分的字段）将发往上方配置的服务商；其余数据一律留在本机。网关模式下 Key 只存本机 .env.local，浏览器不接触。拔掉 AI，规则评分兜底，产品完整可用。
          </div>
        </div>
      </div>

      <div className="set-card" data-tab="about" style={{ display: tab === 'about' ? undefined : 'none' }}>
        <h2>关于</h2>
        <div className="desc">本地优先的四模块个人操作系统 · 数据只属于你</div>
        <div className="set-body">
          <div className="set-row">
            <label>版本</label>
            <span className="val">v1.0 · 四模块全量可用（输入 / 处理 / 输出 / 回路）</span>
          </div>
          <div className="set-row">
            <label>进度</label>
            <span className="val">速记、信息日报、任务/目标、报告导出、文章草稿、调研分析、复盘均已上线；数据视频为远期规划</span>
          </div>
          <div className="set-row">
            <label>帮助</label>
            <span className="val">快捷键、术语表、配置指南都在 <a href="#/help">帮助页</a></span>
          </div>
        </div>
      </div>
        </div>
      </div>
    </section>
  )
}
