import { Link } from 'react-router-dom'
import { useUi } from '../store/ui'

/**
 * 设计系统样例页（W1 验收项）：令牌是宪法——新组件先入样例页再上页面。
 * 「未来组件」区块预览 W2（评分徽章）/ W3（任务行、来源徽章）规格，落地时以本页为准。
 * 3.2 改版对照（2026-11-12）：六个维度的现值 vs 提案值并排展示，用户逐维拍板后
 * 提案值才落 tokens.css——本页是唯一事实来源，拍板前提案值不进任何生产样式。
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
          <button type="button" className="btn-ghost" onClick={() => openPalette()}>按 Ctrl+K 或点击打开命令面板</button>
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
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>3.2 改版对照（逐维拍板，提案值未落生产样式）</h2>
        <div className="desc" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', marginBottom: 'var(--sp-3)' }}>
          方向=伙伴感升级（logo 动效确立的 Perfect Partner 语言），品牌锚不动：琥珀三级与米白基调保留。
          每维左=现值，右=提案值。全部提案组合已过 WCAG AA 实测（数字见下方实测表），拍板哪维落哪维。
        </div>

        {/* A. 底色温度 */}
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>A · 底色温度：暖一档（亮暗两套同步提案；暗色 faint 同步修正到 AA 达标）</div>
          <div className="ds-row">
            <div style={{ flex: 1, minWidth: 170 }}>
              <div style={{ height: 56, background: '#f5f4f1', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', display: 'grid', placeItems: 'center', fontSize: 'var(--fs-xs)', color: 'var(--ink-soft)' }}>现亮 · #f5f4f1</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', marginTop: 4 }}>现亮底：偏中性灰白</div>
            </div>
            <div style={{ flex: 1, minWidth: 170 }}>
              <div style={{ height: 56, background: '#f7f3ea', border: '1px solid #e5ddcc', borderRadius: 'var(--r-sm)', display: 'grid', placeItems: 'center', fontSize: 'var(--fs-xs)', color: 'var(--ink-soft)' }}>提案亮 · #f7f3ea</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', marginTop: 4 }}>米调+暖，与 logo 米白同族</div>
            </div>
            <div style={{ flex: 1, minWidth: 170 }}>
              <div style={{ height: 56, background: '#191816', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', display: 'grid', placeItems: 'center', fontSize: 'var(--fs-xs)', color: 'var(--ink-soft)' }}>现暗 · #191816</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', marginTop: 4 }}>现暗底（faint 4.33 不达 AA）</div>
            </div>
            <div style={{ flex: 1, minWidth: 170 }}>
              <div style={{ height: 56, background: '#1b1813', border: '1px solid #3a342a', borderRadius: 'var(--r-sm)', display: 'grid', placeItems: 'center', fontSize: 'var(--fs-xs)', color: 'var(--ink-soft)' }}>提案暗 · #1b1813</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', marginTop: 4 }}>暖暗棕 + faint 提亮 #918a7e（5.17 达标）</div>
            </div>
          </div>
        </div>

        {/* B. 圆角 */}
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>B · 圆角阶梯：整体 +2px（控件 8→10 / 浮层 12→14 / 卡片 16→18，圆润=伙伴感）</div>
          <div className="ds-row">
            {[['--r-sm', '--r-md', '--r-lg'], ['10px', '14px', '18px']].map((group, gi) => (
              <div key={gi} className="ds-row" style={{ alignItems: 'center', flex: 1, minWidth: 200 }}>
                {group.map((r) => (
                  <div key={r} style={{ width: 64, height: 44, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: gi === 0 ? `var(${r})` : r, display: 'grid', placeItems: 'center', fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{gi === 0 ? '现' : '新'} {r.replace('--r-', '')}</div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* C. 阴影色温 + 浮起档 */}
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>C · 阴影：中性黑 → 暖棕投影（与品牌同温）；新增浮起档（卡片 hover 统一语言）</div>
          <div className="ds-row">
            <div style={{ width: 140, height: 64, background: 'var(--surface)', borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-2)', display: 'grid', placeItems: 'center', fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>现 · shadow-2</div>
            <div style={{ width: 140, height: 64, background: '#fffdf9', borderRadius: '14px', boxShadow: '0 2px 4px rgba(90, 62, 32, 0.07), 0 8px 20px rgba(90, 62, 32, 0.10)', display: 'grid', placeItems: 'center', fontSize: 'var(--fs-xs)', color: 'var(--ink-soft)' }}>提案 · 暖棕</div>
            <div style={{ width: 140, height: 64, background: '#fffdf9', borderRadius: '14px', boxShadow: '0 4px 10px rgba(90, 62, 32, 0.10), 0 14px 32px rgba(90, 62, 32, 0.16)', display: 'grid', placeItems: 'center', fontSize: 'var(--fs-xs)', color: 'var(--accent-text)', fontWeight: 600 }}>提案 · 浮起档</div>
          </div>
        </div>

        {/* D. 悬停底 */}
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>D · 悬停底色：新增 --accent-soft 令牌（现在各处手写 color-mix 琥珀 8%，值不统一）</div>
          <div className="ds-row">
            <button type="button" className="btn-ghost" style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)', borderColor: 'var(--accent)' }}>现 · 手写 8%（示例）</button>
            <button type="button" className="btn-ghost" style={{ background: 'rgba(232, 131, 58, 0.10)', borderColor: 'var(--accent)' }}>提案 · accent-soft 10%</button>
          </div>
        </div>

        {/* E. 动效：完成态回弹曲线 */}
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>E · 动效：新增回弹曲线 --ease-spring（完成态/成功反馈专用；点击两个按钮对比手感）</div>
          <div className="ds-row">
            <button
              type="button"
              className="btn-ghost"
              onClick={(e) => { e.currentTarget.style.transform = 'scale(0.9)'; window.setTimeout(() => { e.currentTarget.style.transition = 'transform 300ms var(--ease)'; e.currentTarget.style.transform = 'scale(1)' }, 60); window.setTimeout(() => { e.currentTarget.style.transition = '' }, 400) }}
            >现 · 标准缓动（--ease）</button>
            <button
              type="button"
              className="btn-ghost"
              onClick={(e) => { e.currentTarget.style.transform = 'scale(0.9)'; window.setTimeout(() => { e.currentTarget.style.transition = 'transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1)'; e.currentTarget.style.transform = 'scale(1)' }, 60); window.setTimeout(() => { e.currentTarget.style.transition = '' }, 500) }}
            >提案 · 回弹（ease-spring）</button>
          </div>
        </div>

        {/* F. 焦点环 */}
        <div>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>F · 焦点环：双层设计（实色环 --accent-deep 承担可见性 5.25，外晕 --ring-soft 琥珀 18% 只作柔化）——Tab 到两个输入框对比</div>
          <div className="ds-row">
            <input className="input" placeholder="现 · 各控件自带" readOnly />
            <input
              className="input"
              placeholder="提案 · 双层环（Tab 试试）"
              readOnly
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-deep)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(232, 131, 58, 0.18)'; e.currentTarget.style.background = 'var(--surface)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.boxShadow = ''; e.currentTarget.style.background = '' }}
            />
          </div>
        </div>

        {/* 对比度实测表 */}
        <div style={{ marginTop: 'var(--sp-5)', borderTop: '1px solid var(--line)', paddingTop: 'var(--sp-3)' }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>对比度实测（WCAG：正文 AA ≥ 4.5，非文本 ≥ 3.0；全部组合已逐对计算）</div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-soft)', lineHeight: 2 }}>
            <div>亮底提案 #f7f3ea 上：ink 14.99 ✓ · ink-soft 5.48 ✓ · ink-faint 4.57 ✓（余量薄，如实告知）</div>
            <div>暗底提案 #1b1813 上：ink 14.83 ✓ · ink-soft 8.08 ✓ · ink-faint 提亮 #918a7e 后 5.17 ✓（现值 #827d73 仅 4.33 不达标——现体系既有缺陷，随 A 维一并修正）</div>
            <div>琥珀文字 #a34e12 于提案悬停底（10% 叠白）：5.25 ✓ · 白字压琥珀深 #b0500f：5.25 ✓</div>
            <div>焦点环实色 #b0500f：白底 5.25 ✓ / 提案底 4.74 ✓（琥珀原色 #e8833a 做环只有 2.45–2.71，不达标——故环用深琥珀）</div>
            <div style={{ color: 'var(--ink-faint)' }}>既有发现（非提案引入）：琥珀 #e8833a 作选中边线对白底仅 2.71（3px 边线类），未来如需达标可切 --accent-deep——单独议题不在本批。</div>
          </div>
        </div>
      </div>

      <div className="ds-section">
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>页面索引</h2>
        <p style={{ fontSize: 'var(--fs-sm)' }}>
          <Link to="/">今日</Link> · <Link to="/input/notes">速记</Link> · <Link to="/settings">设置</Link> ·{' '}
          <Link to="/process">处理（工具箱）</Link> · <Link to="/review">回路（已建成）</Link>
        </p>
      </div>
    </section>
  )
}
