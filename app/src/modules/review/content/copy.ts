/**
 * 全局微文案（PRD 3.4 规范）。
 * 铁律：界面不硬编码文案；教练式、不评判；先共情后方法；术语必配知识胶囊。
 */

export const APP_NAME = '复盘工作台'

export const NAV = {
  dashboard: '仪表盘',
  newReview: '新建复盘',
  wizard: '复盘',
  meeting: '会议室',
  stats: '分析',
  library: '资产库',
  settings: '设置',
  help: '帮助',
} as const

/* ------------------------------ 帮助页 ------------------------------ */

export const HELP = {
  kicker: '新手引导',
  title: '3 分钟，看懂一次复盘。',
  sub: '我们用一份完整的示例——小林的周复盘——带你把 CLAP 四步走一遍。看完之后，你可以一键把这份示例装进自己的工作台里改着玩。',
  tryTitle: '把这份示例装进你的工作台',
  tryHint:
    '点击下面的按钮，这份小林的复盘会以"进行中"的状态出现在你的向导里——每个字段都可以改，改完归档，它就是你的第一次复盘。',
  tryBtn: '加载示例复盘，亲自改一遍',
  loaded: '示例已加载！正在打开向导……',
  startBtn: '不用示例，从今天的一件小事开始',
  clpTitle: '复盘是什么：四步走',
  clpItems: [
    { key: 'C', name: '对比', desc: '把目标和结果摆上桌面。顺序不能反——先锁定目标，再看结果，否则大脑会悄悄改写"当初"。' },
    { key: 'L', name: '逻辑', desc: '追问原因，并给每条原因标记可控性：● 可控 / ◐ 半可控 / ○ 不可控。发力点只在可控的那部分。' },
    { key: 'A', name: '认知', desc: '产出一张「洞察卡」：写下这次学到了什么、下次怎么看。自己总结的叫经验，验证过的才叫认知。' },
    { key: 'P', name: '规划', desc: '产出「行动卡」：停止 / 继续 / 开始，每件事装上"如果 X，就 Y"的扳机——大脑更擅长执行带扳机的计划。' },
  ] as const,
  exampleTitle: '一个完整的例子：小林的周复盘',
  exampleSteps: [
    { name: '对比', kicker: '第 1 步', desc: '先写目标，再写结果，最后标注差异。' },
    { name: '逻辑', kicker: '第 2 步', desc: '对差距追问原因，标记可控性，再往深挖一层。' },
    { name: '认知', kicker: '第 3 步', desc: '把原因升华成一句"下次怎么做更好"。' },
    { name: '规划', kicker: '第 4 步', desc: '把认知变成带扳机的行动卡。' },
  ] as const,
  labels: {
    goal: '目标',
    result: '结果',
    cause: '原因',
    why: '往深挖',
    counter: '反例',
    insight: '认知更新',
    doubleLoop: '双环检视',
    action: '行动卡',
    confidence: '信心',
  },
  doubleLoopText: '当初的目标本身，对吗？——小林的答案：对，方向没问题（这就是双环学习：不只改做法，也检视目标本身）。',
  cldTitle: '进阶：用因果循环图看系统',
  cldDesc:
    '当原因之间互相关联时，把节点和箭头画出来，回路会自己浮现。下面是课程里的经典案例——Uber 的增长飞轮：更多的司机让覆盖更广、接客更快、价格更低，于是带来更多需求，又反过来需要更多司机。找到这种环，就找到了发力点。',
  cldTryHint: '在向导的"逻辑"步骤里就可以画一张你自己的。',
  dcTitle: '复盘之后：Double Check 与资产库',
  dcDesc:
    '归档前，用 Double Check 给复盘本身做次体检：氛围是在学习还是追责？行动卡都有扳机吗？归档后，认知更新会自动流进资产库，同一件事反复出现时，它会提醒你。',
  faqTitle: '三个常见问题',
  faq: [
    { q: '我的数据存在哪？', a: '只存在你这台设备的浏览器里（IndexedDB），不上传任何服务器。定期在"设置"里导出一份 JSON 备份即可。' },
    { q: '手机和电脑能同步吗？', a: '本地应用没有账号体系。用"设置 → 导出 JSON"在设备之间搬家，或在同一台设备上分别使用。' },
    { q: '复盘会开成追责会怎么办？', a: '让 Double Check 的氛围三问先上：指向事还是指向人？跟着数据还是跟着声量？会议室模式自带破冰和匿名收集。' },
  ] as const,
  ctaTitle: '现在，轮到你了。',
  ctaDesc: '从今天的一件小事开始——一次有质量的复盘，只需要 3 分钟。',
} as const

