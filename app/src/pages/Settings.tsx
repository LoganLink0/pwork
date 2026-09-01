import { Link } from 'react-router-dom'
import { useState } from 'react'
import { downloadFile } from '../db/repo'
import { importBundle } from '../db/backup'
import { syncFromCloud, pushSourcesToCloud, loadCloudConfig, saveCloudConfig, lastSyncAt, testConnection, type CloudConfig } from '../db/cloudSync'
import { useNotes } from '../store/notes'
import { useCollect, buildBackupBundle } from '../store/collect'
import { useTasks } from '../store/tasks'
import { useUi } from '../store/ui'
import { loadCoachConfig, saveCoachConfig, llmConfigFrom, type CoachConfig } from '../modules/review/engine/coach'
import { chatCompletion } from '../modules/review/engine/llm'
import { fmtLocal, monthLocal } from '../engine/datetime'
import type { ThemePref } from '../engine/appearance'

const THEMES: { key: ThemePref; label: string }[] = [
  { key: 'auto', label: '跟随系统' },
  { key: 'light', label: '明亮' },
  { key: 'dark', label: '暗色' },
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
  const [interestDraft, setInterestDraft] = useState('')
  const [dislikeDraft, setDislikeDraft] = useState('')
  const [contextDraft, setContextDraft] = useState<string | null>(null)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [cloud, setCloud] = useState<CloudConfig>(() => loadCloudConfig())
  const [cloudMsg, setCloudMsg] = useState<string | null>(null)
  const [cloudBusy, setCloudBusy] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(() => lastSyncAt())

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

  // AI · BYOK（全工作台一把钥匙：fupan-coach 配置复用，02 §4 凭据只存 localStorage）
  const [ai, setAi] = useState<CoachConfig>(() => loadCoachConfig())
  const [aiTesting, setAiTesting] = useState(false)
  const [aiTestMsg, setAiTestMsg] = useState('')
  const [aiTestOk, setAiTestOk] = useState(false)
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
              placeholder="我在做……关注……（进入 AI 评分提示词，W4 生效；当前作备忘）"
              onChange={(e) => setContextDraft(e.target.value)}
              onBlur={() => contextDraft !== null && setConfig({ context: contextDraft })}
            />
          </div>
          <div className="set-row">
            <label>评分权重</label>
            <span className="val">source .30 · novelty .25 · relevance .25 · utility .20　<span style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>（C1 规则近似；权重随星级反馈人工调参，不训练模型）</span></span>
          </div>
          <div className="set-row">
            <label>每日 Top N</label>
            <input className="input" style={{ maxWidth: 120 }} readOnly value={`${config.topN}（只读）`} />
            <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>推送量是产品设计，不是用户设置（04 §8）</span>
          </div>
        </div>
      </div>

      <div className="set-card">
        <h2>云端同步（C2）</h2>
        <div className="desc">Cloudflare Worker 定时抓取 → 本地拉取合并；云端数据随时可丢可重建，本地才是你的真实数据</div>
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
                <label>Base URL</label>
                <input className="input" value={ai.baseURL} onChange={(e) => saveAi({ ...ai, baseURL: e.target.value })} aria-label="Base URL" />
              </div>
              <div className="set-row">
                <label>模型</label>
                <input className="input" value={ai.model} onChange={(e) => saveAi({ ...ai, model: e.target.value })} aria-label="模型" />
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
          <div className="notice" style={{ marginTop: 'var(--sp-3)' }}>
            <b>L2 外发明示</b>：LLM 模式下，被你主动调用的内容（提问、措辞检查、采集评分的字段）将发往上方配置的服务商；其余数据一律留在本机（L1）。Key 只存 localStorage，永不进入导出备份。拔掉 AI，规则引擎兜底，产品完整可用。
          </div>
        </div>
      </div>

      <div className="set-card">
        <h2>关于</h2>
        <div className="desc">本地优先的四模块个人操作系统 · 数据只属于你</div>
        <div className="set-body">
          <div className="set-row">
            <label>版本</label>
            <span className="val">W1 · 壳 + 速记 + 设计系统（对应 PRD v1.0）</span>
          </div>
          <div className="set-row">
            <label>里程碑</label>
            <span className="val">W2 采集 C1 → W3 迁入+任务库 → W4 上云+联动 → W5 自动化</span>
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
