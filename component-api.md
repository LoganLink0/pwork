# component-api.md · 组件与模块接口

> 内部契约面：共享 UI 组件的用法约定 + engine 纯函数与数据层 API 签名。改动这些签名=跨文件影响，先 grep 消费方。

## 共享 UI 组件（app/src/components/）

### 壳件 components/shell/

| 组件 | 接口要点 |
|---|---|
| `Sidebar` / `Topbar` / `BottomNav` | 消费 content/nav.ts 的 MODULE_NAV；导航项挂 `mark-*` 类注入模块色；图标为 `Icon` 键名（icons.tsx） |
| `Icon`（icons.tsx） | 单色线性 SVG 库（24×24/描边 2/currentColor）；`name` 键 + 可选 `size`（默认 18；卡头 20/行内 14/空态 32）；界面禁彩色 emoji（DESIGN.md 图标节） |
| `SettingsNav` | 设置页/帮助页共用的左栏分类导航（桌面竖排、<768px 横滚带渐隐提示）；props：`tabs/active/onSelect/ariaLabel`，tab 的 icon 为 Icon 键名 |
| `CommandPalette` | Ctrl+K 或 `/` 唤起；纯本地检索（快速动作+页面+速记+全库，searchAll 同源）；有查询词时 Enter 落在首个匹配（AI 问答已暂停，TODO 记录重启前置） |
| `QuickNote` | `useUi().openQuick()` 打开；Esc 与点遮罩均存草稿（localStorage DRAFT_KEY）；Ctrl+Enter 保存；转待办回写 note.links.taskIds |
| `WheelMenu` | 桌面版专属（App 内 `isDesktopApp()` 条件挂载）：Rust 侧 Ctrl+Alt+Q 全局键 emit `wheel-toggle` → ui store `wheelOpen` 开关；环形格位读 `content/wheel.ts` 的 loadWheelSlots（localStorage `pwork-wheel-slots`，坏数据回默认，上限 8 格）；四类动作 route/quick/fetch/url；`WheelSettingsCard`（设置 tab=wheel）负责格位编辑 |
| `ErrorBoundary` / `ErrorBar` | 渲染崩溃兜底 + 即时错误条；错误入口统一走 `recordError`，勿直接操作 useErrorBar |

### 采集件 components/collect/

- `ItemCard`：props `item` + 回调 `onVote/onNotes/onKeep/onCycleOt/onDelete/onConvert` + 可选 `tier/showStage/converted`。投票三态（want/meh/no，点同值取消）；分层徽章（必看/可看/可略，按同日排名由 engine/itemTier 计算）；机会/威胁/趋势标记走 Icon 键（target/alert/trending）。
- `SourceCatalog`：props `onDone?(msg)`。分领域页签（role=tablist，页签带「已选/总数」计数）+ 勾选列表（260px 滚动）+ 「导入所选 N 个」；导入走 `importSources`（按地址去重，重复导入幂等）。数据源 `content/collect.ts` 的 `SOURCE_CATALOG`（10 领域，tier 1 默认预选）；首访引导第 2 步与信源页共用。

### 首访引导 pages/Welcome.tsx

全屏遮罩分步式（`welcome-veil`，四步 STEPS，进度点可直达）；`finish(to?)` 写 `pwork-welcomed` 标记并跳转——走完/跳过/卡内直达链接共用。第 1 步四模块能力卡渲染 `content/help.ts` 的 `MODULES`（输入/处理/输出/回路，各带 `app/public/demo/*.webm` 实拍演示视频，autoplay+loop+muted，与帮助页快速上手同数据）。

### 速记编辑器 pages/NoteEditor.tsx

编辑/预览双态（预览走 marked + DOMPurify 渲染 `.md-body`）；字数/行数常显（`note-stats`）；工具栏作用于真实选区；自动保存 600ms 防抖 + 卸载 flush；标题清空回退正文首行。

### 通用样式组件（class 约定，非 React 组件）

