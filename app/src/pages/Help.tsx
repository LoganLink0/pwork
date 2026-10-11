import { Link } from 'react-router-dom'
import { CONFIG_GUIDE, DATA_POINTS, FAQ, GLOSSARY, MODULES, QUICK_START, SHORTCUTS } from '../content/help'

/**
 * 帮助页（/help）：回答"这个四模块系统本身怎么用"。
 * 内容驱动自 content/help.ts；样式复用 set-card/set-row/notice，零新组件。
 * 回路方法论（CLAP 等）不在这里重复——见 /review/help。
 */
export function Help() {
  return (
    <section className="settings">
      <div className="page-head">
        <h1>帮助</h1>
        <span className="sub">四模块系统怎么用 · 数据在哪、怎么丢不了 · 出了问题看排错</span>
      </div>

      <div className="set-card">
        <h2>三步上手</h2>
        <div className="desc">每一阶段产品都完整可用——按下面的顺序，十分钟走通一次闭环</div>
        <div className="set-body">
          {QUICK_START.map((s) => (
            <div className="set-row" key={s.step} style={{ alignItems: 'flex-start' }}>
              <label style={{ width: 24, textAlign: 'center', fontWeight: 700, color: 'var(--accent-text)' }}>{s.step}</label>
              <span className="val" style={{ flex: 1 }}>
                <b>{s.title}</b>　<span style={{ color: 'var(--ink-soft)' }}>{s.desc}</span>
              </span>
              <Link to={s.to} className="btn-ghost" style={{ flex: 'none' }}>
                {s.action} →
              </Link>
            </div>
          ))}
        </div>
      </div>

      <div className="set-card">
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

      <div className="set-card">
        <h2>四模块模型</h2>
        <div className="desc">输入 → 处理 → 输出 → 回路：复盘是回路不是终点，产出的内容又变成下一轮的输入</div>
        <div className="set-body">
          {MODULES.map((m) => (
            <div className="set-row" key={m.name}>
              <label>
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: m.mark,
                    marginRight: 6,
                  }}
                  aria-hidden
                />
                {m.name}
              </label>
              <span className="val">
                {m.desc}　<span style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>{m.status}</span>
                {m.name === '回路' && (
                  <>
                    　<Link to="/review/help">方法论详情 →</Link>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="set-card">
        <h2>快捷键</h2>
        <div className="desc">键盘可达性是日常快节奏场景的生命线</div>
        <div className="set-body">
          {SHORTCUTS.map((s) => (
            <div className="set-row" key={s.keys}>
              <label>
                <kbd style={{ border: '1px solid var(--line)', borderRadius: 4, padding: '0 6px', fontSize: 'var(--fs-xs)', background: 'var(--surface-2)' }}>{s.keys}</kbd>
              </label>
              <span className="val">{s.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="set-card">
        <h2>名词表</h2>
        <div className="desc">与 06 PRD 名词表同源——每类数据只有一个说法</div>
        <div className="set-body">
          {GLOSSARY.map((g) => (
            <div className="set-row" key={g.term} style={{ alignItems: 'flex-start' }}>
              <label style={{ color: 'var(--accent-text)', fontWeight: 600 }}>{g.term}</label>
              <span className="val" style={{ color: 'var(--ink-soft)' }}>{g.def}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="set-card">
        <h2>数据与隐私</h2>
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

      <div className="set-card">
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
    </section>
  )
}
