import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadCloudConfig, saveCloudConfig, lastSyncAt, testConnection, syncFromCloud, pushSourcesToCloud, syncIngestBlocks, getScheduleHours, pushScheduleHours, type CloudConfig } from '../db/cloudSync'
import { deviceId, loadSyncConfig, saveSyncConfig, syncNow, pullChangedRecords, type SyncConfig } from '../db/syncRecords'
import { fmtLocal } from '../engine/datetime'
import { recordError } from '../engine/errorLog'
import { useNotes } from '../store/notes'
import { useCollect } from '../store/collect'
import { useTasks } from '../store/tasks'
import { useGoals } from '../store/goals'

/**
 * 设置 → 云端同步（2026-10-28 归位用户拍板：在设置的左侧分类导航里拆一项，不占侧栏工作区）。
 * 只放云端专属的事：连接配置、同步动作、抓取时间、设备同步。
 * 采集偏好不在这一页：本地 设置 → 采集偏好 是唯一入口，那边带「同步到云端」。
 */
export function CloudSyncCards({ active }: { active: boolean }) {
  const [cloud, setCloud] = useState<CloudConfig>(() => loadCloudConfig())
  const [cloudMsg, setCloudMsg] = useState<string | null>(null)
  const [cloudBusy, setCloudBusy] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(() => lastSyncAt())
  const [scheduleDraft, setScheduleDraft] = useState('')
  const [sync, setSyncState] = useState<SyncConfig>(() => loadSyncConfig())
  const [syncBusy, setSyncBusy] = useState(false)

  const saveCloud = (next: CloudConfig) => {
    setCloud(next)
    saveCloudConfig(next)
  }
  const setSync = (next: SyncConfig) => {
    setSyncState(next)
    saveSyncConfig(next)
  }

  // 进到云端同步分类时拉一次抓取时间（组件随设置页常驻挂载，必须在 active 变化时拉，
  // 否则挂载即拉一次失败后就不再拉——用户配置好云端切进来输入框仍是空）。
  // 防重入用 ref：它是流程标记，不该参与渲染
  const scheduleLoadedRef = useRef(false)
  useEffect(() => {
    if (!active || scheduleLoadedRef.current) return
    scheduleLoadedRef.current = true
    void getScheduleHours().then((r) => {
      if (r.ok && r.hours) setScheduleDraft(r.hours.join(','))
    })
  }, [active])

  const doSync = async () => {
    setCloudBusy(true)
    setCloudMsg(null)
    try {
      const r = await syncFromCloud()
      setCloudMsg(r.ok ? `同步完成：新 ${r.newCount} 条 · 跳过 ${r.skipCount} 条（按指纹去重）` : `同步失败：${r.error}`)
      if (!r.ok) void recordError({ where: '云端同步.拉取', kind: 'app', message: `同步失败：${r.error}` }, { silent: true })
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
      if (!r.ok) void recordError({ where: '云端同步.推信源', kind: 'app', message: `推送失败：${r.error}` }, { silent: true })
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
      const message = e instanceof Error ? e.message : String(e)
      setCloudMsg(`设备同步失败：${message}`)
      void recordError({ where: '云端同步.设备同步', kind: 'app', message: `设备同步失败：${message}` }, { silent: true })
    } finally {
      setSyncBusy(false)
    }
  }

  // 全量拉取（0.3h）：无视水位线把云端同步记录全部拉一遍合并——设备重建/长时间未同步后的一次性兜底
  const doFullPull = async () => {
    setSyncBusy(true)
    setCloudMsg(null)
    try {
      const pull = await pullChangedRecords({ full: true })
      const changed = pull.merged ?? 0
      if (changed > 0 || pull.configApplied) {
        await Promise.all([useNotes.getState().load(), useCollect.getState().load(), useTasks.getState().load(), useGoals.getState().load()])
      }
      setSync({ ...sync, lastSyncAt: new Date().toISOString(), lastPulled: pull.pulled })
      setCloudMsg(`全量拉取完成：云端共 ${pull.pulled} 条，合并 ${changed} 条${pull.configApplied ? '，采集配置已更新' : ''}`)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setCloudMsg(`全量拉取失败：${message}`)
      void recordError({ where: '云端同步.全量拉取', kind: 'app', message: `全量拉取失败：${message}` }, { silent: true })
    } finally {
      setSyncBusy(false)
    }
  }

  return (
    <div data-tab="cloud" style={{ display: active ? undefined : 'none' }}>
      <div className="set-card">
        <h2>连接</h2>
        <div className="desc">
          不确定自己需不需要云端？<Link to="/help">看帮助 → 配置指南</Link>——不配云端，一切功能照常。
          <b>大陆网络建议用 D1 直连</b>（workers.dev 域名常被阻断）。
        </div>
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
                  placeholder="部署向导结尾给你的 Token（只存本机）"
                  value={cloud.token}
                  onChange={(e) => { const next = { ...cloud, token: e.target.value }; setCloud(next); saveCloud(next) }}
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
                  placeholder="32 位串（Cloudflare 控制台首页右侧）"
                  onChange={(e) => { const next = { ...cloud, accountId: e.target.value }; setCloud(next); saveCloud(next) }}
                  aria-label="账户 ID"
                />
              </div>
              <div className="set-row">
                <label>数据库 ID</label>
                <input
                  className="input"
                  value={cloud.databaseId}
                  placeholder="部署向导建库后自动生成"
                  onChange={(e) => { const next = { ...cloud, databaseId: e.target.value }; setCloud(next); saveCloud(next) }}
                  aria-label="数据库 ID"
                />
              </div>
              <div className="set-row">
                <label>API Token</label>
                <input
                  className="input"
                  type="password"
                  placeholder="按下方指引在 Cloudflare 控制台创建（只显示一次）"
                  value={cloud.token}
                  onChange={(e) => { const next = { ...cloud, token: e.target.value }; setCloud(next); saveCloud(next) }}
                  aria-label="API Token"
                />
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
          </div>
          <div className="set-row">
            <label>连通</label>
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
                  setCloudMsg(r.message)
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
          {cloud.mode === 'd1' && (
            <div className="notice" style={{ marginTop: 'var(--sp-3)' }}>
              <b>创建 API Token（约 2 分钟）</b>：① 打开 <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer noopener">dash.cloudflare.com/profile/api-tokens</a> → 创建令牌 → 自定义令牌；② 权限选「账户 → D1 → 编辑」，账户资源选你的账户；③ 继续 → 创建，复制只显示一次的 Token 粘到上面。
            </div>
          )}
        </div>
      </div>

      <div className="set-card">
        <h2>云端抓取时间</h2>
        <div className="desc">云端 7×24 按北京时间整点自动抓信源，在这里改即生效，不用重新部署</div>
        <div className="set-body">
          <div className="set-row">
            <label>抓取整点</label>
            <input
              className="input"
              style={{ maxWidth: 260 }}
              placeholder="如 9,12,18,20,23（北京时间整点）"
              value={scheduleDraft}
              onChange={(e) => setScheduleDraft(e.target.value)}
              aria-label="云端抓取时间（北京时间整点，逗号分隔）"
            />
            <button
              type="button"
              className="btn-ghost"
              disabled={cloudBusy}
              onClick={async () => {
                const hours = scheduleDraft.split(/[,，\s]+/).map((s) => Number(s.trim())).filter((n) => Number.isInteger(n))
                setCloudBusy(true)
                setCloudMsg(null)
                const r = await pushScheduleHours(hours)
                setCloudMsg(r.message)
                setCloudBusy(false)
              }}
            >
              保存抓取时间
            </button>
          </div>
        </div>
      </div>

      <div className="set-card">
        <h2>设备同步</h2>
        <div className="desc">手机 / 电脑数据一致（记录级增量）：每台设备都能读能写，打开应用自动「先拉后推」，只传各自变过的记录，相同记录按修改时间新者为准——没有「主从设备」之分</div>
        <div className="set-body">
          <div className="set-row">
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
            <button
              type="button"
              className="btn-ghost"
              disabled={syncBusy}
              title="无视增量水位，把云端全部同步记录拉一遍合并。设备重建或怀疑漏数据时用；日常同步不必点"
              onClick={() => {
                if (!window.confirm('从云端全量拉取所有同步记录并合并？数据按修改时间新者为准，不会丢失本机较新的修改。')) return
                void doFullPull()
              }}
            >
              从云端全量拉取
            </button>
            <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
              {sync.lastSyncAt ? `上次 ${fmtLocal(sync.lastSyncAt)}：拉 ${sync.lastPulled} / 推 ${sync.lastPushed} 条` : '还没同步过'}
            </span>
          </div>
          <div className="notice" style={{ marginTop: 'var(--sp-2)' }}>
            <b>外发明示</b>：开启后你的数据<b>记录级</b>经你自己的 Cloudflare D1 中转（含速记/任务/调研发现等）——它只是管道，删掉云端表只断同步不丢数据，每台设备本地各有全量；需要上方已按 D1 直连配置。删除通过「软删除记录」传播（备份可找回）。
          </div>
        </div>
      </div>
    </div>
  )
}