/** 首次使用 / 空状态 */
export const GREETING = {
  welcome:
    '你好，我是你的复盘引导师。在开始之前，先记住一句话：复盘不是把过去多想几遍，而是把过去想对一遍。',
  emptyReviews: '还没有复盘档案。第一份档案，可以从今天的一件小事开始。',
  emptyActions: '还没有行动项。复盘的最后一公里，是把结论变成"如果 X，就 Y"。',
  emptyInsights: '资产库还是空的。每次复盘沉淀下的认知更新，都会存进这里。',
} as const

/** CLAP 四步的步名与一句话目标（步进器文案） */
export const CLAP_STEPS = [
  { key: 'C', name: '对比', goal: '把目标和结果摆上桌面，让事实替记忆说话' },
  { key: 'L', name: '逻辑', goal: '追问原因，并问自己：这件事我能控制多少？' },
  { key: 'A', name: '认知', goal: '把原因升华为认知更新——单环改做法，双环改想法' },
  { key: 'P', name: '规划', goal: '把结论变成"如果 X，就 Y"的行动卡' },
] as const

/** 顺序强制引导（先目标后结果） */
export const ORDER_GUIDE =
  '先写目标，再写结果——顺序不能反。因为一旦先看到结果，大脑会悄悄替你改写"当初"的目标（这叫后见之明偏差）。'

/** 防偏差拦截 → 改写引导语（PRD 6.7 措辞改写表） */
export const REFRAME: Record<
  'blame' | 'self-blame' | 'empty-promise' | 'hindsight' | 'excuse',
  string
> = {
  blame:
    '我们把主角从"人"换回"事"：哪个环节的信息或流程，本可以不一样？',
  'self-blame':
    '反映真相（GROW 第二步）：具体是哪件事的结果不理想？把一次结果，和一个人的能力，分开来看。',
  'empty-promise': '把"下次注意"换成"如果 X，就 Y"——大脑更擅长执行带扳机的计划。',
  hindsight:
    '"当时要是……就好了"是把真实决策替换成从未存在的正确答案。回到那个路口：当时你手里有哪些信息？',
  excuse:
    '"价格太高""市场不好"是每个行业最容易找到的答案——它可能是答案，也可能只是个借口。往下再挖一层试试？',
}

/** 差异符号（课程 07、12 讲：↑ ↓ 0 + −） */
export const DELTA_LABEL = {
  up: { mark: '↑', name: '超出目标' },
  down: { mark: '↓', name: '低于目标' },
  zero: { mark: '0', name: '如期完成' },
  new: { mark: '+', name: '计划外新增' },
  gone: { mark: '−', name: '目标消失' },
} as const

/** 可控性三色（课程 07 讲实心/半实心/空心圆） */
export const CONTROL_LABEL = {
  full: { mark: '●', name: '可控' },
  half: { mark: '◐', name: '半可控' },
  none: { mark: '○', name: '不可控' },
} as const

/** 信心指数四档（课程 02 讲原文措辞） */
export const CONFIDENCE_LABEL = ['没信心', '不好说', '有信心', '非常有信心'] as const

