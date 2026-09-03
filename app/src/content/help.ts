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
  { name: '输出', mark: 'var(--m-output)', status: '已上线', desc: '五个工具：周报导出为 HTML/PPT、朗读音频、数据卡片、文章草稿（速记洞察 → 文章），以及 PPT 撰写（材料 → 可编辑 PPT）——外部数据块自动并入', to: '/output' },
  { name: '回路', mark: 'var(--m-review)', status: '已迁入', desc: 'CLAP 复盘、因果循环图、认知资产——产出的行动项与洞察又变成下一轮的输入', to: '/review' },
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
