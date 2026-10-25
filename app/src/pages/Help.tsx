import { Link, useSearchParams } from 'react-router-dom'
import { CONFIG_GUIDE, DATA_POINTS, FAQ, GLOSSARY, QUICK_START, SHORTCUTS } from '../content/help'
import { SettingsNav } from '../components/shell/SettingsNav'

const HELP_TABS = [
  { id: 'quick', label: '快速上手', icon: 'quick' },
  { id: 'shortcuts', label: '快捷键', icon: 'shortcuts' },
  { id: 'privacy', label: '数据安全', icon: 'privacy' },
  { id: 'config', label: '配置指南', icon: 'config' },
  { id: 'troubleshoot', label: '排错', icon: 'troubleshoot' },
  { id: 'glossary', label: '术语表', icon: 'glossary' },
] as const

/**
 * 帮助页（/help）：回答"这个四模块系统本身怎么用"。
 * 左侧分类导航 + 右侧当前分类全宽内容（与设置页同款布局，2026-10-22）。
 * 内容驱动自 content/help.ts；样式复用 set-card/set-row/notice，零新组件。
 * 回路方法论（CLAP 等）不在这里重复——见 /review/help。
 */
export function Help() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = HELP_TABS.find((t) => t.id === searchParams.get('tab'))?.id ?? 'quick'
  return (
    <section className="settings-page">
      <div className="page-head">
        <h1>帮助</h1>
        <span className="sub">四模块系统怎么用 · 数据在哪、怎么丢不了 · 出了问题看排错</span>
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
        <div className="desc">每一阶段产品都完整可用——按下面的顺序，十分钟走通一次闭环</div>
        <div className="set-body">
          {QUICK_START.map((s) => (
            <div className="set-row" key={s.step} style={{ alignItems: 'flex-start' }}>
              <label style={{ width: 24, textAlign: 'center', fontWeight: 700, color: 'var(--accent-text)' }}>{s.step}</label>
              <span className="val" style={{ flex: 1, minWidth: 0 }}>
                <b>{s.title}</b>　<span style={{ color: 'var(--ink-soft)' }}>{s.desc}</span>
              </span>
              <Link to={s.to} className="btn-ghost" style={{ flex: 'none' }}>
                {s.action} →
              </Link>
            </div>
          ))}
          <div className="set-row">
            <label></label>
            <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
              新手引导还有信源初始化、采集偏好与上云步骤：<Link to="/welcome">重新查看完整引导 →</Link>
            </span>
          </div>
        </div>
      </div>


      <div className="set-card" data-tab="shortcuts" style={{ display: tab === 'shortcuts' ? undefined : 'none' }}>
        <h2>快捷键</h2>
        <div className="set-body">
          {SHORTCUTS.map((s) => (
            <div className="set-row" key={s.keys}>
              <label style={{ display: 'flex', gap: 4 }}>
                {s.keys.split(' 或 ').map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </label>
              <span className="val">{s.desc}</span>
            </div>
          ))}
        </div>
      </div>


      <div className="set-card" data-tab="privacy" style={{ display: tab === 'privacy' ? undefined : 'none' }}>
        <h2>数据安全</h2>
        <div className="desc">数据只属于你——在哪里、怎么丢不了、谁会看到</div>
        <div className="set-body">
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
        <h2>排错</h2>
        <div className="desc">真实踩坑沉淀——随使用持续增长</div>
        <div className="set-body">
          {FAQ.map((f) => (
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
      </div>

      <div className="set-card" data-tab="glossary" style={{ display: tab === 'glossary' ? undefined : 'none' }}>
        <h2>术语表</h2>
        <div className="desc">应用里的专门说法——什么意思，在这里查</div>
        <div className="set-body">
          {GLOSSARY.map((g) => (
            <div className="set-row" key={g.term} style={{ alignItems: 'flex-start' }}>
              <label style={{ color: 'var(--accent-text)', fontWeight: 600 }}>{g.term}</label>
              <span className="val" style={{ color: 'var(--ink-soft)' }}>{g.def}</span>
            </div>
          ))}
        </div>
      </div>
        </div>
      </div>
    </section>
  )
}
