/**
 * 帮助页内容（content as data）：六板块，全部来自既有文档与真实踩坑，
 * 与 06 PRD 名词表、04 红线、05 路线图同源——改文档时记得同步这里。
 */

export interface QuickStep {
  step: string
  title: string
  desc: string
  action: string
  to: string
}

export const QUICK_START: QuickStep[] = [
  {
    step: '1',
    title: '随手捕获',
    desc: '按 N 唤起速记浮层，想到什么写什么；顺手「转待办」直接进任务库。',
    action: '去速记',
    to: '/input/notes',
  },
  {
    step: '2',
    title: '每日两分钟',
    desc: '信源页添加原生 RSS（或导入示例信源），日报页「立即抓取」；星级反馈会调整评分标准。',
    action: '去信源管理',
    to: '/input/sources',
  },
  {
    step: '3',
    title: '每周复盘',
    desc: '做一次 3 分钟快答复盘，行动项自动落任务库——勾选闭环，下周复盘自动带出。',
    action: '新建复盘',
    to: '/review/new',
  },
  {
    step: '4',
    title: '带上外部数据',
    desc: '把别的系统里的数据带进来：输入 → 外部数据 粘贴或导入 CSV/JSON，有 API 的话直接推送。',
    action: '去外部数据',
    to: '/input/blocks',
  },
  {
    step: '5',
    title: '一键成稿',
    desc: '「周报导出为 HTML/PPT」把任务、目标、洞察、外部数据汇成周报月报——可下载 Markdown/HTML、导出 PPT、导出朗读音频。',
    action: '去报告',
    to: '/output/report',
  },
  {
    step: '6',
    title: '接进 Obsidian（可选）',
    desc: '用 Obsidian 记笔记的人专属：日报一键下载成 vault 格式的 md，周报一键发送进 Obsidian 新建笔记。不用 Obsidian 就跳过这步。',
    action: '去信息日报',
    to: '/input/digest',
  },
]

export interface ModuleIntro {
  name: string
  mark: string
  status: string
  desc: string
  to?: string
}

export const MODULES: ModuleIntro[] = [
  { name: '输入', mark: 'var(--m-input)', status: '已上线', desc: '三条通道：速记（我想到的）+ 信源/条目库（网上来的）+ 外部数据（从别的系统带来的）', to: '/input/notes' },
  { name: '处理', mark: 'var(--m-process)', status: '已上线', desc: '工具箱（文字/音频/图片/视频）+ 跨模块检索 + AI 问答（BYOK）', to: '/process' },
  { name: '输出', mark: 'var(--m-output)', status: '已上线', desc: '五个工具：周报导出为 HTML/PPT、朗读音频、数据卡片、文章草稿（速记洞察 → 文章），以及 PPT 撰写（材料 → 可编辑 PPT）——外部数据块自动并入；调研分析（公司研究）在 输入 → 外部数据 一页发起', to: '/output' },
  { name: '回路', mark: 'var(--m-review)', status: '已迁入', desc: 'CLAP 复盘、因果循环图、认知资产——产出的行动项与洞察又变成下一轮的输入', to: '/review' },
  { name: '案例', mark: 'var(--accent)', status: '独立应用', desc: '简历辅导已独立为 resume-coach 应用（本仓库 resume-coach 目录，端口 5274）：八步流程走完一个案例，从自检包到交付。PWORK 这里只做跳转入口', to: '/cases' },
]

export interface Shortcut {
  keys: string
  desc: string
}

export const SHORTCUTS: Shortcut[] = [
  { keys: 'N', desc: '速记浮层（任何页面；浮层内 Esc 存草稿、Ctrl+↵ 保存）' },
  { keys: 'Ctrl K 或 /', desc: '命令面板：搜索页面与速记、执行快速动作' },
  { keys: '?', desc: '打开本帮助页' },
  { keys: '← →', desc: '复盘向导内切步（回路模块）' },
  { keys: 'Esc', desc: '关闭浮层 / 命令面板' },
]

export interface GlossaryEntry {
  term: string
  def: string
}

