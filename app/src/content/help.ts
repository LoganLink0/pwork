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
    video: 'demo/demo-input.webm',
    to: '/input/notes',
    action: '去速记',
  },
  {
    key: 'process',
    name: '处理',
    tagline: '加工',
    desc: 'Ctrl K 一次搜遍全库；条目投票筛选，越用越合口味；工具箱收纳常用小工具。',
    video: 'demo/demo-process.webm',
    to: '/process',
    action: '去工具箱',
  },
  {
    key: 'output',
    name: '输出',
    tagline: '成稿',
    desc: '周报月报一键汇成，导出 HTML / PPT / 朗读音频；一堆材料直出可编辑的 .pptx。',
    video: 'demo/demo-output.webm',
    to: '/output/report',
    action: '去报告',
  },
  {
    key: 'loop',
    name: '回路',
    tagline: '复盘',
    desc: '3 分钟快答复盘，行动项自动进待办；勾选完成即闭环，产出变成下一轮输入。',
    video: 'demo/demo-loop.webm',
    to: '/review/new',
    action: '新建复盘',
  },
]

export interface Shortcut {
  keys: string
  desc: string
  /** 可自定义键位的动作名：渲染侧用键位配置的当前值替换 keys（0.4-3 键位中心） */
  bind?: 'quickNote' | 'palette' | 'help' | 'settings' | 'wheel' | 'clipboard'
}

export const SHORTCUTS: Shortcut[] = [
  { keys: 'N', desc: '速记浮层', bind: 'quickNote' },
  { keys: 'Ctrl K 或 /', desc: '命令面板（Ctrl+K 可在设置里改，/ 永远可用）', bind: 'palette' },
  { keys: '?', desc: '帮助页', bind: 'help' },
  { keys: '← →', desc: '复盘向导切步' },
  { keys: 'Esc', desc: '关闭浮层与面板' },
  { keys: 'Ctrl+Alt+Q', desc: '工具轮盘（桌面版全局呼出，可在 设置 → 键位设置 改）', bind: 'wheel' },
  { keys: 'Ctrl+Alt+V', desc: '剪贴板速记（桌面版全局：任何应用里复制后一键存为速记，可在 设置 → 键位设置 改）', bind: 'clipboard' },
]

export interface GlossaryEntry {
  term: string
  def: string
  /** 所属分类：按四模块 + 数据 + AI + 通用（帮助页分组渲染，命令面板索引用） */
  group: '输入' | '处理' | '输出' | '回路' | '数据' | 'AI' | '通用'
}

export const GLOSSARY: GlossaryEntry[] = [
  { term: '闭环', group: '通用', def: '复盘产出的行动项会回到待办，洞察会回到下一轮复盘，形成循环。' },
  { term: '桌面版与网页版', group: '通用', def: '同一套应用：桌面版自带 AI 网关、自动备份写磁盘、工具轮盘全局呼出；网页版数据在浏览器里。两边数据独立，换设备用导出导入搬家。' },
  { term: '本地网关', group: '通用', def: '应用自带的小服务，AI 调用和信源抓取都经它转发，Key 只写在本机文件里。' },
  { term: '自带 Key', group: 'AI', def: '用自己的大模型服务商 Key。Key 只存本机，AI 失败自动改用内置规则。' },
  { term: '机会/威胁标记', group: '输入', def: '条目标记为机会、威胁或趋势后，进入复盘 SWOT 候选列表。' },
  { term: '每日精选上限', group: '输入', def: '信息日报每天最多 10 条，固定值不可调。' },
  { term: '健康列', group: '输入', def: '信源抓取失败计数，连败 3 次自动停用。' },
  { term: '投票（多推 / 没想好 / 少推）', group: '输入', def: '表达你想多看还是少看这类内容，投票自动调整信源分级和 AI 兴趣词表。' },
  { term: '信源分级', group: '输入', def: '信源按进日报的难易分 T1 / T1.5 / T2 三档，由你的投票自动升降。' },
  { term: '三问分诊', group: '处理', def: '待办按不做的后果分类：会过期的是一类，有人在等的是二类，其余是三类。' },
  { term: '外部数据块', group: '输出', def: '从别的系统带来的数据片段（如业务指标），自动并入周报和 PPT。' },
  { term: 'SSOT', group: '数据', def: '每类数据只有一个拥有者模块，其他模块只引用不复制。' },
  { term: 'TTL', group: '数据', def: '原始抓取与未保留的条目 14 天后自动清理；有标注的可保留。' },
]

