import { Link } from 'react-router-dom'
import { Icon } from '../components/shell/icons'
import { useTasks } from '../store/tasks'
import { useCollect } from '../store/collect'
import { useGoals } from '../store/goals'
import { useNotes } from '../store/notes'

interface Tool { to: string; icon: string; name: string; desc: string; status: string }

/** 按产出形态分组（2026-10-13 用户拍板：文 / 音 / 图 / 视，与处理页工具箱同一结构；名字短名不换行） */
const TOOL_GROUPS: { id: string; icon: string; name: string; desc: string; tools: Tool[] }[] = [
  {
    id: 'doc',
    icon: 'file',
    name: '文 · 文档与演示',
    desc: '把库里的积累变成能发出去、交出去的成稿',
    tools: [
      { to: '/output/report', icon: 'barChart', name: '周报导出', desc: '本周/本月素材 + 外部数据块自动成稿', status: 'HTML · PPT · MD' },
      { to: '/output/research', icon: 'search', name: '调研分析', desc: '输入目标 → 拿调研框架与逐节提示词 → 贴回发现 → 出稿', status: 'MD · Word' },
      { to: '/output/write', icon: 'grid', name: 'PPT 撰写', desc: '粘贴文字或上传 Word/PDF/MD → AI 大纲 → 可编辑 PPT', status: '.pptx' },
      { to: '/output/article', icon: 'pen', name: '文章草稿', desc: '速记与洞察按周期聚合 → AI 整理骨架', status: 'Markdown' },
    ],
  },
  {
    id: 'audio',
    icon: 'headphones',
    name: '音 · 聆听',
    desc: '通勤场景——用听的回顾一个周期',
    tools: [{ to: '/output/read', icon: 'volume', name: '朗读音频', desc: '周报转语音', status: '音频' }],
  },
  {
    id: 'image',
    icon: 'image',
    name: '图 · 分享',
    desc: '关键数字变成一张可发出去的图',
    tools: [{ to: '/output/card', icon: 'creditCard', name: '数据卡片', desc: '关键数字生成分享卡片图', status: '图片' }],
  },
  {
    id: 'video',
    icon: 'film',
    name: '视频',
    desc: '数据变化 → 短视频',
    tools: [{ to: '/output/video', icon: 'video', name: '数据视频', desc: '数据变化 → 短视频', status: '远期' }],
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
        <div className="desc">按产出形态分类：文（文档与演示）→ 音 → 图 → 视频；本地渲染优先，外部工具精选跳转</div>
        <div className="set-body">
          <div className="module-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {TOOL_GROUPS.map((g) => (
              <div key={g.id} className="mcard">
                <div className="m-head">
                  <span className="m-ico" aria-hidden><Icon name={g.icon} /></span>
                  <span className="m-name">{g.name}</span>
                </div>
                <div className="m-sub">{g.desc}</div>
                <div className="m-links">
                  {g.tools.map((t) => (
                    <Link key={t.to} to={t.to} className="m-link" title={t.desc} style={t.status === '远期' ? { opacity: 0.55 } : undefined}>
                      <span>
                        <span className="m-ico-inline" aria-hidden><Icon name={t.icon} size={14} /></span>
                        {t.name}
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
          <div className="module-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {EXTERNAL.map((e) => (
              <a key={e.url} href={e.url} target="_blank" rel="noreferrer noopener" className="mcard mcard-link">
                <div className="m-head">
                  <span className="m-ico" aria-hidden><Icon name="globe" /></span>
                  <span className="m-name">{e.name}</span>
                </div>
                <div className="m-sub">{e.desc}</div>
                <div className="m-links">
                  <span className="m-link">打开官网<span className="cnt">↗</span></span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
