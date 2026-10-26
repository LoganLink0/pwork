import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MODULES } from '../content/help'
import { loadCloudConfig, saveCloudConfig, syncFromCloud } from '../db/cloudSync'
import { useCollect } from '../store/collect'
import { SourceCatalog } from '../components/collect/SourceCatalog'
import { KbdText } from '../components/shell/KbdText'
import { DEFAULT_GATEWAY_URL, loadCoachConfig, probeGateway } from '../modules/review/engine/coach'

/**
 * 首访引导（/welcome）：全屏遮罩分步式（成熟实现的主流形态——遮罩覆盖主界面、
 * 3-5 步、可跳过、走完才进入软件；2026-10-25 用户第一性纠偏，替换原"应用内普通页面"）。
 * 五步回答新用户的五个问题：这是什么怎么用 / 信源怎么来 / 关注什么 / AI 配不配 / 要不要上云。
 * 第 1 步四模块能力卡（各带实拍演示视频）；后续步骤操作真实生效（目录导入信源、改偏好、配置云端）。
 */
const STEPS = ['认识工作台', '信源初始化', '采集偏好', 'AI 功能（可选）', '可选：上云'] as const

export function Welcome() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [cloud, setCloud] = useState(() => loadCloudConfig())
  const [msg, setMsg] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const { config, setConfig } = useCollect()
  const [interestDraft, setInterestDraft] = useState('')
  const [dislikeDraft, setDislikeDraft] = useState('')
  // AI 配置的真实状态：本地存过"已配置"不代表网关进程里真有 Key（gateway.env 可能没写），
  // 网关模式下必须探测 /health 才能下结论（2026-10-26 用户实测：引导页说配好了、实际全走不通）
  const aiCfg = loadCoachConfig()
  const gwMode = aiCfg.mode === 'llm' && Boolean(aiCfg.viaGateway)
  const [gwProbe, setGwProbe] = useState<'checking' | 'ok' | 'nokey' | 'offline'>('checking')
  useEffect(() => {
    if (!gwMode) return
    let alive = true
    void probeGateway(aiCfg.gatewayUrl || DEFAULT_GATEWAY_URL).then((p) => {
      if (!alive) return
      setGwProbe(!p.online ? 'offline' : p.chatConfigured ? 'ok' : 'nokey')
    })
    return () => {
      alive = false
    }
  }, [gwMode, aiCfg.gatewayUrl])

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
              {aiCfg.mode === 'llm' && !aiCfg.viaGateway ? (
                <div className="notice">✅ AI 已配置（浏览器直连模式）。想验证 Key 是否有效，去 设置 → AI 页发一次对话试试。</div>
              ) : gwMode && gwProbe === 'checking' ? (
                <div className="notice">正在检查本地网关状态…</div>
              ) : gwMode && gwProbe === 'ok' ? (
                <div className="notice">✅ AI 已配置：网关在线，Key 已加载。想确认就去 设置 → AI 页点「测试网关」。</div>
              ) : (
                <>
                  {gwMode && gwProbe === 'nokey' && (
                    <div className="notice">⚠️ 网关在运行，但还没配置 Key——按下面说明补上后重启生效。</div>
                  )}
                  {gwMode && gwProbe === 'offline' && (
                    <div className="notice">⚠️ 本地网关没连上：桌面版请重启应用；浏览器版请在 app 目录运行 <code>npm run gateway</code>。配 Key 的说明在下面。</div>
                  )}
                  <div className="notice">
                    <b>Key 怎么拿</b>：到大模型服务商官网注册获取（如 DeepSeek 开放平台、智谱开放平台），一把 Key 网关全用。
                  </div>
                  <div className="set-row" style={{ alignItems: 'flex-start' }}>
                    <label>桌面版</label>
                    <span className="val" style={{ color: 'var(--ink-soft)' }}>
                      打开文件夹 <code>%APPDATA%\com.pwork.workbench\</code>（资源管理器地址栏粘贴回车），新建文本文件 <code>gateway.env</code>，写入一行 <code>PWORK_LLM_API_KEY=你的Key</code>，重启应用。
                    </span>
                  </div>
                  <div className="set-row" style={{ alignItems: 'flex-start' }}>
                    <label>浏览器版</label>
                    <span className="val" style={{ color: 'var(--ink-soft)' }}>
                      在应用目录把 <code>tools/.env.example</code> 复制为 <code>.env.local</code>，填同样内容，再运行 <code>npm run gateway</code>。
                    </span>
                  </div>
                  <div className="set-row">
                    <label>放心之处</label>
                    <span className="val" style={{ color: 'var(--ink-soft)' }}>
                      Key 只存在你自己电脑的这个文件里：不上传、不进备份、界面永不显示。配好后在 设置 → AI 页点「测试网关」确认。
                    </span>
                  </div>
                </>
              )}
              <div className="set-row">
                <label>现在去配</label>
                <button type="button" className="btn-ghost" onClick={() => finish('/settings?tab=ai')}>打开 设置 → AI →</button>
                <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>也可以走完引导，以后随时在设置里配</span>
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
              <div className="set-row" style={{ alignItems: 'flex-start', paddingTop: 'var(--sp-3)' }}>
                <label>一键部署</label>
                <span className="val" style={{ color: 'var(--ink-soft)' }}>
                  双击项目源码 worker 目录里的 <code>部署向导.cmd</code>（注意：在源码目录，桌面版安装目录里没有）。脚本会中文逐步引导：装依赖 → 登录/注册 → 建库写配置 → 部署，全程约 10 分钟。结束时它会打印你的<b>专属端点地址</b>和让你设置的 <b>Token</b>。大陆网络建议部署完成后在 设置 → 云端同步 切到 <b>D1 直连模式</b>（绕过 workers.dev 阻断，页面内有 Token 创建指引）。
                </span>
              </div>
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
