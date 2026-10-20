import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { QUICK_START } from '../content/help'
import { SAMPLE_SOURCES } from '../content/collect'
import { importSources } from '../db/collect'
import { loadCloudConfig, saveCloudConfig, syncFromCloud } from '../db/cloudSync'
import { useCollect } from '../store/collect'

/**
 * 首访引导页（/welcome）：首次打开自动进入一次；帮助页可重进。
 * 回答新用户的三个问题：这是什么怎么用 / 信源怎么来 / 要上云怎么弄（含 Cloudflare 注册与一键脚本）。
 * 2026-10-12 起采集偏好（兴趣域/屏蔽词）也可在这里直接设好，不必再去设置页。
 */
export function Welcome() {
  const navigate = useNavigate()
  const [cloud, setCloud] = useState(() => loadCloudConfig())
  const [msg, setMsg] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const { config, setConfig } = useCollect()
  const [interestDraft, setInterestDraft] = useState('')
  const [dislikeDraft, setDislikeDraft] = useState('')

  const finish = () => {
    localStorage.setItem('pwork-welcomed', '1')
    navigate('/')
  }

  const importSamples = async () => {
    const r = await importSources(SAMPLE_SOURCES)
    setMsg(r.imported > 0 ? `已导入 ${r.imported} 个实测可用的信源，去「信息日报」点⟳立即抓取试试` : '示例信源已存在（按地址去重）')
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
      setMsg('连不上：确认已运行 worker\\部署向导.cmd 完成部署、地址拼写正确')
    } finally {
      setTesting(false)
    }
  }

  const saveAndSync = async () => {
    saveCloudConfig(cloud)
    const r = await syncFromCloud()
    setMsg(r.ok ? `已保存并完成首次同步：新 ${r.newCount} 条（之后在 设置 → 云端同步 管理）` : `已保存；首次同步失败：${r.error ?? '云端还没有数据，部署后等一轮抓取再试'}`)
  }

  return (
    <section className="settings">
      <div className="page-head">
        <h1>欢迎使用 PWORK</h1>
        <span className="sub">本地优先的四模块个人操作系统 · 数据只属于你</span>
      </div>

      <div className="set-card">
        <h2>① 快速上手</h2>
        <div className="desc">每一步几十秒；处理与输出模块按路线图后续开放，不着急</div>
        <div className="set-body">
          {QUICK_START.map((s) => (
            <div className="set-row" key={s.step} style={{ alignItems: 'flex-start' }}>
              <label style={{ width: 24, textAlign: 'center', fontWeight: 700, color: 'var(--accent-text)' }}>{s.step}</label>
              <span className="val" style={{ flex: 1, minWidth: 0 }}>
                <b>{s.title}</b>　<span style={{ color: 'var(--ink-soft)' }}>{s.desc}</span>
              </span>
              <Link to={s.to} className="btn-ghost" style={{ flex: 'none' }}>{s.action} →</Link>
            </div>
          ))}
          <div className="set-row" style={{ paddingTop: 'var(--sp-3)' }}>
            <label></label>
            <button type="button" className="btn-primary" onClick={finish}>我明白了，开始使用 →</button>
            <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>随时可从 帮助页 回到这里</span>
          </div>
        </div>
      </div>

      <div className="set-card">
        <h2>② 信源初始化（推荐）</h2>
        <div className="desc">5 个实测可用的原生 RSS（阮一峰 / 少数派 / Hacker News / Solidot / GitHub Blog）</div>
        <div className="set-body">
          <div className="set-row">
            <label>一键导入</label>
            <button type="button" className="btn-primary" onClick={() => void importSamples()}>导入 5 个示例信源</button>
            <Link to="/input/digest" className="btn-ghost">去信息日报抓取 →</Link>
          </div>
          {msg && <div className="run-banner" style={{ marginTop: 'var(--sp-2)' }} role="status">{msg}</div>}
        </div>
      </div>

      <div className="set-card">
        <h2>③ 采集偏好</h2>
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
          <div className="notice">改动立即保存，从下一次抓取开始生效；以后随时在 设置 → 采集偏好 再调整。你的「多推」投票会自动调整信源分级，攒够后 AI 还会归纳你的兴趣词表。</div>
        </div>
      </div>

      <div className="set-card">
        <h2>④ 可选：上云引导（定时抓取 + AI 筛选）</h2>
        <div className="desc">不弄也完全能用——本地抓取照常工作；想 7×24 自动抓取再往下走（免费档 ¥0/月）</div>
        <div className="set-body">
          <div className="notice">
            <b>Cloudflare 注册三句话</b>：① 打开 <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noreferrer noopener">dash.cloudflare.com/sign-up</a>，用一个邮箱注册；② 选择免费计划，<b>无需信用卡</b>；③ 就这些——后面的登录授权会在你运行部署脚本时自动弹出浏览器完成。
          </div>
          <div className="set-row" style={{ alignItems: 'flex-start', paddingTop: 'var(--sp-3)' }}>
            <label>一键部署</label>
            <span className="val" style={{ color: 'var(--ink-soft)' }}>
              双击 <code>worker\部署向导.cmd</code>（在 PWORK 文件夹里）。脚本会中文逐步引导：装依赖 → 登录/注册 → 建库写配置 → 部署，全程约 10 分钟。结束时它会打印你的<b>专属端点地址</b>和让你设置的 <b>Token</b>。大陆网络建议部署完成后在 设置 → 云端同步 切到 <b>D1 直连模式</b>（绕过 workers.dev 阻断，页面内有 Token 创建指引）。
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
          <div className="set-row" style={{ paddingTop: 'var(--sp-2)' }}>
            <label></label>
            <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
              遇到问题看 <Link to="/help">帮助页排错区</Link>；也可以跳过，以后在 设置 → 云端同步 随时配置。
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
