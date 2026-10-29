/**
 * 帮助页内容（content as data）：六板块，全部来自既有文档与真实踩坑，
 * 与 06 PRD 名词表、04 红线、05 路线图同源——改文档时记得同步这里。
 */

/**
 * 四模块能力卡（首访引导第 1 步与帮助-快速上手共用）：
 * 每个模块一段演示视频（app/public/demo/*.webm，应用真实操作录制、循环播放）。
 * 文案描述模块能力本身；视频展示真实操作路径。
 */
export interface ModuleIntro {
  key: string
  name: string
  tagline: string
  desc: string
  video: string
  to: string
  action: string
}

export const MODULES: ModuleIntro[] = [
  {
    key: 'input',
    name: '输入',
    tagline: '记下来',
    desc: '速记浮层按 N 随手记、可转待办；订阅信源与信息日报一键抓进库。',
    video: '/demo/demo-input.webm',
    to: '/input/notes',
    action: '去速记',
  },
  {
    key: 'process',
    name: '处理',
    tagline: '加工',
    desc: 'Ctrl K 一次搜遍全库；条目投票筛选，越用越合口味；工具箱收纳常用小工具。',
    video: '/demo/demo-process.webm',
    to: '/process',
    action: '去工具箱',
  },
  {
    key: 'output',
    name: '输出',
    tagline: '成稿',
    desc: '周报月报一键汇成，导出 HTML / PPT / 朗读音频；一堆材料直出可编辑的 .pptx。',
    video: '/demo/demo-output.webm',
    to: '/output/report',
    action: '去报告',
  },
  {
    key: 'loop',
    name: '回路',
    tagline: '复盘',
    desc: '3 分钟快答复盘，行动项自动进待办；勾选完成即闭环，产出变成下一轮输入。',
    video: '/demo/demo-loop.webm',
    to: '/review/new',
    action: '新建复盘',
  },
]

export interface Shortcut {
  keys: string
  desc: string
}

export const SHORTCUTS: Shortcut[] = [
  { keys: 'N', desc: '速记浮层' },
  { keys: 'Ctrl K 或 /', desc: '命令面板' },
  { keys: '?', desc: '帮助页' },
  { keys: '← →', desc: '复盘向导切步' },
  { keys: 'Esc', desc: '关闭浮层与面板' },
]

export interface GlossaryEntry {
  term: string
  def: string
}

export const GLOSSARY: GlossaryEntry[] = [
  { term: '闭环', def: '输入 → 处理 → 输出 → 回路：复盘产出的行动项、洞察和修正目标，都会变成下一轮的输入。把复盘当成一年一次的总结，就失去了它的作用。' },
  { term: 'SSOT', def: '每类数据只有一个拥有者模块，其他模块只持 ID 引用——双记账是个人管理系统失败的头号原因。行动项的 SSOT 是任务库。' },
  { term: 'BYOK', def: '自带 AI Key。凭据只存 localStorage、永不进备份；AI 失败自动改用内置规则——拔掉 AI 产品完整可用。' },
  { term: '机会/威胁标记', def: '信息条目可以标记为机会、威胁或趋势。标记后进入复盘 SWOT 的候选列表，做复盘时直接选用，不用重新翻找。' },
  { term: '每日精选上限', def: '信息日报每天最多 10 条。数量是产品设计，不是用户设置；没有未读数和红点提醒，看完就处理或归档。' },
  { term: 'TTL', def: '原始抓取与已筛除条目 14 天后物理清理；有标注（投票/批注/永久保留）的条目豁免，随全量备份。' },
  { term: '健康列', def: '信源抓取失败计数：连败 3 次自动停用并告警——死源静默污染数据是最常见死法。' },
  { term: '投票（多推 / 没想好 / 少推）', def: '条目卡右侧表达你的判断：多推（希望多看到这类）/没想好（暂不表态）/少推（少来这类）。点一下立即保存，再点当前档取消。你的投票自动决定两件事——信源分级怎么调、AI 兴趣词表怎么归纳。' },
  { term: '信源分级', def: '信源的 T1/T1.5/T2 分级决定它抓来的内容有多容易进日报。分级由你的投票自动调整：近 60 天里「多推」占比 ≥60% 升 T1、≥30% 升 T1.5、其余降 T2；投票不足 8 条的源不动。信源管理页的「多推率」列是调整依据。' },
  { term: '三问分诊', def: '待办分类不问"重不重要"，问"不做的代价"：今天不做就过期 → 一类；卡住别人等我的 → 二类；都不是 → 三类。手动调整后以手动为准。' },
  { term: '外部数据块', def: '周报的数据源：从别的系统带来的结构化片段（业务指标、系统周数据）。行内"键: 值"渲染为指标行，自动并入报告与 PPT——从周报导出页维护。' },
  { term: '桌面版与网页版', def: '同一套应用，能力有差：桌面版自带本地 AI 网关（Key 写应用数据目录）、自动备份写磁盘、工具轮盘全局呼出（Ctrl+Alt+Q）、一键部署云端；网页版可选浏览器直连或本地网关、数据备份到下载文件夹、装成浏览器应用（PWA）。两边数据各自独立，换设备用 设置 → 数据 的导出导入搬家。' },
  { term: '本地网关', def: '应用自带的小服务（127.0.0.1:8788）：AI 调用和信源抓取都经它转发——你的 Key 只写在本机文件里，浏览器接触不到；桌面版随应用自动运行，网页版随开发/生产服务启动。' },
]

