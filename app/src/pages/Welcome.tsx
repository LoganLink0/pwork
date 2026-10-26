import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MODULES } from '../content/help'
import { loadCloudConfig, saveCloudConfig, syncFromCloud } from '../db/cloudSync'
import { useCollect } from '../store/collect'
import { SourceCatalog } from '../components/collect/SourceCatalog'
import { KbdText } from '../components/shell/KbdText'
import { isDesktopApp } from '../engine/platform'
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
 * 首访引导（/welcome）：全屏遮罩分步式（成熟实现的主流形态——遮罩覆盖主界面、
 * 3-5 步、可跳过、走完才进入软件；2026-10-25 用户第一性纠偏，替换原"应用内普通页面"）。
 * 五步回答新用户的五个问题：这是什么怎么用 / 信源怎么来 / 关注什么 / AI 配不配 / 要不要上云。
 * 第 1 步四模块能力卡（各带实拍演示视频）；后续步骤操作真实生效（目录导入信源、改偏好、配置云端）。
 * AI 卡与上云卡按运行环境只显示对应端的内容（桌面版/浏览器版各一套，不再并列写出两套说明）。
 */
const STEPS = ['认识工作台', '信源初始化', '采集偏好', 'AI 功能（可选）', '可选：上云'] as const

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

  // ── 一键部署（第 5 步，桌面版）：源码目录记忆 + 新窗口跑部署向导 ──
  const [deployDir, setDeployDir] = useState(() => localStorage.getItem('pwork-deploy-src') ?? '')
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

  /** 一键部署（桌面版）：新控制台窗口跑源码 worker 目录的部署向导，路径记住下次直接用 */
  const startDeploy = async () => {
    if (!deployDir.trim()) {
      setMsg('先填写 PWORK 源码目录（源码根目录或 worker 目录都可以）')
      return
    }
    setDeploying(true)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('open_deploy_wizard', { dir: deployDir.trim() })
      localStorage.setItem('pwork-deploy-src', deployDir.trim())
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
      setMsg(resp.ok ? '连接成功！点「保存并同步」完成接入' : `端点可达但返回 HTTP ${resp.status}`)
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

  return (
    <div className="welcome-veil" role="dialog" aria-label="新手引导">
      <div className="welcome-stage">
        <header className="welcome-head">
          <h1>欢迎使用 PWORK</h1>
          <span className="sub">本地优先的个人工作台 · 数据只属于你</span>
          <div className="welcome-dots" aria-label={`第 ${step + 1} 步，共 ${STEPS.length} 步`}>
            {STEPS.map((s, i) => (
              <button
                key={s}
                type="button"
                className={`welcome-dot${i === step ? ' on' : i < step ? ' done' : ''}`}
                onClick={() => setStep(i)}
                aria-label={`第 ${i + 1} 步：${s}`}
                title={s}
              />
            ))}
          </div>
        </header>

        {step === 0 && (
          <div className="set-card">
            <h2>{STEPS[0]}</h2>
            <div className="desc">整个工作台是一个闭环：输入（记下来）→ 处理（加工）→ 输出（成稿）→ 回路（复盘，产出又回到待办）</div>
            <div className="set-body">
              <div className="welcome-mods">
                {MODULES.map((m) => (
                  <div className="welcome-mod" key={m.key}>
                    <video src={m.video} autoPlay loop muted playsInline aria-label={`${m.name}模块操作演示`} />
                    <div className="welcome-mod-body">
                      <b>{m.name} · {m.tagline}</b>
                      <span><KbdText text={m.desc} /></span>
                      <button type="button" className="text-btn" onClick={() => finish(m.to)}>{m.action} →</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="set-card">
            <h2>{STEPS[1]}</h2>
            <div className="desc">按领域挑选要订阅的信源，全部实测可达；不选也可以，以后在信源页随时添加</div>
            <div className="set-body">
              <SourceCatalog onDone={setMsg} />
              {msg && <div className="run-banner" style={{ marginTop: 'var(--sp-2)' }} role="status">{msg}</div>}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="set-card">
            <h2>{STEPS[2]}</h2>
            <div className="desc">告诉系统你关注什么、讨厌什么——评分排序靠它；预置的是通用默认值，改成你自己的才有效</div>
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
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="set-card">
            <h2>{STEPS[3]}</h2>
            <div className="desc">不配也完全能用——信息筛选走本地规则、报告走内置模板。配上自己的 Key 后，多出 AI 复盘教练、AI 写大纲、联网调研这些增强</div>
            <div className="set-body">
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

              <div className="set-row" style={{ alignItems: 'flex-start' }}>
                <label>第 1 步 选厂商</label>
                <div className="ai-vendors" style={{ flex: 1, minWidth: 0 }}>
                  {AI_VENDORS.map((v) => (
                    <div key={v.id} className={`ai-vendor${vendor === v.id ? ' on' : ''}`}>
                      <button type="button" className="ai-vendor-pick" aria-pressed={vendor === v.id} onClick={() => setVendor(v.id)}>
                        <b>{v.name}</b>
                        <span className="sub">{PROVIDER_PRESETS[v.id]?.model}</span>
                      </button>
                      <a href={v.keyPage} target="_blank" rel="noreferrer noopener">拿 Key ↗</a>
                    </div>
                  ))}
                </div>
              </div>
              <div className="set-row">
                <label>第 2 步 填 Key</label>
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
              <div className="set-row">
                <label>放心之处</label>
                <span className="val" style={{ color: 'var(--ink-soft)' }}>
                  {desktop
                    ? 'Key 只写进你电脑的 gateway.env 文件：不上传、不进备份、界面不再显示。保存后立即测试、立即生效，无需重启。'
                    : 'Key 只写进你电脑源码目录的 .env.local 文件：不上传、不进备份、界面不再显示。保存后立即测试、立即生效，无需重启网关。'}
                </span>
              </div>
              <div className="set-row">
                <label>更多选项</label>
                <button type="button" className="btn-ghost" onClick={() => finish('/settings?tab=ai')}>打开 设置 → AI →</button>
                <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
                  {desktop ? '可查看用量、切换厂商' : '可切浏览器直连模式（不用本地网关）、查看用量'}
                </span>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="set-card">
            <h2>{STEPS[4]}</h2>
            <div className="desc">不弄也完全能用——本地抓取照常工作；想 7×24 自动抓取再往下走（免费档 ¥0/月）</div>
            <div className="set-body">
              <div className="notice">
                <b>Cloudflare 注册三句话</b>：① 打开 <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noreferrer noopener">dash.cloudflare.com/sign-up</a>，用一个邮箱注册；② 选择免费计划，<b>无需信用卡</b>；③ 就这些——后面的登录授权会在你运行部署脚本时自动弹出浏览器完成。
              </div>
              {desktop ? (
                <>
                  <div className="set-row" style={{ alignItems: 'flex-start', paddingTop: 'var(--sp-3)' }}>
                    <label>一键部署</label>
                    <div style={{ display: 'flex', gap: 'var(--sp-2)', flex: 1, minWidth: 0, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        className="input"
                        placeholder="PWORK 源码目录（如 E:\AIPROJECT-GLM\PWORK）"
                        value={deployDir}
                        onChange={(e) => setDeployDir(e.target.value)}
                        aria-label="源码目录"
                      />
                      <button type="button" className="btn-primary" disabled={deploying} onClick={() => void startDeploy()}>
                        {deploying ? '启动中…' : '开始一键部署'}
                      </button>
                    </div>
                  </div>
                  <div className="set-row">
                    <label>怎么走</label>
                    <span className="val" style={{ color: 'var(--ink-soft)' }}>
                      点按钮会在<b>新窗口</b>运行源码 worker 目录里的部署向导，中文逐步引导：装依赖 → 登录/注册 → 建库写配置 → 部署，全程约 10 分钟。结束时它会打印你的<b>专属端点地址</b>和让你设置的 <b>Token</b>，回到这里填到下面。大陆网络建议部署完成后在 设置 → 云端同步 切到 <b>D1 直连模式</b>（绕过 workers.dev 阻断，页面内有 Token 创建指引）。
                    </span>
                  </div>
                </>
              ) : (
                <div className="set-row" style={{ alignItems: 'flex-start', paddingTop: 'var(--sp-3)' }}>
                  <label>一键部署</label>
                  <span className="val" style={{ color: 'var(--ink-soft)' }}>
                    双击项目源码 worker 目录里的 <code>部署向导.cmd</code>。脚本会中文逐步引导：装依赖 → 登录/注册 → 建库写配置 → 部署，全程约 10 分钟。结束时它会打印你的<b>专属端点地址</b>和让你设置的 <b>Token</b>。大陆网络建议部署完成后在 设置 → 云端同步 切到 <b>D1 直连模式</b>（绕过 workers.dev 阻断，页面内有 Token 创建指引）。
                  </span>
                </div>
              )}
              <div className="set-row">
                <label>部署后回填</label>
                <input
                  className="input"
                  placeholder="https://pwork-collect.xxx.workers.dev"
                  value={cloud.endpoint}
                  onChange={(e) => setCloud({ ...cloud, endpoint: e.target.value })}
                  aria-label="云端端点"
                />
                <input
                  className="input"
                  type="password"
                  style={{ maxWidth: 180 }}
                  placeholder="Token"
                  value={cloud.token}
                  onChange={(e) => setCloud({ ...cloud, token: e.target.value })}
                  aria-label="云端 Token"
                />
                <button type="button" className="btn-ghost" disabled={testing} onClick={() => void testCloud()}>
                  {testing ? '测试中…' : '测试连接'}
                </button>
                <button type="button" className="btn-primary" onClick={() => void saveAndSync()}>保存并同步</button>
              </div>
              {msg && <div className="run-banner" style={{ marginTop: 'var(--sp-2)' }} role="status">{msg}</div>}
            </div>
          </div>
        )}

        <footer className="welcome-foot">
          <button type="button" className="text-btn" onClick={() => finish()}>跳过引导</button>
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
  )
}
