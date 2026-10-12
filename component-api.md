# component-api.md · 组件与模块接口

> 内部契约面：共享 UI 组件的用法约定 + engine 纯函数与数据层 API 签名。改动这些签名=跨文件影响，先 grep 消费方。

## 共享 UI 组件（app/src/components/）

### 壳件 components/shell/

| 组件 | 接口要点 |
|---|---|
| `Sidebar` / `Topbar` / `BottomNav` | 消费 content/nav.ts 的 MODULE_NAV；导航项挂 `mark-*` 类注入模块色 |
| `CommandPalette` | Ctrl+K 或 `/` 唤起；有查询词时 Enter 落在首个匹配（快速动作与页面同样参与过滤，复盘 1.2） |
| `QuickNote` | `useUi().openQuick()` 打开；浮层内 Esc 存草稿（localStorage DRAFT_KEY） |
| `ErrorBoundary` / `ErrorBar` | 渲染崩溃兜底 + 即时错误条；错误入口统一走 `recordError`，勿直接操作 useErrorBar |

### 采集件 components/collect/ItemCard.tsx

props：`item` + 回调 `onStars/onNotes/onKeep/onCycleOt/onDelete/onConvert`。星级点击语义：0→…→5→**0**（点满清零，aria-label 随状态变化，集成测试覆盖全循环）。

### 通用样式组件（class 约定，非 React 组件）

表单卡 `set-card>h2+.desc+.set-body`、行 `set-row`、输入 `.input`、分段 `.radio`、徽章 `.chip/.mini-btn/.text-btn`、横幅 `.run-banner(.warn)`、统计条 `.stat-bar/.stat-fill`、日志列表 `.errlog-item`。定义都在 shell.css/collect.css；新类名先跑 `npm run audit:classes`。

## engine 纯函数（全部零 React；测试同名文件）

### 抓取与评分

- `fetchFeed(url, timeoutMs=10_000, relayBase='')` → `ParseResult{ok,items,error}`：三级通路（直连→rsshub 镜像→转接）；**resp.text() 单独超时防护**，返回错误永不抛异常。
- `prefilter({title,summary,config})` → `{pass,reason?}`；`scoreByRules({source,title,summary,domainCountToday,config})` → `{score,reason≤30字,tags}`（权重取 `config.weights` 并归一化）。
- `normalizeWeights(w?)` → 总和为 1；`DEFAULT_WEIGHTS` = 30/25/25/20。
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
- 前端环境探测：`engine/platform.ts` 的 `isDesktopApp()`（`__TAURI_INTERNALS__` 标记）。