export interface DataPoint {
  title: string
  desc: string
}

export const DATA_POINTS: DataPoint[] = [
  { title: '数据都在本机', desc: '全部数据存于本机 IndexedDB（pwork-workbench 库），无账号无服务器。换机迁移用 设置 → 数据 → 全量导出/导入。' },
  { title: '备份先行', desc: '任何删除、迁移、清理之前先全量导出——设置页一键完成。月度备份提醒建议保持开启。' },
  { title: '删除皆可恢复', desc: '所有删除都是软删除：速记进回收站可恢复；条目删除后保留 14 天。物理清理只发生在「过 TTL 且无标注」或「用户删除满 14 天」的数据上。' },
  { title: 'AI 外发是明示的', desc: '不开 BYOK 一切留在本机；开启后仅条目标题摘要等发往你配置的服务商（设置页有明示清单），失败自动改用内置规则。' },
]

export interface FaqEntry {
  q: string
  a: string
  link?: { label: string; to: string }
}

export const FAQ: FaqEntry[] = [
  {
    q: '抓取全部失败？',
    a: '抓取优先走应用自带的本地网关直连源站（桌面版/随服务启动的浏览器版自动可用），失败再降级转接。仍失败的看信源表「健康」列的错误信息，连败 3 次会自动停用；单个源失败多为该源自身失效（换地址或等它恢复）。',
    link: { label: '去信源管理', to: '/input/sources' },
  },
  {
    q: '怎么做信源包分享给别人？',
    a: '把你配好的信源整理进信源页（按领域挑「推荐信源目录」里的、或手动添加），点「导出 JSON」得到 pwork-sources.json，把文件发给对方；对方在自己的信源页点「导入 JSON」选这个文件即可，重复的地址自动跳过，不会重复导入。适合给不同领域的用户各做一套精选包。',
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
    a: '三个办法，按方便程度选：① 在周报导出页进「外部数据」直接粘贴；② 导入 CSV/JSON 文件（首行表头自动转成"键: 值"）；③ 有程序的话向 Worker 的 /api/ingest 推送（见 worker/README）。数据块保存后，报告和 PPT 自动多出"外部数据"章节。',
    link: { label: '去外部数据（周报数据源）', to: '/input/blocks' },
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
    who: '想用复盘 AI 教练、AI 写大纲、调研联网搜索的人。不配 AI，评分走本地规则、导出走内置模板，所有功能照常。',
    steps: [
      '桌面版：在 C:\\Users\\你的用户名\\AppData\\Roaming\\com.pwork.workbench\\ 新建文本文件 gateway.env，写入一行 PWORK_LLM_API_KEY=你的Key，重启应用（Key 从大模型服务商官网获取，如 DeepSeek / 智谱开放平台）。',
      '联网搜索（调研页「联网调研」用）默认跟随 LLM 上游、复用同一把 Key，不用额外配置；DeepSeek 搜索约 ¥0.005/次（仅成功非空结果计费）。',
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
      '双击 PWORK 目录下 worker 文件夹里的「部署向导」，按提示走完（一次性，约 10 分钟；需要 Cloudflare 免费账号）。',
      '部署完到 设置 → 云端同步：模式选「D1 直连」，把账户 ID、数据库 ID、API Token 填进去点「测试连接」——每一步的说明都写在那张卡里，照着做即可。',
      '「端点」和「D1 直连」是同一个东西的两条通道：端点走 workers.dev 域名（部分网络打不开），D1 直连走 Cloudflare 官方接口（更稳，推荐）。',
    ],
    link: { label: '去云端同步', to: '/settings?tab=cloud' },
  },
  {
    title: '转接服务（可选：无网关环境的兜底）',
    who: '抓取优先走应用自带的本地网关（自动可用）。只有在既没有网关、直连又失败的环境里才轮到公共转接服务——它偶尔慢或超时。多数人不用管。',
    steps: [
      '如果你自建了转接服务：设置 → 采集偏好 → 转接服务，填入你的地址。',
      '留空 = 用默认公共服务。改完下一次抓取生效。',
    ],
    link: { label: '去采集偏好', to: '/settings' },
  },
  {
    title: 'Obsidian 联动（可选：只在用 Obsidian 记笔记时有用）',
    who: '用 Obsidian 的人。不用 Obsidian 可以完全忽略——PWORK 自己就是完整的存储，这里只是把成稿顺手送进你的笔记库。',
    steps: [
      '信息日报：日报页右上「导出 Obsidian 日报」，得到一个 md 文件（带日期命名和元数据），拖进 vault 的「信息日报」文件夹即可。',
      '周报/月报：报告页底部「写入 Obsidian」，会通过 Obsidian 协议直接新建笔记（需要这台电脑装了 Obsidian；想进指定库就在旁边填 vault 名）。',
      '方向是单向的：PWORK → Obsidian。条目的投票和批注仍以 PWORK 为准。',
    ],
    link: { label: '去信息日报试试', to: '/input/digest' },
  },
]
