import { Link } from 'react-router-dom'
import { useUi } from '../store/ui'

/**
 * 设计系统样例页（W1 验收项）：令牌是宪法——新组件先入样例页再上页面。
 * 「未来组件」区块预览 W2（评分徽章）/ W3（任务行、来源徽章）规格，落地时以本页为准。
 */

const COLOR_TOKENS: { name: string; varName: string }[] = [
  { name: '底色', varName: '--bg' },
  { name: '表面', varName: '--surface' },
  { name: '表面-2', varName: '--surface-2' },
  { name: '线', varName: '--line' },
  { name: '线-强', varName: '--line-strong' },
  { name: '墨', varName: '--ink' },
  { name: '墨-柔', varName: '--ink-soft' },
  { name: '墨-淡', varName: '--ink-faint' },
  { name: '琥珀', varName: '--accent' },
  { name: '琥珀-深', varName: '--accent-deep' },
  { name: '琥珀-文字', varName: '--accent-text' },
  { name: '类别·好', varName: '--cat-good' },
  { name: '类别·待提升', varName: '--cat-need' },
  { name: '类别·洞察', varName: '--cat-insight' },
  { name: '类别·行动', varName: '--cat-action' },
  { name: '语义·危险', varName: '--danger' },
  { name: '语义·成功', varName: '--ok' },
]

const MODULE_MARKS: { label: string; varName: string; note: string }[] = [
  { label: '输入', varName: '--m-input', note: '复用 --cat-insight' },
  { label: '处理', varName: '--m-process', note: '复用 --cat-good' },
  { label: '输出', varName: '--m-output', note: '复用 --cat-action' },
  { label: '回路', varName: '--m-review', note: '复用 --accent（闭环枢纽）' },
]

const TYPE_SCALE: { token: string; sample: string }[] = [
  { token: '--fs-xs 12px', sample: '标签、说明' },
  { token: '--fs-sm 13px', sample: '次要文本' },
  { token: '--fs-md 16px', sample: '正文' },
  { token: '--fs-lg 18px', sample: '卡片标题' },
  { token: '--fs-xl 20px', sample: '区块标题' },
  { token: '--fs-h1 28px', sample: '页面标题' },
  { token: '--fs-hero 32px', sample: '仪表盘主标语' },
  { token: '--fs-num 24px', sample: '统计数字' },
]

const SPACES = ['--sp-1', '--sp-2', '--sp-3', '--sp-4', '--sp-5', '--sp-6', '--sp-7']

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 80 ? 'hi' : score >= 60 ? 'mid' : 'lo'
  return (
    <span
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: 44,
        color: cls === 'hi' ? 'var(--accent-text)' : cls === 'mid' ? 'var(--ink)' : 'var(--ink-faint)',
        border: `1px solid ${cls === 'hi' ? 'var(--accent)' : cls === 'mid' ? 'var(--line-strong)' : 'var(--line)'}`,
        borderRadius: 'var(--r-sm)',
        padding: '2px 0',
      }}
    >
      <b className="tnum" style={{ fontSize: 'var(--fs-lg)', lineHeight: 1.1 }}>{score}</b>
      <span style={{ fontSize: 'var(--fs-xs)' }}>评分</span>
    </span>
  )
}