export const GLOSSARY: GlossaryEntry[] = [
  { term: '闭环', def: '输入 → 处理 → 输出 → 回路：复盘产出的行动项、洞察和修正目标，都会变成下一轮的输入。把复盘当成一年一次的总结，就失去了它的作用。' },
  { term: 'SSOT', def: '每类数据只有一个拥有者模块，其他模块只持 ID 引用——双记账是个人管理系统失败的头号原因。行动项的 SSOT 是任务库。' },
  { term: 'BYOK', def: '自带 AI Key。凭据只存 localStorage、永不进备份；AI 失败自动回落规则引擎——拔掉 AI 产品完整可用。' },
  { term: '机会/威胁标记', def: '信息条目可以标记为机会、威胁或趋势。标记后进入复盘 SWOT 的候选列表，做复盘时直接选用，不用重新翻找。' },
  { term: '每日精选上限', def: '信息日报每天最多 10 条。数量是产品设计，不是用户设置；没有未读数和红点提醒，看完就处理或归档。' },
  { term: 'TTL', def: '原始抓取与已筛除条目 14 天后物理清理；有标注（星级/批注/永久保留）的条目豁免，随全量备份。' },
  { term: '健康列', def: '信源抓取失败计数：连败 3 次自动停用并告警——死源静默污染数据是最常见死法。' },
  { term: '三问分诊', def: '待办分类不问"重不重要"，问"不做的代价"：今天不做就过期 → 一类；卡住别人等我的 → 二类；都不是 → 三类。手动调整后以手动为准。' },
  { term: '外部数据块', def: '输入的第三通道：从别的系统带来的结构化片段（业务指标、系统周数据）。行内"键: 值"渲染为指标行，自动并入报告与 PPT——数据在输入管理，输出只引用。' },
  { term: '简历辅导（独立应用）', def: '简历辅导服务已独立为 resume-coach 应用：案例、材料、岗位解码、诊断、简历稿都在那边，PWORK 只保留跳转入口（侧边栏「案例」）。数据各自独立存储。' },
]

export interface DataPoint {
  title: string
  desc: string
}

export const DATA_POINTS: DataPoint[] = [
  { title: '数据都在本机', desc: '全部数据存于本机 IndexedDB（pwork-workbench 库），无账号无服务器。换机迁移用 设置 → 数据 → 全量导出/导入。' },
  { title: '备份先行', desc: '任何删除、迁移、清理之前先全量导出——设置页一键完成。月度备份提醒建议保持开启。' },
  { title: '删除皆可恢复', desc: '所有删除都是软删除：速记进回收站可恢复；条目删除后保留 14 天。物理清理只发生在「过 TTL 且无标注」或「用户删除满 14 天」的数据上。' },
  { title: 'AI 外发是明示的', desc: '不开 BYOK 一切留在本机（L1）；开启后仅条目标题摘要等发往你配置的服务商（L2，设置页有明示清单），失败自动回落规则引擎。' },
]

export interface FaqEntry {
  q: string
  a: string
  link?: { label: string; to: string }
}

export const FAQ: FaqEntry[] = [
  {
    q: '抓取全部失败？',
    a: '实测（2026-08-31）：rsshub.app 公共实例在大陆网络不可达，别直接用它。优先添加原生 RSS（少数派、HNRSS、Solidot 等实测可用），可直接导入 tools/示例信源.json。抓取链会自动走 rss2json 服务端转接；仍失败的看信源表「健康」列的错误信息，连败 3 次会自动停用。',
    link: { label: '去信源管理', to: '/input/sources' },
  },
  {
    q: '旧版复盘工作台的数据怎么迁过来？',
    a: '在旧版导出 JSON（档案页 → 备份），然后在 设置 → 数据 → 导入。兼容 FUPAN v1 旧格式，按 id + updatedAt 合并、可重复导入不产生重复。',
    link: { label: '去导入', to: '/settings' },
  },
  {
    q: '我的数据存在哪、会丢吗？',
    a: '存在浏览器本机 IndexedDB。注意：在浏览器里清除「站点数据」会连库一起删——重要节点先用设置页全量导出。程序自身的删除都是软删除，可恢复。',
    link: { label: '去备份', to: '/settings' },
  },
  {
    q: '怎么从一堆材料快速产出一份可编辑的 PPT？',
    a: '用 输出 → PPT 撰写：粘贴文字或上传 Word/PDF/Markdown 材料，AI 起草报告大纲（内部/外部措辞不同），你逐页审核修改后导出 .pptx——每一页都是原生文字框和表格，可直接编辑。没有 AI Key 也可以用内置模板手动填写。',
    link: { label: '去 PPT 撰写', to: '/output/write' },
  },
  {
    q: '怎么把一条速记变成待办或复盘素材？',
    a: '打开这条速记，编辑器左下角有两个按钮：「转待办」以它为源创建一条待办（任务上会显示"来源:速记"，可点回这条速记）；「挂到复盘」选择场景后，这条速记会挂在向导顶部，归档后永久保留在复盘档案里。',
    link: { label: '去速记', to: '/input/notes' },
  },
  {
    q: '外部系统的数据怎么进报告？',
    a: '三个办法，按方便程度选：① 输入 → 外部数据 直接粘贴；② 导入 CSV/JSON 文件（首行表头自动转成"键: 值"）；③ 有程序的话向 Worker 的 /api/ingest 推送（见 worker/README）。数据块保存后，报告和 PPT 自动多出"外部数据"章节。',
    link: { label: '去外部数据', to: '/input/blocks' },
  },
  {
    q: '为什么还有"占位"的功能？',
    a: '四大模块已全部上线，文章草稿也已实装。剩余占位只有一个：数据视频（O5，远期）——未上线的功能以占位页说明，不做假功能、不留死链接。',
    link: { label: '看路线图', to: '/process' },
  },
]

