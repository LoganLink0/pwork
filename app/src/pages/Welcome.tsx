import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MODULES } from '../content/help'
import { SOURCE_CATALOG, DOMAINS } from '../content/collect'
import { loadCloudConfig, saveCloudConfig, syncFromCloud, d1Query } from '../db/cloudSync'
import { useCollect } from '../store/collect'
import { SourceCatalog } from '../components/collect/SourceCatalog'
import { KbdText } from '../components/shell/KbdText'
import { isDesktopApp } from '../engine/platform'
import { WHEEL_LABEL_DISPLAY } from '../engine/keybinds'
import { saveAutoBackup, loadAutoBackup } from '../engine/autoBackup'
import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { listen as tauriListen } from '@tauri-apps/api/event'
import { saveGatewayKeyAndTest } from '../engine/gatewayKey'
import { recordError } from '../engine/errorLog'
import {
  AI_VENDORS,
  DEFAULT_GATEWAY_URL,
  PROVIDER_PRESETS,
  loadCoachConfig,
  probeGateway,
  saveCoachConfig,
  type CoachProvider,
} from '../modules/review/engine/coach'

/**
 * 首访引导（/welcome）：宽卡左右分栏（2026-10-26 第三次返工定稿，VISUALMASTER 纪律）。
 * intent: 布局=左右分栏宽卡；主次：页面利用率优先，信息密度靠分栏摊薄。
 * 不变量：左栏模块说明与右栏视频卡同序同线；组块=组标题+紧凑内容（亲密）；
 * 步骤标记在卡外顶部 stepper（带步骤名，可点跳转），不进卡片。
 * 左栏=读区（标题/说明/提示，低密度），右栏=做区（操作组块）；第 1 步视频 2×2。
 * AI 卡与上云卡按运行环境只显示对应端的内容（桌面版/浏览器版各一套）。
 */
const STEPS = ['认识工作台', '信源初始化', '采集偏好', 'AI 功能（可选）', '可选：上云'] as const

/** 左栏文案：每步「为什么/是什么」与提示（右栏只留操作，长说明全部收进这里摊薄密度） */
const STEP_GUIDES: { title: string; desc: string; tips?: string[] }[] = [
  {
    title: '一个闭环',
    desc: '记下来 → 加工 → 成稿 → 复盘，复盘产出的行动项又回到待办。右边四个模块各配一段真实操作录屏。',
    tips: ['输入：速记浮层按 N 随手记、信息日报', `处理：Ctrl K 或 ⌘K 一次搜遍全库；桌面版 ${WHEEL_LABEL_DISPLAY} 呼出工具轮盘`, '输出：周报月报、文章、调研', '回路：CLAP 复盘、认知资产回访'],
  },
  {
    title: '挑你要读的',
    desc: `推荐信源目录里有 ${SOURCE_CATALOG.reduce((n, g) => n + g.sources.length, 0)} 个实测可用的源（${DOMAINS.length} 个领域），勾选后一次导入。不选也行，以后在信源页随时从「推荐信源目录」添加。`,
    tips: ['默认预选了各领域的精选源', '已导入过的会标注出来', '按地址去重，重复导入安全'],
  },
  {
    title: '教它你的口味',
    desc: '兴趣域给相关内容加分，屏蔽词整条滤除——信息日报的排序靠它。预置的是通用默认值，换成你自己的才有效。',
    tips: ['输入框敲字回车添加', '点胶囊即可移除'],
  },
  {
    title: '配不配都行',
    desc: '不配：信息筛选走本地规则、报告走内置模板，功能完整。配上自己在大模型厂商申请的 Key：多出 AI 复盘教练、AI 写大纲、联网调研。',
    tips: ['Key 只写进本机文件，不上传、不进备份', '保存即真实调用一次，通不通都明说'],
  },
  {
    title: '可选的进阶',
    desc: '部署你自己的 Cloudflare 云端（免费档 ¥0/月）：多设备同步 + 云端 7×24 定时抓信源。不弄也完全能用，本地抓取照常。',
    tips: ['先注册 Cloudflare：dash.cloudflare.com/sign-up（免费、无需信用卡）', '部署约 10 分钟，结束时拿到端点地址和 Token'],
  },
]