export function DesignSystem() {
  const openPalette = useUi((s) => s.openPalette)

  return (
    <section>
      <div className="page-head">
        <h1>设计系统 · 组件样例</h1>
        <span className="sub">v3「冷静的工作台」令牌 · 组件禁止自造数值（纪律④）</span>
      </div>

      <div className="ds-section">
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>色彩令牌</h2>
        <div className="ds-row">
          {COLOR_TOKENS.map((c) => (
            <div className="ds-swatch" key={c.varName}>
              <div className="sw" style={{ background: `var(${c.varName})` }} />
              <div className="sw-name">{c.varName}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="ds-section">
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>模块标记（PRD §5.2：零新增色，仅 3px 边线与 12px 标签）</h2>
        <div className="ds-row">
          {MODULE_MARKS.map((m) => (
            <div
              key={m.varName}
              style={{
                borderLeft: '3px solid var(' + m.varName + ')',
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderLeftWidth: '3px',
                borderLeftColor: `var(${m.varName})`,
                borderRadius: 'var(--r-sm)',
                padding: 'var(--sp-2) var(--sp-3)',
                fontSize: 'var(--fs-sm)',
              }}
            >
              {m.label}
              <span style={{ marginLeft: 8, fontSize: 'var(--fs-xs)', color: m.varName === undefined ? undefined : `var(${m.varName})` }}>{m.note}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="ds-section">
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>字号阶梯（8 级）</h2>
        <div className="ds-box">
          {TYPE_SCALE.map((t) => (
            <div key={t.token} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)' }}>
              <code style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', width: 120 }}>{t.token}</code>
              <span style={{ fontSize: t.token.split(' ')[1] }}>{t.sample}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="ds-section">
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>间距 / 圆角 / 阴影</h2>
        <div className="ds-row">
          {SPACES.map((s) => (
            <div key={s} style={{ textAlign: 'center' }}>
              <div style={{ width: `var(${s})`, height: 32, background: 'var(--accent)', borderRadius: 2 }} />
              <code style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{s}</code>
            </div>
          ))}
        </div>
        <div className="ds-row" style={{ marginTop: 'var(--sp-3)' }}>
          {['--r-sm', '--r-md', '--r-lg'].map((r) => (
            <div key={r} style={{ width: 72, height: 48, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: `var(${r})`, display: 'grid', placeItems: 'center', fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{r}</div>
          ))}
          {['--shadow-1', '--shadow-2', '--shadow-pop'].map((s) => (
            <div key={s} style={{ width: 72, height: 48, background: 'var(--surface)', borderRadius: 'var(--r-sm)', boxShadow: `var(${s})`, display: 'grid', placeItems: 'center', fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{s}</div>
          ))}
        </div>
      </div>

      <div className="ds-section">
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>按钮 / Chips</h2>
        <div className="ds-row">
          <button type="button" className="btn-primary">主按钮</button>
          <button type="button" className="btn-ghost">次按钮</button>
          <button type="button" className="btn-primary" disabled>禁用</button>
          <button type="button" className="btn-ghost" disabled>禁用</button>
          <button type="button" className="chip">chip</button>
          <button type="button" className="chip on">chip 选中</button>
        </div>
      </div>

      <div className="ds-section">
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>摘要瓦片 / 模块卡（首页组件）</h2>
        <div className="ds-row" style={{ alignItems: 'stretch' }}>
          <div className="tile mark-input" style={{ width: 220 }}>
            <div className="t-label">信息日报</div>
            <div className="t-num">10 条</div>
            <div className="t-sub">约 2 分钟</div>
            <span className="t-link">去扫读 →</span>
          </div>
          <div className="mcard mark-input" style={{ width: 220 }}>
            <div className="m-head">
              <span className="m-ico" aria-hidden>⚡</span>
              <span className="m-name">输入</span>
              <span className="m-tag">活跃</span>
            </div>
            <div className="m-sub">捕获想法</div>
            <div className="m-links"><div className="m-link">速记<span className="cnt">12</span></div></div>
          </div>
          <div className="mcard planned mark-process" style={{ width: 220 }}>
            <div className="m-head">
              <span className="m-ico" aria-hidden>⚗</span>
              <span className="m-name">处理</span>
              <span className="m-tag">规划中</span>
            </div>
            <div className="m-sub">AI 提纯</div>
          </div>
        </div>
      </div>

      <div className="ds-section">
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>空状态</h2>
        <div className="ds-box">
          <div className="empty">
            <div className="e-ico" aria-hidden>✎</div>
            <p>第一条速记会在这里。按 N 随时开始。</p>
            <button type="button" className="btn-primary">＋ 新速记</button>
          </div>
        </div>
      </div>

      <div className="ds-section">
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>命令面板</h2>
        <div className="ds-box">
          <button type="button" className="btn-ghost" onClick={openPalette}>按 Ctrl+K 或点击打开命令面板</button>
          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', marginTop: 'var(--sp-2)' }}>
            快速动作 / 页面 / 速记混合搜索；W3 任务库上线后扩展（开放问题 C-4）。
          </p>
        </div>
      </div>

      <div className="ds-section">
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>未来组件规格（W2/W3 落地时对齐本页）</h2>
        <div className="ds-row">
          <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
            <ScoreBadge score={82} />
            <ScoreBadge score={71} />
            <ScoreBadge score={45} />
          </div>
        </div>
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', marginTop: 'var(--sp-2)' }}>
          评分徽章（W2）：≥80 琥珀描边 · 60–79 常规 · &lt;60 淡灰；hover 出 AI ≤30 字评分理由。
          任务行（W3）：复选框 + 标题 + 来源徽章（12px：复盘=琥珀 / 速记·信息=蓝 / 手动=灰）+ 到期日（逾期 danger）。
        </p>
      </div>

      <div className="ds-section">
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>页面索引</h2>
        <p style={{ fontSize: 'var(--fs-sm)' }}>
          <Link to="/">今日</Link> · <Link to="/input/notes">速记</Link> · <Link to="/settings">设置</Link> ·{' '}
          <Link to="/process">处理（占位）</Link> · <Link to="/review">回路（占位）</Link>
        </p>
      </div>
    </section>
  )
}