/** 归档收尾（课程三段式：小结 + 思考题） */
export const ARCHIVE = {
  done: '档案已入库。3 条小结和 1 道思考题，在下面等你。',
  thinkingQuestion: '留一道思考题给你：你上一次复盘，是在陈述记忆，还是在核对事实？',
} as const

/** 会议模式（M3） */
export const MEETING = {
  icebreak: '先破冰，再开麦：请大家和身边的人握个手，说一句"很高兴与你一起共事和奋斗"。',
  principles: ['客观', '开放', '中立'],
  rolesTitle: '三角法角色分配（到人，不留白——一个人可以身兼数角）',
  roles: [
    { key: 'facilitator', name: '引导者', hint: '观察控场、激活思路，立场保持中立' },
    { key: 'host', name: '主持人', hint: '推进流程、把握主线，敢于提醒"我们现在主要讨论 XX"' },
    { key: 'discipline', name: '纪律官', hint: '提醒监督、维护秩序：发言超时、对人不对事，都归他管' },
    { key: 'recorder', name: '记录人', hint: '记录总结、及时同步——"会后各执一词"的解药' },
    { key: 'presenter', name: '陈述人', hint: '整理资料、陈述事实，通常是复盘的主要对象' },
    { key: 'questioner', name: '设问人', hint: '提出问题、协助深挖，一般是陈述人的上下游同事' },
  ] as const,
  checklistTitle: '资料准备清单（MECE：不重复、不遗漏）',
  checklist: ['日程说明', '会议守则', '目标与结果对照表', '会议记录模板', '决议结果模板'],
  rulesTitle: '会议守则',
  agendaTitle: '今日议程（五步法）',
  agenda: [
    { name: '破冰', minutes: 10, desc: '活跃氛围，创造平等开放的对话环境' },
    { name: '事实比较', minutes: 120, desc: '回顾目标，总结结果，GOOD/NEED 上墙' },
    { name: '分析原因', minutes: 60, desc: '可控性分析，找到发力点' },
    { name: '洞察规律', minutes: 60, desc: '追问最关键因素，更新认知' },
    { name: '制定计划', minutes: 60, desc: 'Stop / Continue / Start' },
  ] as const,
  icebreakDone: '我已完成破冰',
  collectTitle: '书写式头脑风暴：先写后亮',
  collectHint:
    '为什么先扣着？因为只要有人先开了口，从众的引力就会把想法悄悄拉向同一个方向。各自写完，一起亮牌。',
  sideGood: '做得好',
  sideNeed: '待提升',
  authorPlaceholder: '谁写的',
  cardPlaceholder: '这张便利贴写了什么？',
  collectBtn: '扣一张（先不亮）',
  revealBtn: '全部亮牌',
  facedown: '已扣下',
  wallTitle: '复盘墙',
  wallHint: '开放空间：把卡片拖到另一侧重新归类（触屏设备用"换边"按钮）',
  wallEmpty: '墙还是空的。回到上面的收集面板，先扣几张再亮牌。',
  moveSide: '换边',
  causeRule: (need: number, good: number) =>
    `汇总规则：待提升优先看"可控/半可控"（本墙 ${need} 条）——那是改进的重点；做得好优先看"半可控/不可控"（本墙 ${good} 条）——那是可复制的外因。`,
  voteHint: '同一侧超过 6 条时，先投票筛出最重要的，别让议程淹死在细节里。',
  insightHint:
    'GOOD 的关键因素多谈客观与外因（可复制），NEED 多谈主观与内因（可改进）。追问三连：影响这件事的因素共有多少？哪个最关键？为什么一定是它？',
  minutesLabel: '会议记录（归档四件套之一）',
  minutesPlaceholder: '记录人：把关键结论、分歧与决议记在这里。',
  archiveBtn: '归档这场复盘会',
  phases: ['会前', '破冰', '事实', '原因', '规律', '计划', '归档'],
  prepNext: '进入破冰',
  rolesMissing: '六个角色都要落到人——课程原话：到人，不留白。',
} as const

/* ------------------------------ M1 · 向导与档案 ------------------------------ */