export interface DataPoint {
  title: string
  desc: string
}

export const DATA_POINTS: DataPoint[] = [
  { title: '数据都在本机', desc: '桌面版：应用数据目录下的 pwork.db（SQLite 主库）+ attachments 附件文件夹；网页版：浏览器 IndexedDB。无账号无服务器，换机迁移用 设置 → 数据管理 → 全量导出/导入（附件随可读档案 zip 或直接拷文件夹）。' },
  { title: '备份先行', desc: '任何删除、迁移、清理之前先全量导出——设置页一键完成。月度备份提醒建议保持开启。' },
  { title: '删除皆可恢复', desc: '所有删除都是软删除：速记进回收站可恢复；条目删除后保留 14 天。物理清理只发生在「过 TTL 且无标注」或「用户删除满 14 天」的数据上。' },
  { title: 'AI 外发是明示的', desc: '不配 AI Key 一切留在本机；配置后仅条目标题摘要等发往你配置的服务商（设置页有明示清单），失败自动改用内置规则。' },
]

export interface FaqEntry {
  q: string
  a: string
  /** 所属分类：按四模块 + 数据与备份 + 界面通用（帮助页分组渲染，命令面板索引用） */
  group: '输入' | '处理' | '输出' | '回路' | '数据与备份' | '界面与通用'
  link?: { label: string; to: string }
}

