import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CONFIG_GUIDE, DATA_POINTS, FAQ, GLOSSARY, MODULES, SHORTCUTS } from '../content/help'
import { loadKeybinds, displayCombo } from '../engine/keybinds'
import { SettingsNav } from '../components/shell/SettingsNav'
import { KbdText } from '../components/shell/KbdText'

const DATA_FLOW_IMG = 'assets/data-security.png'

const HELP_TABS = [
  { id: 'quick', label: '快速上手', icon: 'quick' },
  { id: 'shortcuts', label: '快捷键', icon: 'shortcuts' },
  { id: 'privacy', label: '数据安全', icon: 'privacy' },
  { id: 'config', label: '配置指南', icon: 'config' },
  { id: 'troubleshoot', label: '常见问题', icon: 'troubleshoot' },
  { id: 'glossary', label: '术语表', icon: 'glossary' },
] as const

/** 常见问题与术语表的分组展示顺序：四模块优先，其余殿后 */
const GROUP_ORDER = ['输入', '处理', '输出', '回路', '数据与备份', '数据', 'AI', '界面与通用', '通用'] as const

/**
 * 帮助页（/help）：回答"这个四模块系统本身怎么用"。
 * 左侧分类导航 + 右侧当前分类全宽内容（与设置页同款布局，2026-10-22）。
 * 内容驱动自 content/help.ts；样式复用 set-card/set-row/notice，零新组件。
 * 回路方法论（CLAP 等）不在这里重复——见 /review/help。
 */
