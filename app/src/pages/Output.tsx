import { Link } from 'react-router-dom'
import { useTasks } from '../store/tasks'
import { useCollect } from '../store/collect'
import { useGoals } from '../store/goals'
import { useNotes } from '../store/notes'
import { searchAll } from '../engine/searchAll'

interface Tool { to: string; icon: string; name: string; desc: string; status: string }

/** 按产出形态分组（2026-10-12 用户拍板：文 / 图 / 音 / 视频，与处理页工具箱同一结构） */
const TOOL_GROUPS: { id: string; icon: string; name: string; desc: string; tools: Tool[] }[] = [
  {
    id: 'doc',
    icon: '📄',
    name: '文 · 文档与演示',
    desc: '把库里的积累变成能发出去、交出去的成稿',
    tools: [
      { to: '/output/report', icon: '📊', name: '周报导出为 HTML/PPT', desc: '本周/本月素材 + 外部数据块自动成稿', status: 'MD / HTML / PPT' },
      { to: '/output/research', icon: '🔎', name: '调研分析（公司研究）', desc: '选对象 → 贴材料 → 出分析文档', status: 'MD / Word' },
      { to: '/output/write', icon: '🧩', name: 'PPT 撰写', desc: '粘贴文字或上传 Word/PDF/MD → AI 大纲 → 可编辑 PPT', status: '.pptx' },
      { to: '/output/article', icon: '✍', name: '文章草稿', desc: '速记与洞察按周期聚合 → AI 整理骨架', status: 'Markdown' },
    ],
  },
  {
    id: 'image',
    icon: '🖼',
    name: '图 · 分享',
    desc: '关键数字变成一张可发出去的图',
    tools: [{ to: '/output/card', icon: '🖼', name: '周报导出为数据卡片', desc: '关键数字生成分享卡片图', status: '图片' }],
  },
  {
    id: 'audio',
    icon: '🎧',
    name: '音 · 聆听',
    desc: '通勤场景——用听的回顾一个周期',
    tools: [{ to: '/output/read', icon: '🎧', name: '周报导出为朗读音频', desc: '周报转语音', status: '音频' }],
  },
  {
    id: 'video',
    icon: '🎬',
    name: '视频',
    desc: '数据变化 → 短视频',
    tools: [{ to: '/output/video', icon: '🎬', name: '数据视频', desc: '数据变化 → 短视频', status: '远期规划' }],
  },
]

const EXTERNAL: { name: string; url: string; desc: string }[] = [
  { name: 'Canva 可画', url: 'https://www.canva.cn/', desc: '长图/海报排版设计' },
  { name: '墨滴 / Md2All', url: 'https://mdnice.com/', desc: 'Markdown 一键排版到公众号' },
  { name: 'Gamma', url: 'https://gamma.app/', desc: 'AI 生成设计感演示文稿（海外服务）' },
  { name: '讯飞智文', url: 'https://zhiwen.xfyun.cn/', desc: 'AI 一键生成 PPT（中文友好）' },
]

/** 输出模块主页（IT Tools 模式）：场景分类的工具箱——HTML·PPT / 朗读音频 / 数据卡片 / 文章草稿 / 外链精选 */
export function Output() {
  const stats = useTasks((s) => s.stats)
  const goals = useGoals((s) => s.goals)
  const items = useCollect((s) => s.items)
  const notes = useNotes((s) => s.notes)
  void searchAll
  const materialReady = stats.total > 0 || goals.filter((g) => g.status === 'active').length > 0 || items.length > 0 || notes.length > 0

  return (
    <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
      <div className="page-head">
        <h1>输出</h1>
        <span className="sub">把库里的积累变成能发出去、交出去、存出去的交付物 · 模板 × 数据 × 渲染</span>
      </div>

      {!materialReady && (
        <div className="notice" style={{ marginBottom: 'var(--sp-4)' }}>
          库里还没有素材——先记几条速记、做一次复盘，报告才有内容可写。
        </div>
      )}

      <div className="set-card">
        <h2>输出工具箱</h2>
        <div className="desc">按产出形态分类：文（文档与演示）→ 图 → 音 → 视频；本地渲染优先，外部工具精选跳转</div>
        <div className="set-body">
          <div className="module-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {TOOL_GROUPS.map((g) => (
              <div key={g.id} className="mcard">
                <div className="m-head">
                  <span className="m-ico" aria-hidden>{g.icon}</span>
                  <span className="m-name">{g.name}</span>
                </div>
                <div className="m-sub">{g.desc}</div>
                <div className="m-links">
                  {g.tools.map((t) => (
                    <Link key={t.to} to={t.to} className="m-link" title={t.desc} style={t.status === '远期规划' ? { opacity: 0.55 } : undefined}>
                      <span>
                        {t.icon} {t.name}
                      </span>
                      <span className="cnt">{t.status}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="set-card">
        <h2>外部工具精选（跳转官网）</h2>
        <div className="desc">更好用的外部能力不重复造轮子——直接绑定跳转；欢迎积累增补</div>
        <div className="set-body">
          {EXTERNAL.map((e) => (
            <div className="set-row" key={e.url}>
              <label style={{ width: 'auto', fontWeight: 600, color: 'var(--ink)' }}>{e.name}</label>
              <span className="val" style={{ color: 'var(--ink-soft)' }}>{e.desc}</span>
              <a href={e.url} target="_blank" rel="noreferrer noopener" className="btn-ghost" style={{ marginLeft: 'auto', textDecoration: 'none' }}>
                打开 ↗
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
