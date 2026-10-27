import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MODULES } from '../content/help'
import { loadCloudConfig, saveCloudConfig, syncFromCloud } from '../db/cloudSync'
import { useCollect } from '../store/collect'
import { SourceCatalog } from '../components/collect/SourceCatalog'
import { KbdText } from '../components/shell/KbdText'
import { isDesktopApp } from '../engine/platform'
import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { saveGatewayKeyAndTest } from '../engine/gatewayKey'
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
    tips: ['输入：速记浮层按 N 随手记、信息日报', '处理：Ctrl K 一次搜遍全库；桌面版 Ctrl+Alt+Q 呼出工具轮盘', '输出：周报月报、文章、调研', '回路：CLAP 复盘、认知资产回访'],
  },
  {
    title: '挑你要读的',
    desc: '11 个领域共 48 个实测可用的信源，勾选后一次导入。不选也行，以后在信源页随时加。',
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
  const [deploying, setDeploying] = useState(false)

  /** 走完或跳过都算完成（成熟实践：skippable，不再打扰），进入主界面或所选模块页 */
  const finish = (to = '/') => {
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
    }
    setAiBusy(false)
  }

  /** 一键部署：部署源码随应用打进安装目录，新窗口直接跑向导——无需选择任何位置。
   *  invoke 静态引入（动态 import 的依赖预加载在 tauri.localhost 下会挂起，点击无响应） */
  const runDeploy = async () => {
    setDeploying(true)
    try {
      await tauriInvoke('open_deploy_wizard')
      setMsg('部署窗口已在新窗口打开——跟着向导走完（约 10 分钟），结束时它打印的端点地址和 Token 填到下面')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setDeploying(false)
    }
  }

  const testCloud = async () => {
    if (!cloud.endpoint.trim()) {
      setMsg('先填写部署输出的端点地址')
      return
    }
    setTesting(true)
    setMsg(null)
    try {
      const resp = await fetch(`${cloud.endpoint.replace(/\/$/, '')}/api/digest?n=1`, {
        headers: cloud.token ? { authorization: `Bearer ${cloud.token}` } : {},
      })
      setMsg(resp.ok ? '连接成功！点「保存并同步」完成接入' : `地址能访问但被拒绝（HTTP ${resp.status}）——多半是 Token 不对或还没生效，回去核对一下再试`)
    } catch {
      setMsg('连不上：确认已完成部署、地址拼写正确')
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
                    <div className="wgroup-title">一键部署<span className="sub">全程约 10 分钟</span></div>
                    {desktop ? (
                      <>
                        <div className="key-row">
                          <button type="button" className="btn-primary" disabled={deploying} onClick={() => void runDeploy()}>
                            {deploying ? '启动中…' : '一键部署'}
                          </button>
                        </div>
                        <p className="caption">在 PWORK 安装目录下直接开始，无需选择位置。向导在新窗口中文逐步引导：装依赖 → 登录 → 建库 → 部署。</p>
                      </>
                    ) : (
                      <p className="caption">双击项目源码 worker 目录里的 <code>部署向导.cmd</code>，向导会中文逐步引导：装依赖 → 登录 → 建库 → 部署。</p>
                    )}
                  </div>
                  <div className="wgroup">
                    <div className="wgroup-title">部署完成后回来填<span className="sub">向导结束时会打印这两样</span></div>
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
                <button type="button" className="btn-primary" onClick={() => finish()}>开始使用 →</button>
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