表单卡 `set-card>h2+.desc+.set-body`、行 `set-row`、输入 `.input`、分段 `.seg-item`（未选中 hover 描边着色）、徽章 `.chip/.mini-btn/.text-btn`、横幅 `.run-banner(.warn)`、统计条 `.stat-bar/.stat-fill`、日志列表 `.errlog-item`、速记时间线分组 `.note-day>.note-day-head`、Markdown 阅读态 `.md-body`、四模块演示视频卡 `.welcome-mods`(2×2)/`.quick-row`(行式)、信源目录 `.src-catalog` 系列。定义都在 shell.css/collect.css；新类名先跑 `npm run audit:classes`。

## engine 纯函数（全部零 React；测试同名文件）

### 抓取与评分

- `fetchFeed(url, timeoutMs=10_000, relayBase='')` → `ParseResult{ok,items,error}`：三级通路（直连→rsshub 镜像→转接）；**resp.text() 单独超时防护**，返回错误永不抛异常。
- `prefilter({title,summary,config})` → `{pass,reason?}`；`scoreByRules({source,title,summary,domainCountToday,config})` → `{score,reason≤30字,tags}`（四维权重为 rules.ts 内固定常量 30/25/25/20——2026-10-26 起 config.weights 字段已退役，旧数据携带即忽略）。
- `runCollect(sources, config)` → `RunSummary{results[], totalNew, totalDiscarded, digestIds, elapsedMs}`（并发≤5；编排层不再炸穿，见 store 层）。

### 错误系统

- `recordError({where,kind,message,stack?,detail?}, {silent?})`：入库（上限 300 滚动）+ 弹错误条（silent 只入库）。
- `track(promise, where)`：fire-and-forget 的统一出口。
- `installErrorCapture()`：main.tsx 渲染前调用一次（幂等）；`listErrors(limit)` / `clearErrors()` / `formatErrorLog(entries)`。

### 备份与统计

- `runAutoBackupIfDue({now?,build?,download?}?)` → `{downloaded,reason?,fileName?}`：到期自动导出（桌面写 AppData/backups，失败回落下载）。
- `starStats(items, interests, sources)` → `{rated,avgStars,high,interestHits,sources,domains}`；`starAdvice(stats, config)` → 建议[]（apply 补丁可选）。
- `searchAll(q)` → `SearchHit[]`（速记/任务/条目/洞察统一检索）。

## 数据层（app/src/db/）

- `db`：Dexie 实例 `pwork-workbench` schema **v12**（14 张表，清单见 architecture.md）。
- `backup.ts`：`importBundle(jsonText)` → `ImportResult{format,counts}`（id+updatedAt 新者为准；兼容 FUPAN v1）。
- `collect.ts`：`createSource/listAllSources/putItem/listRecentItems(days=30)/itemsPerSource7d/digestFor(date,topN)/updateAnnotation/softDeleteItem`。
- `repo.ts`：`newId(prefix)` / `createNote/saveNote` / `downloadFile(name,content,mime)`。
- `cloudSync.ts`：`syncFromCloud/pushSourcesToCloud/syncIngestBlocks/testConnection`（D1 直连优先）。
- 各实体 repo：tasksRepo / goalsRepo / blocksRepo / profilesRepo / caseFilesRepo（写库前后对账，铁律 1.18）。

## store 接口（zustand，App 挂载时统一 track 加载）

`useCollect`：`{sources,items,items7d,digest,digestDate,config,fetch:{running,summary,lastRunAt,error},loaded}` + `runFetchAll()`（失败自动复位并记录）等。其余 useNotes/useTasks/useGoals/useBlocks/useProfiles/useUi 同构。纪律：selector 内禁创建新引用（复盘 1.3）。

## 桌面壳 API（src-tauri）

- `gateway.rs`：`start(data_dir)` 随应用启动；端点 `/health`、`POST */chat/completions`、`/usage`；Key 加载顺序 AppData/gateway.env → .env.local → .env → 环境变量。
- `lib.rs`：tauri-plugin-global-shortcut 注册 Ctrl+Alt+Q（常量 WHEEL_KEY/WHEEL_LABEL，键位自定义随下版本快捷键体系）→ 还原窗口 + emit `wheel-toggle`。
- 前端环境探测：`engine/platform.ts` 的 `isDesktopApp()`（`__TAURI_INTERNALS__` 标记）。