export function Help() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = HELP_TABS.find((t) => t.id === searchParams.get('tab'))?.id ?? 'quick'
  const [zoomImg, setZoomImg] = useState(false)
  return (
    <section className="settings-page">
      <div className="page-head">
        <h1>帮助</h1>
        <span className="sub">四模块系统怎么用 · 数据在哪、怎么丢不了 · 出了问题看常见问题</span>
      </div>

      <div className="settings-layout">
        <SettingsNav
          tabs={HELP_TABS}
          active={tab}
          onSelect={(id) => setSearchParams({ tab: id }, { replace: true })}
          ariaLabel="帮助分类"
        />

        <div className="settings-content">
      <div className="set-card" data-tab="quick" style={{ display: tab === 'quick' ? undefined : 'none' }}>
        <h2>快速上手</h2>
        <div className="desc">四个模块各管一段：输入记下来 → 处理加工 → 输出成稿 → 回路复盘——视频为应用真实操作录制</div>
        <div className="set-body">
          {MODULES.map((m) => (
            <div className="quick-row" key={m.key}>
              <video src={import.meta.env.BASE_URL + m.video} autoPlay loop muted playsInline aria-label={`${m.name}模块操作演示`} />
              <span className="val" style={{ flex: 1, minWidth: 0 }}>
                <b>{m.name} · {m.tagline}</b>
                <br />
                <span style={{ color: 'var(--ink-soft)' }}><KbdText text={m.desc} /></span>
              </span>
              <Link to={m.to} className="btn-ghost" style={{ flex: 'none', alignSelf: 'center' }}>
                {m.action} →
              </Link>
            </div>
          ))}
          <p style={{ margin: 'var(--sp-2) 0 0', color: 'var(--ink-soft)', fontSize: 'var(--fs-sm)' }}>
            新手引导还有信源初始化、采集设置与上云步骤，<Link to="/welcome">重新查看完整引导 →</Link>
          </p>
        </div>
      </div>


      <div className="set-card" data-tab="shortcuts" style={{ display: tab === 'shortcuts' ? undefined : 'none' }}>
        <h2>快捷键</h2>
        <div className="set-body">
          {SHORTCUTS.map((s) => {
            // 键位中心（0.4-3）：可自定义条目按用户当前配置显示；命令面板额外固定显示别名 /
            const kb = loadKeybinds()
            const shown = s.bind ? displayCombo(kb[s.bind]) : s.keys
            return (
              <div className="set-row" key={s.keys + s.desc}>
                <label style={{ display: 'flex', gap: 4 }}>
                  {s.bind === 'palette' ? (
                    <>
                      <kbd>{shown}</kbd>
                      <kbd>/</kbd>
                    </>
                  ) : (
                    <kbd>{shown}</kbd>
                  )}
                </label>
                <span className="val">{s.desc}</span>
              </div>
            )
          })}
        </div>
      </div>


      <div className="set-card" data-tab="privacy" style={{ display: tab === 'privacy' ? undefined : 'none' }}>
        <h2>数据安全</h2>
        <div className="desc">数据只属于你——在哪里、怎么丢不了、谁会看到</div>
        <div className="set-body">
          <img
            src={`${import.meta.env.BASE_URL}${DATA_FLOW_IMG}`}
            alt="数据流向图：实线全部在你的电脑里（信源抓取 → 本机网关 → 本机存储 → 自动备份与全量导出）；虚线是仅有的两条出本机通道（AI 服务商、Cloudflare 同步），默认关闭"
            style={{ width: '100%', display: 'block', margin: '0 auto var(--sp-3)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', cursor: 'zoom-in' }}
            onClick={() => setZoomImg(true)}
            title="点击放大查看"
          />
          <p style={{ margin: '0 0 var(--sp-3)', textAlign: 'center', color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
            点击图片可放大查看
          </p>
          {DATA_POINTS.map((d) => (
            <div className="set-row" key={d.title} style={{ alignItems: 'flex-start' }}>
              <label style={{ fontWeight: 600, color: 'var(--ink)' }}>{d.title}</label>
              <span className="val" style={{ color: 'var(--ink-soft)' }}>{d.desc}</span>
            </div>
          ))}
        </div>
      </div>


      <div className="set-card" data-tab="config" style={{ display: tab === 'config' ? undefined : 'none' }}>
        <h2>配置指南</h2>
        <div className="desc">装完即用；唯一建议开的是自动备份——AI、云端同步、转接服务都是可选，先看"我需要吗"再动手</div>
        <div className="set-body">
          {CONFIG_GUIDE.map((c) => (
            <details key={c.title} className="errlog-item" style={{ border: 'none' }}>
              <summary style={{ padding: 'var(--sp-2) 0', gap: 'var(--sp-2)' }}>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{c.title}</span>
              </summary>
              <div className="notice" style={{ borderLeftColor: 'var(--line-strong)', marginBottom: 'var(--sp-2)' }}>{c.who}</div>
              <ol style={{ margin: '0 0 var(--sp-2) 0', paddingLeft: 'var(--sp-5)', color: 'var(--ink-soft)', fontSize: 'var(--fs-sm)', lineHeight: 1.9 }}>
                {c.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              <Link to={c.link.to} className="btn-ghost" style={{ marginBottom: 'var(--sp-2)' }}>{c.link.label} →</Link>
            </details>
          ))}
        </div>
      </div>


      <div className="set-card" data-tab="troubleshoot" style={{ display: tab === 'troubleshoot' ? undefined : 'none' }}>
        <h2>常见问题</h2>
        <div className="desc">按模块分组的使用问题——真实踩坑沉淀，随使用持续增长</div>
        <div className="set-body">
          <div className="notice" style={{ borderLeftColor: 'var(--accent)', marginBottom: 'var(--sp-3)' }} data-testid="feedback-notice">
            这里没有你要的答案？<a href="https://github.com/LoganLink0/pwork/discussions" target="_blank" rel="noreferrer noopener">去 Discussions 发帖</a>（设置 → 数据管理 可导出错误日志附上），或在微信群里直接说。
          </div>
          {GROUP_ORDER.map((group) => {
            const groupFaq = FAQ.filter((f) => f.group === group)
            if (groupFaq.length === 0) return null
            return (
              <div key={group}>
                <div className="faq-group">{group}</div>
                {groupFaq.map((f) => (
                  <div key={f.q} style={{ marginBottom: 'var(--sp-4)' }}>
                    <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 4 }}>{f.q}</div>
                    <div className="notice" style={{ borderLeftColor: 'var(--line-strong)' }}>
                      {f.a}
                      {f.link && (
                        <>
                          {' '}
                          <Link to={f.link.to}>{f.link.label} →</Link>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      <div className="set-card" data-tab="glossary" style={{ display: tab === 'glossary' ? undefined : 'none' }}>
        <h2>术语表</h2>
        <div className="desc">应用里的专门说法——什么意思，在这里查</div>
        <div className="set-body">
          {GROUP_ORDER.map((group) => {
            const groupTerms = GLOSSARY.filter((g) => g.group === group)
            if (groupTerms.length === 0) return null
            return (
              <div key={group}>
                <div className="faq-group">{group}</div>
                {groupTerms.map((g) => (
                  <div className="set-row" key={g.term} style={{ alignItems: 'flex-start' }}>
                    <label style={{ color: 'var(--accent-text)', fontWeight: 600 }}>{g.term}</label>
                    <span className="val" style={{ color: 'var(--ink-soft)' }}>{g.def}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
        </div>
      </div>
      {zoomImg && (
        <div
          className="overlay img-zoom-overlay"
          role="dialog"
          aria-label="数据流向图（放大查看）"
          onClick={() => setZoomImg(false)}
          onKeyDown={(e) => e.key === 'Escape' && setZoomImg(false)}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <img
            src={`${import.meta.env.BASE_URL}${DATA_FLOW_IMG}`}
            alt="数据流向图（放大）"
            style={{ maxWidth: 'min(1400px, 94vw)', maxHeight: '88vh', display: 'block', margin: '0 auto', borderRadius: 'var(--r-md)' }}
            onClick={(e) => e.stopPropagation()}
          />
          <p style={{ textAlign: 'center', color: '#fff', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-2)' }}>
            点任意位置关闭
          </p>
        </div>
      )}
    </section>
  )
}