export const FAQ: FaqEntry[] = [
  {
    q: '截图想存进速记？',
    group: '输入',
    a: '桌面版直接粘贴：按 N 唤起速记浮层（或打开任意速记的编辑器），Ctrl+V 把剪贴板里的图片存为这条速记的附件——正文照常写或只存图都可以。附件在阅读视图里以缩略图显示，列表带 📎 角标；一条最多 10 张、单张不超过 20MB。图片里的文字识别交给系统工具（如 PowerToys 的文字识别）。',
    link: { label: '去速记', to: '/input/notes' },
  },
  {
    q: '怎么把一条速记变成待办或复盘素材？',
    group: '输入',
    a: '打开这条速记，编辑器左下角有两个按钮：「转待办」以它为源创建一条待办（任务上会显示"来源:速记"，可点回这条速记）；「挂到复盘」选择场景后，这条速记会挂在向导顶部，归档后永久保留在复盘档案里。',
    link: { label: '去速记', to: '/input/notes' },
  },
  {
    q: '浏览器书签怎么搬进来？',
    group: '输入',
    a: '在 Chrome/Edge 的书签管理器（Firefox 在书签库）里「导出书签」得到 HTML 文件，然后到 设置 → 数据管理 → 「导入书签 / 稍后读」选中它。Raindrop / Pocket / Instapaper 导出的 HTML 也是同一格式。按网址去重、可重复导入，文件夹会转成标签，链接进条目库参与检索与投票。',
    link: { label: '去数据管理', to: '/settings' },
  },
  {
    q: '其他笔记应用（Obsidian / flomo / Notion / 印象笔记）的数据怎么搬？',
    group: '输入',
    a: '都在 设置 → 数据管理：① Obsidian / Logseq / 思源——选导出的文件夹（或任意 md 库）走「导入 Markdown 文件夹」，宽容导入为速记、按内容去重；② flomo——账号设置里导出 HTML，走「导入笔记应用数据」；③ Notion——导出 zip（Markdown & CSV）；④ Evernote / 印象笔记——导出 .enex。后三者也都进速记、按内容去重。语雀 / 有道云等导出受限的应用，先导出为 Markdown 再走①。',
    link: { label: '去数据管理', to: '/settings' },
  },
  {
    q: '抓来的文章想认真读、摘一段怎么办？',
    group: '输入',
    a: '条目卡和日报卡上有「阅读全文」：点开是应用内的阅读窗，正文已自动抓成纯文本（打开即抓，抓取中显示进度；登录墙等抓不到的会说明原因，可手动重试）。划选一段文字会浮出操作条——「摘录到速记」把选中内容连同出处与原文链接存成一条速记，并挂回这条条目；也可以直接复制。正文全文进检索：Ctrl K 搜正文字词也能命中。',
    link: { label: '去条目库', to: '/input/items' },
  },
  {
    q: '抓取全部失败？',
    group: '输入',
    a: '抓取优先走应用自带的本地网关直连源站（桌面版/随服务启动的浏览器版自动可用），失败再降级转接。仍失败的看信源表「健康」列的错误信息，连败 3 次会自动停用；单个源失败多为该源自身失效（换地址或等它恢复）。',
    link: { label: '去信源管理', to: '/input/sources' },
  },
  {
    q: '怎么做信源包分享给别人？',
    group: '输入',
    a: '把你配好的信源整理进信源页（按领域挑「推荐信源目录」里的、或手动添加），点「导出 JSON」得到 pwork-sources.json，把文件发给对方；对方在自己的信源页点「导入 JSON」选这个文件即可，重复的地址自动跳过，不会重复导入。适合给不同领域的用户各做一套精选包。',
    link: { label: '去信源管理', to: '/input/sources' },
  },
  {
    q: '怎么从一堆材料快速产出一份可编辑的 PPT？',
    group: '输出',
    a: '用 输出 → PPT 撰写：粘贴文字或上传 Word/PDF/Markdown 材料，AI 起草报告大纲（内部/外部措辞不同），你逐页审核修改后导出 .pptx——每一页都是原生文字框和表格，可直接编辑。没有 AI Key 也可以用内置模板手动填写。',
    link: { label: '去 PPT 撰写', to: '/output/write' },
  },
  {
    q: '外部系统的数据怎么进报告？',
    group: '输出',
    a: '三个办法，按方便程度选：① 在周报导出页进「外部数据」直接粘贴；② 导入 CSV/JSON 文件（首行表头自动转成"键: 值"）；③ 有程序的话向 Worker 的 /api/ingest 推送（见 worker/README）。数据块保存后，报告和 PPT 自动多出"外部数据"章节。',
    link: { label: '去外部数据（周报数据源）', to: '/input/blocks' },
  },
  {
    q: '旧版复盘工作台的数据怎么迁过来？',
    group: '回路',
    a: '在旧版导出 JSON（档案页 → 备份），然后在 设置 → 数据管理 → 导入。兼容 FUPAN v1 旧格式，按 id + updatedAt 合并、可重复导入不产生重复。',
    link: { label: '去导入', to: '/settings' },
  },
  {
    q: '我的数据存在哪、会丢吗？',
    group: '数据与备份',
    a: '存在浏览器本机 IndexedDB。注意：在浏览器里清除「站点数据」会连库一起删——重要节点先用设置页全量导出。程序自身的删除都是软删除，可恢复。',
    link: { label: '去备份', to: '/settings' },
  },
  {
    q: '界面字体太小 / 看久了累？',
    group: '界面与通用',
    a: '设置 → 显示设置：界面字号五档缩放（90%–150%）、阅读行宽三档（紧凑/标准/全宽）、界面字体三选（系统/衬线/等宽），改完立即生效并记住。全屏使用建议配「特大 125%」或「超大 150%」。',
    link: { label: '去显示设置', to: '/settings?tab=prefs' },
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
    who: '所有人都建议开启。数据只存在这台电脑上，自动备份是唯一的安全网：到期会自动存一份完整备份文件。',
    steps: [
      '设置 → 数据管理 → 自动备份，选「开」，周期建议「每周」。',
      '桌面版的备份文件存在应用数据文件夹的 backups 子文件夹里；浏览器版直接存到下载文件夹。',
      '想手动备份随时点同一页的「全量导出」。',
    ],
    link: { label: '去设置', to: '/settings' },
  },
  {
    title: 'AI 功能（可选：不配也完全能用）',
    who: '只有想用 AI 功能的人才需要配置（复盘 AI 教练、AI 写大纲、调研联网搜索）。不配置也能正常使用应用，这些功能会改用内置规则，只是没有 AI 加持。',
    steps: [
      '桌面版：在应用数据文件夹（C:\\Users\\你的用户名\\AppData\\Roaming\\com.pwork.workbench\\）里新建文本文件 gateway.env，写一行 PWORK_LLM_API_KEY=你的Key，重启应用。Key 在大模型服务商官网注册获取，比如 DeepSeek、智谱开放平台。',
      '联网搜索（调研页的「联网调研」用这个）默认和 AI 用同一把 Key，不用额外配置；用 DeepSeek 的联网搜索每次约五厘钱，只对搜索成功的结果收费。',
      '浏览器版：把应用目录里 tools/.env.example 复制成 .env.local，填同样的内容，然后运行 npm run gateway。',
      '设置 → AI 设置，选「本地网关」，点「测试网关」看到「在线，Key 已配置」就配好了。',
      'Key 只存在你自己电脑的这个文件里：不上传、不进备份、界面永不显示。',
    ],
    link: { label: '去 AI 设置', to: '/settings' },
  },
  {
    title: '云端同步（可选：想 24 小时自动抓信源的人才需要）',
    who: '大多数人不需要配置。不配置云端，应用就是纯本机工具，所有功能可用。配置后的作用只有一个：云端服务器按计划自动帮你抓信源，你打开应用时拉回来——适合不想手动点「立即抓取」的人。需要自己的 Cloudflare 账号（免费）。',
    steps: [
      '双击 PWORK 目录下 worker 文件夹里的「部署向导」，按提示走完（一次性，约 10 分钟；需要 Cloudflare 免费账号）。',
      '部署完到 设置 → 云端同步：模式选「D1 直连」，把账户 ID、数据库 ID、API Token 填进去点「测试连接」——每一步的说明都写在那张卡里，照着做即可。',
      '「端点」和「D1 直连」是同一个东西的两条通道：端点走 workers.dev 域名（部分网络打不开），D1 直连走 Cloudflare 官方接口（更稳，推荐）。',
    ],
    link: { label: '去云端同步', to: '/settings?tab=cloud' },
  },
  {
    title: '转接服务（可选：无网关环境的兜底）',
    who: '大多数人不用配置。抓取优先走应用自带的本地网关（自动可用）；只有在没有网关、直连又失败的环境里，才需要配置公共转接服务——它偶尔慢或超时。',
    steps: [
      '如果你自建了转接服务：设置 → 采集设置 → 转接服务，填入你的地址。',
      '留空 = 用默认公共服务。改完下一次抓取生效。',
    ],
    link: { label: '去采集设置', to: '/settings' },
  },
  {
    title: 'Obsidian 联动（可选：只在用 Obsidian 记笔记时有用）',
    who: '只有在用 Obsidian 记笔记时才需要看这一节。不用 Obsidian 就直接跳过，不影响任何功能——PWORK 自己就是完整的存储，这一节只是把写好的稿子送进你的笔记库。',
    steps: [
      '导出信息日报：在日报页右上角点「导出 Obsidian 日报」，得到一个 md 文件，把它拖进 Obsidian 库的文件夹里就能打开。',
      '写入周报和月报：在报告页底部点「写入 Obsidian」，会在 Obsidian 里直接新建一篇笔记（需要这台电脑装了 Obsidian；想指定写入哪个库，就在旁边填库名）。',
      '数据只从 PWORK 写入 Obsidian，不会反向同步；投票和批注仍然以 PWORK 里的为准。',
    ],
    link: { label: '去信息日报试试', to: '/input/digest' },
  },
  {
    title: '自己挑信源：五条判断原则',
    who: '推荐目录里没有你想订的内容、想自己找源的人。添加入口在信源页；如果只有站点主页地址，点表单里的「自动探测 feed」，应用会帮你找到订阅地址。',
    steps: [
      '首选官方和原作者：官方博客、作者本人署名的源，比转载站和聚合站可靠。判断方法：看域名是不是发布者自己的。',
      '稳定比名气重要：知名网站的订阅地址也会悄悄停更（每年都有几家停的），连败 3 次自动停用的机制会替你兜底，停了就换。',
      '先验证再订阅：一个地址值得订阅的前提是它真的能返回内容——应用抓得到、信源自检不报错，才算数。',
      '更新量大的源放观察档：日更几百条的大源（比如 arXiv 的单个分类）放 T2；T1 留给更新少但质量高的核心源。订阅后你的投票会自动调整分级。',
      '同一家站点的不同分类是不同的内容流（比如 GitHub Blog 和 GitHub Changelog），想订都可以订；同类题材的几家媒体挑一家就够。',
    ],
    link: { label: '去信源管理', to: '/input/sources' },
  },
]