export const MODE_LABEL = { full: '完整版', quick: '3分钟快答' } as const

export const SCENARIO_LABEL: Record<import('../types/models').ScenarioKey, string> = {
  daily: '日复盘',
  weekly: '周复盘',
  goal: '目标复盘',
  habit: '习惯复盘',
  emotion: '情绪复盘',
  decision: '决策复盘',
  aar: '事件复盘（AAR）',
  project: '项目/迭代回顾',
  strategy: '战略复盘',
  business: '业务复盘',
  org: '组织结构复盘',
  process: '流程复盘',
  talent: '人才复盘',
  budget: '预算复盘',
}

export const WIZARD = {
  prev: '上一步',
  next: '下一步',
  archive: '归档这份复盘',
  archiveHint: '复盘最后一定要落到一件明天就能做的事上——先添加一张行动卡，再归档。',
  quickTimeUp: '时间到也没关系——重要的不是速度，而是把四步走对。',
  modeHint: '完整版和 3 分钟快答版，思路完全一致，只是字段多少的区别。',
  // 各节标题（课程文风：一句话讲清这步干什么）
  sectionC: '对比：目标与结果',
  sectionL: '逻辑：为什么会这样',
  sectionA: '认知：我更新了什么',
  sectionP: '规划：下一步做什么',
  // 字段与占位
  goalPlaceholder: '当初的目标是什么？',
  resultPlaceholder: '实际发生了什么？',
  evidencePlaceholder: '佐证：当时的记录/数据/截图（可选）',
  causePlaceholder: '这条差距，最可能的原因是什么？',
  whyPlaceholder: '往深挖一层：为什么？',
  counterPlaceholder: '反例：有没有不符合这个解释的情况？（可选）',
  insightPlaceholder: '这次我更新了什么认知？',
  checkPlanPlaceholder: '打算怎么验证它？（可选）',
  doubleLoopPlaceholder: '如果想调整目标，调整成什么？为什么？',
  actionPlaceholder: '具体做哪件事？',
  ifThenPlaceholder: '如果 X，就 Y',
  ownerPlaceholder: '负责人',
  // 按钮与标签
  addGoal: '＋ 添加目标',
  addResult: '＋ 添加结果',
  addGap: '＋ 添加差异对比',
  addCause: '＋ 添加一条原因',
  whyMore: '再追问一层为什么',
  addInsight: '＋ 添加认知更新',
  addAction: '＋ 添加行动卡',
  remove: '移除',
  gapGood: '做得好',
  gapNeed: '待提升',
  goalLabel: '目标',
  resultLabel: '结果',
  counterLabel: '反例',
  doubleLoopQ: '当初的目标本身，对吗？',
  goalValidYes: '对，方向没问题',
  goalValidNo: '需要调整',
  kindInductive: '归纳（可能，待验证）',
  kindDeductive: '演绎（确定）',
  checkPlanLabel: '验证方式',
  ifThenLabel: '执行意图',
  ownerLabel: '负责人',
  dueLabel: '期限',
  needResultFirst: '先写目标，再写结果——把上面的目标补上，这里才会解锁。',
} as const

export const DETAIL = {
  export: '导出 Markdown',
  exported: '已导出——检查你的下载文件夹。',
  delete: '删除这份档案',
  confirmDelete: '确定删除这份复盘档案吗？此操作不可恢复。',
  deleted: '档案已删除。',
  back: '回到仪表盘',
  thinking: '思考题',
  inProgress: '未归档',
  archived: '已归档',
  resume: '继续',
  open: '打开',
  whereabouts: '行动卡的下落',
  actionStatus: { open: '待办中', done: '已完成', dropped: '已放弃' } as const,
  abandon: '放弃并删除',
  abandoned: '已放弃，没有留下草稿。',
} as const

/* ------------------------------ M2 · 资产与追踪 ------------------------------ */

