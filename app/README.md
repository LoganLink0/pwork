# PWORK · 个人工作台（W1 壳+速记 / W2 采集 C1 / W3 回路迁入+任务库）

> 技术栈：React 19 + TypeScript + Vite 8 + Zustand + Dexie(IndexedDB) + vite-plugin-pwa；Vitest + RTL。
> 设计系统：v3「冷静的工作台」令牌（`src/styles/tokens.css`），组件样例页 `/design`。

## 启动

- **双击 `../PWORK-Launcher.exe`**（或 `../tools/launch.cmd`）：自动在专用端口 **5273** 起服务并打开浏览器（已在运行则直接开浏览器）
- 或 `npm run dev`（配置默认端口 5273；`npx vite --port 5175` 可临时换端口）
- 首次访问会自动进入 **/welcome 首访引导**（三步上手 / 一键导入信源 / 可选上云引导）；可从 帮助页 或 设置页 随时重进
- 重新打包启动器：`iexpress /N /Q ..\tools\launcher.sed`（Windows 自带，产物 `../PWORK-Launcher.exe`）

## 命令

```bash
npm install
npm run dev        # 开发（端口 5273）
npm test           # Vitest 全量（fake-indexeddb 测试库，与真实数据物理隔离）
npm run lint       # oxlint（含 react/rules-of-hooks）
npm run build      # tsc -b + vite build + PWA
```

## 目录

```
src/
├── styles/            # tokens(v3) / base / shell / collect —— 组件禁止自造数值
├── components/shell/  # 侧边栏、顶栏、底部导航、命令面板(Ctrl+K)、速记浮层、全局快捷键
├── components/collect/  # 条目卡（评分徽章/星级/详情标注/转待办）
├── pages/             # Home / Tasks / Notes(+编辑器) / Sources / Digest / Items / Settings / Placeholder / DesignSystem
├── db/                # schema(Dexie v3：notes/sources/items/reviews/actions/insights/tasks)
│                      #   repo(速记) / collect(采集) / tasksRepo(任务库+桥接) / backup(v2 导入导出)
├── store/             # Zustand：notes、collect、tasks、ui（面板/主题）
├── engine/            # datetime / appearance / fingerprint / rss / rules / collect(流水线)
├── content/           # nav / placeholder / collect(采集默认值)
├── types/             # Note / Source / Item / TaskItem / CollectConfig / ExportBundle
└── modules/review/    # 回路模块（W3 自 FUPAN 迁入，行为零改动）
    ├── pages/         # Dashboard/NewReview/Wizard/MeetingRoom/ArchiveDetail/Library/StatsView/Help → /review/*
    ├── components/    # wizard/meeting/cld/tools/scenario/doublecheck/shortcuts/coach/ui
    ├── db/            # schema.ts 为 shim（→ 根 schema）；repo.ts 复盘/行动/洞察 CRUD
    ├── store/         # draft（向导草稿，归档时桥接任务库）
    └── styles/        # review.css（ui.css 作用域化到 .review-root）
```

## W3 桥接速记

- 复盘归档 → 行动项自动落任务库（`origin={kind:'review', refId:actionId}`，ActionItem 回写 `taskId`）
- 任务勾选闭环 → 反向同步 ActionItem 状态（任务库是 SSOT；FUPAN 闭环率口径不变）
- 速记浮层"转待办"（origin=note）、条目卡"转行动卡"（origin=item）同池管理
- 备份包裹 v2：notes/sources/items/collectConfig/reviews/actions/insights/tasks；导入兼容 FUPAN v1 旧导出（按 id+updatedAt LWW）

## 信息采集 C1 使用

1. 信源管理（`/input/sources`）添加源：**原生 RSS 优先**（如 `https://sspai.com/feed`）。实测（2026-08-31，本机网络）：rsshub.app 公共实例不可达、多数原生源无 CORS 头——浏览器内抓取由 **rss2json 转接完成**（服务端抓取 + 开放 CORS，自动兜底）；`tools/示例信源.json` 是 5 个已验证可用的源，可直接导入。
2. 信息日报页（`/input/digest`）点 **⟳ 立即抓取**（C1 手动触发，无定时）；每日 10 条硬顶（只读）。失败源计入 health（连败 3 次自动停用）。
3. 条目可标 **星级（反馈回流）/ 批注 / 永久保留 / O/T / 转行动卡**；已筛除层 14 天 TTL 后物理清理（有标注豁免）。
4. 设置 → 采集偏好：兴趣域/屏蔽词驱动规则评分（四维：源权重 .30 / 新颖 .25 / 相关 .25 / 工具 .20，均附 ≤30 字理由）。

## 纪律（动工前重读）

- 数据治理七条铁律见 [../02-数据治理规范.md](../02-数据治理规范.md)；踩坑实录见 `FUPAN/开发复盘.md`（Hooks 先于早退 / 函数式更新 / ID 引用不用下标 / 本地日期比较一律用 localDateOf/todayLocal（禁裸 toISOString 与 iso.slice(0,10)——午夜后错位一天的隐性 bug） / 测试库隔离 / **Windows 下改完必须 curl 验证 served 内容**）。
- 跨模块只 ID 引用；导出统一 `{ version, exportedAt, entities }`（v2 全量）；条目 raw/discarded 层不进备份（04 §3.4）。
- 新组件先入 `/design` 样例页再上页面；回路模块改动保持行为零漂移（迁移单测是回归网）。