export function Welcome() {
  const navigate = useNavigate()
  const desktop = isDesktopApp()
  const [step, setStep] = useState(0)
  // 自动备份开关（第 5 步，默认勾上）：点「开始使用」才代用户开启；「跳过引导」不动配置。
  // 桌面版无配置时本就默认开启（见 loadAutoBackup），这个开关主要给浏览器版一个知情入口。
  const [autoBkOn, setAutoBkOn] = useState(true)
  const [cloud, setCloud] = useState(() => loadCloudConfig())
  const [msg, setMsg] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const { config, setConfig } = useCollect()
  const [interestDraft, setInterestDraft] = useState('')
  const [dislikeDraft, setDislikeDraft] = useState('')

  // ── AI 直配（第 4 步）：厂商选择 + Key 输入 + 保存即连接测试 ──
  const [vendor, setVendor] = useState<CoachProvider>(() => loadCoachConfig().provider)
  const [apiKey, setApiKey] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiMsg, setAiMsg] = useState<{ ok: boolean; text: string } | null>(null)
  // AI 配置的真实状态：本地存过"已配置"不代表网关进程里真有 Key（gateway.env 可能没写），
  // 网关模式下必须探测 /health 才能下结论（2026-10-26 用户实测：引导页说配好了、实际全走不通）
  const [coachCfg, setCoachCfg] = useState(() => loadCoachConfig())
  const gwMode = coachCfg.mode === 'llm' && Boolean(coachCfg.viaGateway)
  const [gwProbe, setGwProbe] = useState<'checking' | 'ok' | 'nokey' | 'offline'>('checking')
  const gwUrl = coachCfg.gatewayUrl || DEFAULT_GATEWAY_URL
  useEffect(() => {
    if (!gwMode) return
    let alive = true
    void probeGateway(gwUrl).then((p) => {
      if (!alive) return
      setGwProbe(!p.online ? 'offline' : p.chatConfigured ? 'ok' : 'nokey')
    })
    return () => {
      alive = false
    }
  }, [gwMode, gwUrl])

  // ── 一键部署（第 5 步，桌面版）：部署源码随应用打进安装目录，一键直跑 ──
  // ── 应用内部署面板状态（桌面版第五步）：running 显示步骤与日志尾行，done 自动回填凭据 ──
  type DeployPhase = 'idle' | 'running' | 'done' | 'fail'
  const [deployPhase, setDeployState] = useState<DeployPhase>('idle')
  const [deployStep, setDeployStep] = useState('')
  const [deployLogs, setDeployLogs] = useState<string[]>([])
  const backfillRef = useRef<HTMLDivElement>(null)
  const [backfillGlow, setBackfillGlow] = useState(false)
  useEffect(() => {
    if (!desktop) return
    const unsubs: Promise<() => void>[] = []
    unsubs.push(tauriListen<string>('deploy-log', (e) => {
      const l = e.payload
      setDeployLogs((ls) => [...ls.slice(-4), l])
    }))
    unsubs.push(tauriListen<string>('deploy-step', (e) => setDeployStep(e.payload)))
    unsubs.push(tauriListen<string>('deploy-fail', (e) => {
      setDeployState('fail')
      setMsg(`部署失败：${e.payload}`)
    }))
    unsubs.push(tauriListen<{ endpoint: string; token: string; account: string; db: string }>('deploy-done', (e) => {
      setDeployState('done')
      // 大陆网络 workers.dev 常被阻断——部署能拿到账户/数据库 ID 时直接切 D1 直连模式。
      // 注意两种凭据不同：部署输出的 ptk_ Token 给端点模式用；D1 直连要的是 Cloudflare
      // 控制台创建的 API Token——所以切 D1 后 token 留空，提示用户创建，绝不拿错钥匙混填
      const hasD1 = Boolean(e.payload.account && e.payload.db)
      setCloud((c) => ({
        ...c,
        mode: hasD1 ? 'd1' : c.mode,
        endpoint: e.payload.endpoint || c.endpoint,
        token: hasD1 ? '' : (e.payload.token || c.token),
        accountId: e.payload.account || c.accountId,
        databaseId: e.payload.db || c.databaseId,
      }))
      setMsg(hasD1
        ? '部署完成，云端已开始首轮抓取！账户 ID / 数据库 ID 已自动填进下方「部署完成后回来填」区——只剩 API Token 按旁边的三步指引创建（约 2 分钟），填好点「测试连接」'
        : '部署完成，云端已开始首轮抓取！端点地址和 Token 已自动填进下方「部署完成后回来填」区——点「测试连接」验证后「保存并同步」')
      // 部署按钮在页面顶部，回填区在底部——完成即滚动过去并高亮，用户不用找
      setTimeout(() => {
        backfillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setBackfillGlow(true)
        setTimeout(() => setBackfillGlow(false), 2400)
      }, 300)
    }))
    return () => { void Promise.all(unsubs).then((fns) => fns.forEach((f) => f())) }
  }, [desktop])

  /** 走完或跳过都算完成（成熟实践：skippable，不再打扰），进入主界面或所选模块页 */
  const finish = (to = '/', persistBackup = false) => {
    if (persistBackup) {
      // 走完引导的用户按开关勾选态落地自动备份（默认开）；跳过引导的人没见过开关，不动配置
      saveAutoBackup({ ...loadAutoBackup(), enabled: autoBkOn })
    }
    localStorage.setItem('pwork-welcomed', '1')
    navigate(to)
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

  /** AI 保存并测试：桌面版经 invoke 写 gateway.env（热更新），浏览器版经网关 POST /key（热更新）；
   *  写完立即经网关真实调用一轮——通/不通都通知（2026-10-26 用户要求） */
  const saveAndTestAi = async () => {
    setAiBusy(true)
    setAiMsg(null)
    const r = await saveGatewayKeyAndTest(vendor, apiKey, gwUrl)
    if (r.ok) {
      saveCoachConfig({
        ...coachCfg,
        mode: 'llm',
        provider: r.vendor ?? vendor,
        baseURL: r.baseURL ?? '',
        apiKey: '',
        model: r.model ?? '',
        viaGateway: true,
        gatewayUrl: gwUrl,
      })
      setCoachCfg(loadCoachConfig())
      setGwProbe('ok')
      setAiMsg({ ok: true, text: `连接成功：AI 复盘教练、写大纲、联网调研现在可用了（${r.message}）` })
      setApiKey('')
    } else {
      setAiMsg({ ok: false, text: r.message })
      void recordError({ where: '引导.AI测试', kind: 'app', message: `AI 连接测试失败：${r.message}` }, { silent: true })
    }
    setAiBusy(false)
  }

  /** 应用内一键部署（2026-10-27 定稿）：无终端窗口，Rust 后台跑向导全自动模式，
   *  进度经事件回流面板；本地采集偏好随部署带上云端。invoke/listen 静态引入
   *  （动态 import 的依赖预加载在 tauri.localhost 下会挂起，复盘 3.36）。 */
  const runDeploy = async () => {
    setDeployState('running')
    setDeployLogs([])
    try {
      await tauriInvoke('deploy_cloud', {
        interests: config.interests.join(','),
        dislikes: config.dislikes.join(','),
        context: '我的兴趣与屏蔽以这份配置为准',
      })
    } catch (e) {
      setDeployState('fail')
      setMsg(e instanceof Error ? e.message : String(e))
    }
  }

  const testCloud = async () => {
    setTesting(true)
    setMsg(null)
    // D1 直连模式：直接用当前输入框的值测试（不读已存配置——用户可能还没点保存）
    if (cloud.mode === 'd1') {
      if (!cloud.accountId.trim() || !cloud.databaseId.trim()) {
        setMsg('账户 ID / 数据库 ID 还没填——刚部署完会自动填好；没填上就点上面的「一键部署」或到 设置 → 云端同步 手动填')
        setTesting(false)
        return
      }
      if (!cloud.token.trim()) {
        setMsg('API Token 还没填——按回填区下面的三步指引创建（约 2 分钟），复制粘贴到这里')
        setTesting(false)
        return
      }
      try {
        const rows = await d1Query(cloud, 'SELECT count(*) AS n FROM sources', [])
        const n = (rows[0]?.n as number) ?? 0
        setMsg(`连接成功！云端已有 ${n} 个信源，点「保存并同步」完成接入`)
      } catch {
        setMsg('连不上：检查 账户 ID / 数据库 ID / API Token 是否正确（大陆网络 D1 直连走 Cloudflare 官方接口，一般可达）')
      } finally {
        setTesting(false)
      }
      return
    }
    if (!cloud.endpoint.trim()) {
      setMsg('先填写部署输出的端点地址')
      setTesting(false)
      return
    }
    try {
      const resp = await fetch(`${cloud.endpoint.replace(/\/$/, '')}/api/digest?n=1`, {
        headers: cloud.token ? { authorization: `Bearer ${cloud.token}` } : {},
      })
      setMsg(resp.ok ? '连接成功！点「保存并同步」完成接入' : `地址能访问但被拒绝（HTTP ${resp.status}）——多半是 Token 不对或还没生效，回去核对一下再试`)
    } catch {
      setMsg('连不上端点——大陆网络 workers.dev 常被阻断，建议切到 D1 直连模式（Cloudflare 官方接口，大陆可达）：填 账户 ID / 数据库 ID / API Token')
    } finally {
      setTesting(false)
    }
  }

  const saveAndSync = async () => {
    try {
      saveCloudConfig(cloud)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
      return
    }
    const r = await syncFromCloud()
    setMsg(r.ok ? `已保存并完成首次同步：新 ${r.newCount} 条（之后在 设置 → 云端同步 管理）` : `已保存；首次同步失败：${r.error ?? '云端还没有数据，部署后等一轮抓取再试'}`)
  }

  const last = step === STEPS.length - 1
  const guide = STEP_GUIDES[step]

  return (
    <div className="welcome-veil" role="dialog" aria-label="新手引导">
      <div className="welcome-stage">
        <div className="welcome-top">
          <h1 className="welcome-brand">欢迎使用 PWORK</h1>
          <nav className="welcome-steps" aria-label={`第 ${step + 1} 步，共 ${STEPS.length} 步`}>
            {STEPS.map((s, i) => (
              <button
                key={s}
                type="button"
                className={`welcome-step${i === step ? ' on' : i < step ? ' done' : ''}`}
                onClick={() => setStep(i)}
                aria-label={`第 ${i + 1} 步：${s}`}
                aria-current={i === step ? 'step' : undefined}
              >
                <span className="no">{i + 1}</span>
                <span className="name">{s}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="welcome-card">
          <div className="welcome-card-main">
            {/* 左栏：读区——这一步是什么、为什么、提示（低密度）；步骤名做大标题，导语做引题 */}
            <aside className="welcome-left">
              <span className="left-kicker">{guide.title}</span>
              <h2>{STEPS[step]}</h2>
              <p className="left-desc">{guide.desc}</p>
              {guide.tips && (
                <ul className="left-tips">
                  {guide.tips.map((t) => <li key={t}>{t}</li>)}
                </ul>
              )}
            </aside>

            {/* 右栏：做区——操作组块 */}
            <div className="welcome-right">
              {step === 0 && (
                <div className="welcome-mods">
                  {MODULES.map((m) => (
                    <div className="welcome-mod" key={m.key}>
                      <video src={m.video} autoPlay loop muted playsInline aria-label={`${m.name}模块操作演示`} />
                      <div className="welcome-mod-body">
                        <b>{m.name} · {m.tagline}</b>
                        <span className="mod-desc"><KbdText text={m.desc} /></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {step === 1 && (
                <>
                  <SourceCatalog onDone={setMsg} />
                  {msg && <div className="run-banner" role="status">{msg}</div>}
                </>
              )}

              {step === 2 && (
                <>
                  <div className="wgroup">
                    <div className="wgroup-title">兴趣域<span className="sub">评分排序的加分项</span></div>
                    <div className="chips">
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
                        placeholder="添加后回车"
                        value={interestDraft}
                        onChange={(e) => setInterestDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addInterest()}
                        aria-label="添加兴趣域"
                      />
                    </div>
                  </div>
                  <div className="wgroup">
                    <div className="wgroup-title">屏蔽词<span className="sub">标题命中即整条滤除</span></div>
                    <div className="chips">
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
                        placeholder="添加后回车"
                        value={dislikeDraft}
                        onChange={(e) => setDislikeDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addDislike()}
                        aria-label="添加屏蔽词"
                      />
                    </div>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  {coachCfg.mode === 'llm' && !coachCfg.viaGateway ? (
                    <div className="notice">✅ AI 已配置（浏览器直连模式）。想换成本地网关，在下面直接填 Key 即可。</div>
                  ) : gwMode && gwProbe === 'checking' ? (
                    <div className="notice">正在检查本地网关状态…</div>
                  ) : gwMode && gwProbe === 'ok' ? (
                    <div className="notice">✅ AI 已配置：网关在线，Key 已加载。想换厂商或换 Key，在下面直接改。</div>
                  ) : (
                    <>
                      {gwMode && gwProbe === 'nokey' && (
                        <div className="notice">⚠️ 网关在运行，但还没配置 Key——在下面选厂商、粘贴 Key 即可。</div>
                      )}
                      {gwMode && gwProbe === 'offline' && (
                        <div className="notice">
                          ⚠️ 本地网关没连上：{desktop ? '请重启应用' : '请在源码 app 目录运行 npm run gateway'}，回来再配。
                        </div>
                      )}
                    </>
                  )}
                  <div className="wgroup">
                    <div className="wgroup-title">① 选厂商，去官网拿 Key</div>
                    <div className="ai-vendors">
                      {AI_VENDORS.filter((v) => v.group !== '国际').map((v) => (
                        <div key={v.id} className={`ai-vendor${vendor === v.id ? ' on' : ''}`}>
                          <button type="button" className="ai-vendor-pick" aria-pressed={vendor === v.id} onClick={() => setVendor(v.id)}>
                            <b>{v.name}</b>
                            <span className="sub">{PROVIDER_PRESETS[v.id]?.model}</span>
                            {vendor === v.id && <span className="ai-vendor-check" aria-hidden>✓</span>}
                          </button>
                          <a href={v.keyPage} target="_blank" rel="noreferrer noopener">拿 Key ↗</a>
                        </div>
                      ))}
                    </div>
                    <p className="caption">OpenAI、Claude、Gemini、Grok、Groq 等国际厂商同样支持——配完引导后在 设置 → AI 里选。</p>
                  </div>
                  <div className="wgroup">
                    <div className="wgroup-title">② 粘贴 Key，保存即测试</div>
                    <div className="key-row">
                      <input
                        className="input"
                        type="password"
                        placeholder={`粘贴${PROVIDER_PRESETS[vendor]?.name ?? ''}的 API Key`}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        aria-label="大模型 API Key"
                      />
                      <button type="button" className="btn-primary" disabled={aiBusy} onClick={() => void saveAndTestAi()}>
                        {aiBusy ? '测试中…' : '保存并测试'}
                      </button>
                    </div>
                    {aiMsg && (
                      <div className={`notice${aiMsg.ok ? ' notice-ok' : ' notice-warn'}`} role="status" data-testid="ai-test-msg">
                        {aiMsg.text}
                      </div>
                    )}
                    <p className="caption">
                      {desktop ? 'Key 写进本机 gateway.env，立即生效。' : 'Key 写进本机 .env.local，立即生效。'}
                      {' '}更多选项在 <button type="button" className="link-btn" onClick={() => finish('/settings?tab=ai')}>设置 → AI</button>。
                    </p>
                  </div>
                </>
              )}

              {step === 4 && (
                <>
                  <div className="wgroup">
                    <div className="wgroup-title">自动备份<span className="sub">防丢数据的安全网，建议保持开启</span></div>
                    <label className="key-row" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={autoBkOn} onChange={(e) => setAutoBkOn(e.target.checked)} />
                      <span>每周自动备份一次（周期随时可在 设置 → 数据 调整）</span>
                    </label>
                    <p className="caption">备份内容是全部数据的完整副本：{desktop ? '存在应用数据目录的 backups 文件夹，不联网。' : '存到浏览器下载文件夹，可再在 设置 → 数据 授权一个固定文件夹。'}</p>
                  </div>
                  <div className="wgroup">
                    <div className="wgroup-title">一键部署<span className="sub">全程约 10 分钟，在应用里直接跑</span></div>
                    {desktop ? (
                      <>
                        <div className="key-row">
                          <button type="button" className="btn-primary" disabled={deployPhase === 'running'} onClick={() => void runDeploy()}>
                            {deployPhase === 'running' ? '部署中…' : deployPhase === 'done' ? '重新部署' : '一键部署'}
                          </button>
                          {deployPhase === 'running' && deployStep && <span className="val" style={{ color: 'var(--ink-soft)', fontSize: 'var(--fs-sm)' }}>{deployStep}…</span>}
                        </div>
                        {deployPhase === 'running' && (
                          <pre className="deploy-log" aria-label="部署进度">{deployLogs.join('\n')}</pre>
                        )}
                        {deployPhase === 'fail' && (
                          <p className="caption" style={{ color: 'var(--danger)' }}>部署失败——看上方提示的原因，处理后点「一键部署」重试（已完成的步骤自动跳过）。</p>
                        )}
                        <p className="caption">
                          点按钮直接在应用里部署（不弹终端窗口）：第一次会弹出浏览器让你登录 Cloudflare（免费注册，点「Allow」），之后全自动。你的本地采集偏好会一并同步到云端。中途失败随时重试，已完成的步骤不重复。
                        </p>
                      </>
                    ) : (
                      <p className="caption">双击项目源码 worker 目录里的 <code>部署向导.cmd</code>，向导会中文逐步引导：装依赖 → 登录 → 建库 → 部署。</p>
                    )}
                  </div>
                  <div className={`wgroup${backfillGlow ? ' wgroup-glow' : ''}`} ref={backfillRef}>
                    <div className="wgroup-title">部署完成后回来填<span className="sub">D1 直连（推荐，大陆网络稳）</span></div>
                    {cloud.mode === 'd1' ? (
                      <>
                        <div className="key-row">
                          <input
                            className="input"
                            placeholder="账户 ID（32 位，部署完自动填好）"
                            value={cloud.accountId}
                            onChange={(e) => setCloud({ ...cloud, accountId: e.target.value })}
                            aria-label="Cloudflare 账户 ID"
                          />
                          <input
                            className="input"
                            placeholder="数据库 ID（部署完自动填好）"
                            value={cloud.databaseId}
                            onChange={(e) => setCloud({ ...cloud, databaseId: e.target.value })}
                            aria-label="数据库 ID"
                          />
                        </div>
                        <div className="key-row">
                          <input
                            className="input"
                            type="password"
                            placeholder="API Token（还没创建？按下面三步，约 2 分钟）"
                            value={cloud.token}
                            onChange={(e) => setCloud({ ...cloud, token: e.target.value })}
                            aria-label="Cloudflare API Token"
                          />
                        </div>
                        <p className="caption">
                          <b>创建 API Token（三步）</b>：① 打开 <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer noopener">Cloudflare 令牌页 ↗</a> → 创建令牌 → 自定义令牌；
                          ② 权限选「账户 → D1 → 编辑」，账户选你自己的；③ 创建后复制（<b>只显示一次</b>）粘到上面。注：这里要的是 Cloudflare 控制台的 API Token，部署时给的 ptk_ 开头 Token 用在这里无效。
                        </p>
                      </>
                    ) : (
                      <div className="key-row">
                        <input
                          className="input"
                          placeholder="端点地址 https://pwork-collect.xxx.workers.dev"
                          value={cloud.endpoint}
                          onChange={(e) => setCloud({ ...cloud, endpoint: e.target.value })}
                          aria-label="云端端点"
                        />
                        <input
                          className="input"
                          type="password"
                          style={{ maxWidth: 170 }}
                          placeholder="Token"
                          value={cloud.token}
                          onChange={(e) => setCloud({ ...cloud, token: e.target.value })}
                          aria-label="云端 Token"
                        />
                      </div>
                    )}
                    <div className="key-row">
                      <button type="button" className="btn-ghost" disabled={testing} onClick={() => void testCloud()}>
                        {testing ? '测试中…' : '测试连接'}
                      </button>
                      <button type="button" className="btn-primary" onClick={() => void saveAndSync()}>保存并同步</button>
                    </div>
                    {msg && <div className="run-banner" role="status">{msg}</div>}
                  </div>
                </>
              )}
            </div>
          </div>

          <footer className="welcome-card-foot">
            <div className="skip-wrap">
              <button type="button" className="text-btn" onClick={() => finish()}>跳过引导</button>
              <span className="skip-hint">以后想再看：设置 → 关于 → 重看首访引导</span>
            </div>
            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              {step > 0 && (
                <button type="button" className="btn-ghost" onClick={() => setStep((s) => s - 1)}>上一步</button>
              )}
              {last ? (
                <button type="button" className="btn-primary" onClick={() => finish('/', true)}>开始使用 →</button>
              ) : (
                <button type="button" className="btn-primary" onClick={() => setStep((s) => s + 1)}>下一步</button>
              )}
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}