export const DASHBOARD_STATS = {
  reviews: '复盘档案',
  insights: '洞察卡',
  closure: '行动闭环率',
  revisitDue: '待回访洞察',
  overdue: '已逾期',
  close: '完成',
  drop: '放弃',
  edit: '编辑',
  save: '保存',
  cancel: '取消',
  searchPlaceholder: '搜索复盘档案…',
  noMatch: '没有匹配的档案。',
  allClear: (rate: string) => `待办清零。行动闭环率 ${rate}。`,
} as const

export const LIBRARY = {
  searchPlaceholder: '搜索洞察卡…',
  patternWarn: (n: number, samples: string) =>
    `同一个模式，第 ${n} 次出现了：${samples}——类似的错误，这次真的要停下来了。`,
  dueAsk: '这条认知还成立吗？',
  stillValid: '成立',
  invalidated: '需要修正',
  revised: '已修正',
  edit: '编辑',
  del: '删除',
  confirmDel: '确定删除这张洞察卡吗？删除后不可恢复。',
  save: '保存',
  cancel: '取消',
  editHint: '编辑会重算主题指纹——模式警示会按新主题聚合。',
  viewReview: '查看档案',
  empty: GREETING.emptyInsights,
  timelineTitle: '档案时间线',
  patternTitle: '模式警示',
  poolTitle: '洞察卡池',
} as const

export const SETTINGS = {
  exportBtn: '导出全部数据（JSON）',
  exported: (file: string) => `已导出 ${file}。建议每月备份一次。`,
  importTitle: '导入备份',
  importMerge: '合并（保留现有，按 id 覆盖同条）',
  importOverwrite: '覆盖（清空后导入）',
  importBtn: '选择文件并导入',
  imported: (n: number) => `导入完成：${n} 份复盘档案。`,
  importError: '导入失败：文件不是有效的复盘工作台备份（JSON）。',
  dangerTitle: '危险区',
  dangerBtn: '清空全部数据',
  dangerConfirm: '确定清空全部复盘数据吗？此操作不可恢复，建议先导出备份。',
  cleared: '数据已清空。',
  reportTitle: '月度报告',
  reportHint: '把一个月的复盘、认知更新和行动闭环装进一页 HTML——复盘的"经营分析月报"，打印即可归档。',
  monthLabel: '选择月份',
  reportBtn: '生成 HTML 月报',
  reportDone: (file: string) => `已生成 ${file}。`,
  themeTitle: '外观',
  themeAuto: '跟随系统',
  themeLight: '浅色',
  themeDark: '深色',
  reminderTitle: '复盘节奏提醒',
  reminderHint: '打开应用时检查一次：逾期与今日到期的行动项、到期回访的洞察卡。数据只在本机判断。',
  reminderOn: '开启提醒',
  reminderOff: '关闭提醒',
  reminderGranted: '提醒已开启。到期时会用系统通知叫你。',
  reminderDenied: '浏览器拒绝了通知权限——可以在浏览器设置里重新允许。',
  reminderUnsupported: '当前环境不支持系统通知，提醒只在应用内展示。',
  reminderDisabled: '提醒已关闭。',
  reminderState: (on: boolean) => (on ? '当前状态：已开启' : '当前状态：已关闭'),
  coachTitle: 'AI 教练（可选）',
  coachHint:
    '规则引擎完全离线可用；接入你自己的大模型 API Key 后，AI 会替你生成深挖式追问、改写追责措辞。Key 只存在本机 localStorage，不会进入备份文件。',
  coachModeRule: '规则引擎（离线）',
  coachModeLlm: 'AI 模型（BYOK）',
  providerLabel: '服务商',
  baseURLLabel: '接口地址',
  modelLabel: '模型',
  apiKeyLabel: 'API Key',
  apiKeyPlaceholder: 'sk-…',
  testBtn: '测试连接',
  testOk: '连接成功，AI 教练已就绪。',
  testFail: (msg: string) => `连接失败：${msg}。检查 Key / 地址 / 网络；不影响离线使用。`,
  privacyNote: '启用后，差距与原因文本会发送到你配置的服务商。关闭即回到纯离线。',
  coachFail: (msg: string) => `连接失败：${msg}。检查 Key / 地址 / 网络；不影响离线使用。`,
} as const

