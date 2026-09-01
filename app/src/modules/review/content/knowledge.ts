/**
 * 知识胶囊卡片库（PRD 第 2 章 → 6.4 组件）。
 * 文风规范（PRD 3.1）：一句可背诵的加粗定义 + 一个生活类比 + 课程出处。
 * 每张卡控制在 60–120 字，出现在"被需要的那一刻"。
 */

export interface KnowledgeCard {
  id: string
  title: string
  /** 一句话加粗定义 */
  definition: string
  /** 生活类比 */
  analogy: string
  /** 课程出处（Reference 讲次） */
  source: string
}

export const KNOWLEDGE: Record<string, KnowledgeCard> = {
  hindsight: {
    id: 'hindsight',
    title: '后见之明偏差',
    definition: '知道结果之后，大脑会悄悄把"当初"改写成"我早就知道"。',
    analogy:
      '它像给一段雾里摸索的决策修了一条笔直的高速公路。所以先锁目标、再看结果，把路重新挖开，回到还看不清方向的路口。',
    source: 'PRD 2.1 · 事实比较',
  },
  'memory-reconstruction': {
    id: 'memory-reconstruction',
    title: '记忆重构',
    definition: '记忆不是录像带，而是剪辑师——每回忆一次，它就重新剪一版。',
    analogy:
      '所以复盘的第一步不是回忆，而是把目标和数据摆上桌面，让事实替记忆说话。有当时的记录，就引用原始记录。',
    source: 'PRD 2.1 · 结果录入',
  },
  'self-serving': {
    id: 'self-serving',
    title: '自利性偏差',
    definition: '成功归功于自己，失败归罪于环境——大脑出厂自带的会计规则。',
    analogy:
      '甩锅的时候，名单里全是天气、运气和别人的名字；轮到功劳，名单突然变短。可控性标记就是给这份"账本"做的审计。',
    source: 'PRD 2.2 · 原因卡',
  },
  controllability: {
    id: 'controllability',
    title: '可控性三级',
    definition: '每条原因先标记：● 可控 / ◐ 半可控 / ○ 不可控，再决定往哪发力。',
    analogy:
      '待提升的事优先看可控和半可控（那是改进的重点）；做得好的事优先看半可控和不可控（那才是能复制的外因）。',
    source: '课程 07 讲 · 分析原因',
  },
  rationalization: {
    id: 'rationalization',
    title: '合理化（借口）',
    definition: '为失败编一个听上去合理的解释，是心理防御机制，不是分析。',
    analogy:
      '"价格太高所以不好卖"是每个行业最容易找到的答案——它可能是答案，也可能只是个借口。往下再挖一层。',
    source: '课程 15 讲 · 借口识别',
  },
  'black-swan': {
    id: 'black-swan',
    title: '归纳的局限',
    definition: '即使见过 100 万只白天鹅，也保证不了下一只还是白天鹅——归纳只得出"可能"。',
    analogy:
      '所以从多次经验里总结出的结论，先标"待验证"。复盘的"总结"很容易，"验证过的认知"才值钱。',
    source: '课程 09 讲 · 演绎与归纳',
  },
  'double-loop': {
    id: 'double-loop',
    title: '双环学习',
    definition: '单环学习改做法，双环学习连"目标/想法"本身一起检视。',
    analogy:
      '走错路时，单环是换双鞋走快一点，双环是打开地图看方向。认知环节那一问——"当初的目标本身对吗？"——就是升级开关。',
    source: 'PRD 2.4 · 认知环节',
  },
  'implementation-intentions': {
    id: 'implementation-intentions',
    title: '执行意图',
    definition: '"如果出现 X，我就做 Y"格式的计划，执行率远高于抽象决心。',
    analogy:
      '没有"如果……就……"的行动计划，像没有闹钟的起床计划，全靠意志力硬扛——而意志力是大脑里最贵的资源。',
    source: 'PRD 2.5 · 行动卡',
  },
  'loss-aversion': {
    id: 'loss-aversion',
    title: '损失厌恶',
    definition: '损失带来的痛苦约为等量收益快乐的两倍——所以人本能防御"承认失误"。',
    analogy:
      '这就是复盘容易开成辩护会的原因。把"待提升"当成投资组合里的调仓，而不是判决书，大脑就没那么想跑。',
    source: 'PRD 2.3 · 氛围',
  },
  'psychological-safety': {
    id: 'psychological-safety',
    title: '心理安全感',
    definition: '团队相信"在这里说真话不会被惩罚"时，学习行为才会发生。',
    analogy:
      '它不是你好我好大家好，而是说出真话的时候，不用先掂量子弹从哪个方向飞来。所以优秀的复盘，先破冰，再开麦。',
    source: 'PRD 2.3 · 会议氛围',
  },
  conformity: {
    id: 'conformity',
    title: '从众效应',
    definition: '只要有人先开口，群体的判断就会被悄悄拉向同一个方向。',
    analogy:
      '所以收集想法要先写后说：每人独立写完再亮牌，从众的引力就没处使劲了。',
    source: '课程 07 讲 · 书写式头脑风暴',
  },
  'retrieval-practice': {
    id: 'retrieval-practice',
    title: '提取练习',
    definition: '主动回忆比重读更能巩固记忆——回忆一次，胜过重读十次。',
    analogy:
      '复盘本身就是一次提取练习：合上笔记回想"上次我决定改什么"，比翻开它重读一遍有效得多。',
    source: 'PRD 2.4 · 复盘节奏',
  },
  'emotion-granularity': {
    id: 'emotion-granularity',
    title: '情绪粒度',
    definition: '能精确命名情绪的人（"委屈"而不是"难受"），情绪调节能力显著更强。',
    analogy:
      '"难受"是一团雾，"被否定后的委屈"是一张地图——地图才指得出下次怎么办。这是给情绪建档的意义。',
    source: 'PRD 2.3 · Barrett',
  },
  'habit-loop': {
    id: 'habit-loop',
    title: '习惯回路',
    definition: '习惯 = 提示 → 行为 → 奖赏。行为反复失败，先检查提示和环境，再谈意志力。',
    analogy:
      '想少刷手机，把手机放出卧室比"这次一定忍住"有效十倍——改造提示，比对抗提示容易。',
    source: 'PRD 2.5 · Duhigg/Clear',
  },
  'outcome-bias': {
    id: 'outcome-bias',
    title: '结果偏差',
    definition: '用结果好坏反推决策好坏，是一种系统性错觉——好决策也可能碰上坏结果。',
    analogy:
      '酒驾平安到家是坏决策的好结果；雨天慢行被追尾是好决策的坏结果。复盘决策时，只审过程，不审运气。',
    source: 'PRD 2.2 · 决策复盘',
  },
  mece: {
    id: 'mece',
    title: 'MECE 原则',
    definition: '相互独立，完全穷尽——分类不重复、不遗漏，尤其是遗漏会大幅削弱说服力。',
    analogy:
      '"成年女性"再分成学生/老师/职员/主妇，个体户女性就没地方放了。真百分之百穷尽很难，速度优先，重大遗漏不要有。',
    source: '课程 06 讲 · 金字塔原理',
  },
  swot: {
    id: 'swot',
    title: 'SWOT 分析',
    definition: '优势/劣势（向内）× 机会/威胁（向外），四格摆完再定策略。',
    analogy:
      '别把四格填成流水账——课程 14 讲的打法是找 SO 交集：用你的优势去够外面的机会，那是增长型战略的起点。',
    source: '课程 09/14 讲 · 工具箱',
  },
  cld: {
    id: 'cld',
    title: '因果循环图',
    definition:
      '用"节点 + 带极性的箭头"画出业务的因果结构——回路会告诉你增长从哪来、衰败从哪起。',
    analogy:
      '增强像踩油门，减弱像刹车，延迟像热水器——拧开后要等一会儿水才热。出自圣吉《第五项修炼》。',
    source: '课程 10 讲 · 洞察规律',
  },
  'insight-card': {
    id: 'insight-card',
    title: '洞察卡',
    definition: '一张写下来的认知更新——它回答"这次我学到了什么，下次该怎么看"。',
    analogy:
      '它不是感想，是假设：每张卡都带着"怎么验证"的约定，验证成立的会沉淀成你的决策直觉。全部洞察卡都住在"资产库"里。',
    source: 'CLAP · A 认知',
  },
  'action-card': {
    id: 'action-card',
    title: '行动卡',
    definition: '一张带执行意图的行动承诺——停止/继续/开始三选一，配上"如果 X，就 Y"的扳机。',
    analogy:
      '没有"如果…就…"的行动像没有闹钟的起床计划。行动卡 = 决心 + 扳机 + 期限，全部行动卡都会出现在仪表盘的待办里。',
    source: 'CLAP · P 规划',
  },
}