/* ---------- 配置指南（2026-10-11 分发加固）：先回答"我需要配吗"，再讲怎么配 ---------- */

export interface ConfigGuideEntry {
  title: string
  /** 谁需要动这个配置 */
  who: string
  steps: string[]
  link: { label: string; to: string }
}

export const CONFIG_GUIDE: ConfigGuideEntry[] = [
  {
    title: '自动备份（建议所有人开启）',
    who: '所有人。这是本地优先应用唯一的安全网——数据只存在这台电脑上，备份到期自动存一份完整 JSON。',
    steps: [
      '设置 → 数据 → 自动备份，选「开」，周期建议「每周」。',
      '桌面版备份存到 C:\\Users\\你的用户名\\AppData\\Roaming\\com.pwork.workbench\\backups\\ 文件夹；浏览器版存到下载文件夹。',
      '想手动备份随时点同一页的「全量导出」。',
    ],
    link: { label: '去设置', to: '/settings' },
  },
  {
    title: 'AI 功能（可选：不配也完全能用）',
    who: '想用复盘 AI 教练、全库问答、AI 写大纲的人。不配 AI，评分走本地规则、导出走内置模板，所有功能照常。',
    steps: [
      '桌面版：在 C:\\Users\\你的用户名\\AppData\\Roaming\\com.pwork.workbench\\ 新建文本文件 gateway.env，写入一行 PWORK_LLM_API_KEY=你的Key，重启应用（Key 从大模型服务商官网获取，如 DeepSeek / 智谱开放平台）。',
      '浏览器版：在应用目录复制 tools/.env.example 为 .env.local，填同样的内容，再运行 npm run gateway。',
      '设置 → AI · BYOK 选「本地网关」，点「测试网关」看到"在线，Key 已配置"即成功。',
      'Key 只存在你自己电脑的这个文件里：不上传、不进备份、界面永不显示。',
    ],
    link: { label: '去 AI 设置', to: '/settings' },
  },
  {
    title: '云端同步（可选：想 24 小时自动抓信源的人才需要）',
    who: '默认不需要。不配置云端，应用是纯本地工具，所有功能可用。它的唯一作用：让云端服务器按计划替你抓信源，你打开应用时拉回合并——适合不想每次手动点「立即抓取」的人。需要自己的 Cloudflare 账号（免费）。',
    steps: [
      '先把抓取服务部署到你的 Cloudflare：需要从开源仓库获取 worker 目录，按其中的 README 部署（一次性，约 15 分钟）。',
      '部署完拿到两个 ID：账户 ID（Cloudflare 控制台首页右侧）、数据库 ID（部署输出里）。',
      '建一个 API Token：控制台右上角头像 → 我的个人资料 → API 令牌 → 创建令牌，权限只给「账户 → D1 → 编辑」。',
      '设置 → 云端同步，模式选「D1 直连」，填账户 ID、数据库 ID、Token，点「测试连接」。',
      '「端点」和「D1 直连」是同一个东西的两条通道：端点走 workers.dev 域名（部分网络打不开），D1 直连走 Cloudflare 官方接口（更稳，推荐）。',
    ],
    link: { label: '去云端同步', to: '/settings' },
  },
  {
    title: '转接服务（可选：抓取经常超时的人才需要）',
    who: '信息日报有部分信源浏览器直连不了，要走一个公共转接服务；它偶尔慢或超时（表现为那几个源频繁失败）。多数人不用管。',
    steps: [
      '如果你自建了转接服务（或换了别的转接地址）：设置 → 采集偏好 → 转接服务，填入你的地址。',
      '留空 = 用默认公共服务。改完下一次抓取生效。',
    ],
    link: { label: '去采集偏好', to: '/settings' },
  },
  {
    title: 'Obsidian 联动（可选：只在用 Obsidian 记笔记时有用）',
    who: '用 Obsidian 的人。不用 Obsidian 可以完全忽略——PWORK 自己就是完整的存储，这里只是把成稿顺手送进你的笔记库。',
    steps: [
      '信息日报：日报页右上「⬇ 导出 Obsidian 日报」，得到一个 md 文件（带日期命名和元数据），拖进 vault 的「信息日报」文件夹即可。',
      '周报/月报：报告页底部「📓 写入 Obsidian」，会通过 Obsidian 协议直接新建笔记（需要这台电脑装了 Obsidian；想进指定库就在旁边填 vault 名）。',
      '方向是单向的：PWORK → Obsidian。条目的星级和批注仍以 PWORK 为准。',
    ],
    link: { label: '去信息日报试试', to: '/input/digest' },
  },
]