/* ------------------------------ M5 · 因果循环图 ------------------------------ */

export const CLD = {
  title: '因果循环图（系统思考）',
  hint: '第一步：把业务的关键环节摆上来。第二步：连关系、选极性。回路会自己浮现——它是飞轮还是恶性循环，取决于方向。',
  nodePlaceholder: '业务的关键环节，如：更多司机',
  addNode: '＋ 添加节点',
  addEdge: '连线',
  edgeFrom: '起点',
  edgeTo: '终点',
  polarityLabel: '关系',
  polarity: { enhance: '增强（+）', inhibit: '减弱（−）', delay: '延迟（⏱）' } as const,
  rootBadge: '★ 根因',
  markRoot: '标记根因',
  unmarkRoot: '取消根因',
  rootHint: '入口少、出口多的，一般是"因"。参与回路的节点，被你标记为根因后——"没它不行"。',
  loopFound: (path: string) => `检测到一个回路：${path}。它是飞轮还是恶性循环？给它起个名字。`,
  loopNamePlaceholder: '给这个回路起名，如：增长飞轮',
  loopKindFlywheel: '飞轮（增强）',
  loopKindVicious: '恶性循环',
  saveLoop: '存为回路',
  ignore: '忽略',
  loopsTitle: '已识别的回路',
  loopLabel: (kind: 'reinforcing' | 'vicious') => (kind === 'reinforcing' ? '飞轮（增强）' : '恶性循环'),
  toInsight: '→ 生成洞察卡',
  toAction: '→ 生成行动卡',
  generated: '已生成——到认知 / 规划步骤即可看到。',
  duplicate: '这条洞察已经生成过了。',
  promote: '升级为图节点',
  promoted: '已加入因果循环图的节点列表。',
  empty: '还没有节点。先把业务的关键环节摆上来——就像 Uber 先写下"更多司机"。',
  nodeCount: (n: number) => `${n} 个节点`,
  templateTitle: '从模板开始（先僵化，后优化，再固化）',
  templateConfirm: '从模板开始会替换当前图中的全部节点和关系，继续吗？（已标记的根因也会被清空）',
  loadTemplate: (name: string) => `已载入模板「${name}」——把节点改成你自己的业务吧。`,
  relayout: '整理布局',
  dragHint: 'PC 端：按住节点拖拽，布置你自己的白板；"整理布局"可一键回到自动排列。',
  loopsManageTitle: '回路管理',
  loopNameLabel: '回路名称',
  toggleKind: '切换 飞轮 ↔ 恶性循环',
  compareLine: '同一个结构，方向相反，命运相反。把两条环放在一起看，你正在哪个环里、想去哪个环？',
  rootCauseSummary: (labels: string) => `根因（没它不行）：${labels}——它们就是下一步的发力点。`,
} as const


/* ------------------------------ M7 · 聚合分析 ------------------------------ */

export const STATS_VIEW = {
  kicker: '聚合分析',
  title: '数据会说实话。',
  sub: '所有统计都从你本地的复盘档案实时计算——没有上传，也没有估算。',
  trendTitle: '近 6 个月趋势',
  trendLegend: '达成方向 = ↑ 超出 / 0 如期 / + 新增；未达成 = ↓ 低于 / − 消失',
  scenarioTitle: '场景分布',
  patternTitle: '高频主题',
  patternHint: '同一主题反复出现会被置顶——它值得一次专门的复盘。',
  timelineTitle: '认知更新节奏',
  empty: '数据还不多。做完前 3 份复盘，这里会开始说话。',
  reportCta: '需要按月归档？去设置页生成 HTML 月报 →',
  reviewsUnit: '份复盘',
  insightsUnit: '条认知',
  times: '次',
} as const
