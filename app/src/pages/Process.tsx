import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/shell/icons'
import { CATEGORY_META, CATEGORY_ORDER, PROCESS_TOOLS, ENGINE_LABEL, toolRoute } from '../content/processTools'
import { byRecentUse, loadQuickSites, makeSite, normalizeSiteUrl, saveQuickSites, type QuickSite } from '../engine/quickLaunch'
import { toast } from '../engine/toast'

/**
 * 处理模块主页：工具箱 + 快速启动。
 * 跨模块检索在 Ctrl K 命令面板（同一能力不占两处入口）。
 * AI 全库问答暂停（上下文深度与检索升级前不达预期，2026-10-23 用户拍板；见 TODO）。
 * 工具注册表见 content/processTools.ts——加新工具先注册再实现组件。
 */
export function Process() {
  // 快速启动（2026-10-13 用户拍板：常用 AI/网页的统一入口，与调研页跳转共用清单）
  const [sites, setSites] = useState<QuickSite[]>(() => loadQuickSites())
  const [editing, setEditing] = useState<(QuickSite & { isNew?: boolean }) | null>(null)

  const persist = (next: QuickSite[]) => {
    setSites(next)
    saveQuickSites(next)
  }

  const openSite = (site: QuickSite) => {
    window.open(site.url, '_blank', 'noreferrer noopener')
    persist(sites.map((s) => (s.id === site.id ? { ...s, lastUsedAt: Date.now() } : s)))
  }

  const saveEditing = () => {
    if (!editing) return
    const url = normalizeSiteUrl(editing.url)
    if (!url) {
      toast('error', '网址不像一个网址——检查拼写（例：chat.deepseek.com）')
      return
    }
    const name = editing.name.trim()
    if (!name) {
      toast('error', '先给这个站点起个名字')
      return
    }
    if (editing.isNew) {
      persist([...sites, makeSite(name, url)])
      toast('ok', `已添加「${name}」`)
    } else {
      persist(sites.map((s) => (s.id === editing.id ? { ...s, name, url } : s)))
      toast('ok', `已更新「${name}」`)
    }
    setEditing(null)
  }

  return (
    <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
      <div className="page-head">
        <h1>处理</h1>
        <span className="sub">工具箱（文字/音频/图片/视频）· 快速启动；跨模块检索在 <kbd>Ctrl K</kbd> 命令面板</span>
      </div>

      <div className="set-card">
        <h2>工具箱</h2>
        <div className="desc">按信息形态分类：文字 → 音频 → 图片 → 视频；本地引擎离线可用，生成类为 BYOK 占位</div>
        <div className="set-body">
          <div className="module-grid">
            {CATEGORY_ORDER.map((cat) => {
              const meta = CATEGORY_META[cat]
              const tools = PROCESS_TOOLS.filter((t) => t.category === cat)
              return (
                <div key={cat} className="mcard" style={{ borderLeft: '3px solid ' + meta.mark }}>
                  <div className="m-head">
                    <span className="m-ico" aria-hidden><Icon name={meta.icon} /></span>
                    <span className="m-name">{meta.name}</span>
                  </div>
                  <div className="m-sub">{meta.desc}</div>
                  <div className="m-links">
                    {tools.map((t) =>
                      t.engine === 'external' ? (
                        <a key={t.id} href={t.externalUrl} target="_blank" rel="noreferrer noopener" className="m-link">
                          <span>↗ {t.name}</span>
                          <span className="cnt">外部</span>
                        </a>
                      ) : (
                        <Link key={t.id} to={toolRoute(t.id)} className="m-link" style={t.status === 'byok-pending' ? { opacity: 0.55 } : undefined}>
                          <span>
                            {t.status === 'byok-pending' && (
                              <span aria-hidden className="kmark" style={{ display: 'inline-flex', verticalAlign: '-3px', marginRight: 4, color: 'var(--accent-text)' }}>
                                <Icon name="key" size={13} />
                              </span>
                            )}
                            {t.name}
                          </span>
                          <span className="cnt">{t.status === 'ready' ? ENGINE_LABEL[t.engine].replace('本地 · ', '') : '需 Key'}</span>
                        </Link>
                      )
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="set-card">
        <h2>快速启动</h2>
        <div className="desc">常用 AI 和网页的入口——点击在浏览器新标签打开；最近用过的排前面，清单只存本机（换机需重配）</div>
        <div className="set-body">
          <div className="chips" style={{ marginBottom: editing ? 'var(--sp-3)' : 0 }}>
            {byRecentUse(sites).map((s) => (
              <button
                key={s.id}
                type="button"
                className="chip on"
                title={s.url}
                onClick={() => openSite(s)}
                onContextMenu={(e) => {
                  // 右键 = 编辑（不打扰默认态；也避免每项挂常驻小按钮的视觉噪音）
                  e.preventDefault()
                  setEditing({ ...s })
                }}
              >
                {s.name} ↗
              </button>
            ))}
            <button type="button" className="chip" onClick={() => setEditing({ ...makeSite('', ''), isNew: true })}>
              ＋ 添加
            </button>
          </div>
          {editing && (
            <div className="set-row" style={{ flexWrap: 'wrap' }}>
              <input
                className="input"
                style={{ maxWidth: 180 }}
                placeholder="名称（如：豆包）"
                value={editing.name}
                aria-label="站点名称"
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && saveEditing()}
              />
              <input
                className="input"
                style={{ flex: 1, minWidth: 220 }}
                placeholder="网址（如：www.doubao.com，协议可省略）"
                value={editing.url}
                aria-label="站点网址"
                onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && saveEditing()}
              />
              <button type="button" className="btn-primary" onClick={saveEditing}>
                {editing.isNew ? '添加' : '保存'}
              </button>
              {!editing.isNew && (
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => {
                    if (window.confirm(`删除「${editing.name}」的快捷入口？`)) {
                      persist(sites.filter((s) => s.id !== editing.id))
                      setEditing(null)
                    }
                  }}
                >
                  删除
                </button>
              )}
              <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>取消</button>
            </div>
          )}
          <div className="set-row" style={{ marginTop: 'var(--sp-2)' }}>
            <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
              增删改：点「＋ 添加」，或在任意入口上<b>右键</b>编辑；排序按最近使用自动置前
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
