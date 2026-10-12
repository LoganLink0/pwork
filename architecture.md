# architecture.md · 架构与数据流

> 深层决策记录见 [01-总体架构与决策.md](./01-总体架构与决策.md)（六条 ADR）；数据铁律见 [02-数据治理规范.md](./02-数据治理规范.md)。本文档讲现状的结构与流动。

## 分层

```
app/src/
  pages/          路由页面（壳 + 各模块页；按路由懒加载）
  components/     共享组件（shell/ 壳件、collect/ 采集件、process/ 工具件）
  store/          zustand 状态库（notes/collect/tasks/goals/blocks/profiles/ui）
  engine/         纯逻辑层（零 React 依赖，全部可单测）
  db/             Dexie 数据层（schema v12 + 各实体 repo + backup + cloudSync）
  content/        内容与默认值（导航/帮助/采集配置/占位）
  modules/review/ 回路模块（自 FUPAN 迁入，样式作用域化 .review-root）
src-tauri/        桌面壳（Rust：窗口 + 内嵌网关 gateway.rs + fs 备份通道）
worker/           Cloudflare Worker（云端定时抓取 → D1，独立测试基线 19）
```

依赖方向单向：pages → components/store → engine → db。engine 层禁 import React；新逻辑先进 engine（可测）再接 UI。

## 核心数据流

**采集流水线**（输入模块的心脏）：
`runFetchAll`（store）→ `runCollect`（engine/collect：并发≤5 编排）→ 每源 `fetchFeed`（engine/rss 三级通路：直连 → rsshub 换镜像 → 转接服务，逐源 10s 超时，读体单独防护）→ `prefilter`（屏蔽词/标题过短砍量）→ `fingerprintOf` 去重 → `scoreByRules`（四维：信源权重×可调权重归一化，≤30 字理由）→ 入库 stage 流转（raw→scored→kept/discarded）→ `digestFor` 当日 Top N 分发。每源失败原因进 health；整轮失败进 FetchProgress.error + 错误日志（按钮永不卡死）。

**星级调参闭环**（回路）：
ItemCard 打星（annotation.stars，5 星再点归零）→ `starStats`（4–5 星条目的兴趣词/信源/主题域聚合）→ `starAdvice`（可解释建议）→ 设置页一键采纳改 `config.weights` → 下次 `scoreByRules` 生效。

**AI 通路**（L2 明示）：
前端 → 本地网关 127.0.0.1:8788（桌面版=Rust 内嵌随应用启停；开发=tools/gateway.mjs，端口被占内嵌版让位）→ 上游 LLM API。Key 双路径加载（%APPDATA%/gateway.env 生产、app/.env.local 开发）。网关记账 JSONL（2MB 滚动）→ /usage 汇总。三层降级：LLM 失败→规则引擎；网关不可达→错误明示；不配 Key→全功能可用。

**备份流**：
`buildBackupBundle`（12 张表统一包裹 v2，含 collectConfig）→ 桌面版写 AppData/backups/（tauri fs，失败回落浏览器下载）/ 浏览器版下载文件夹 → `importBundle`（按 id+updatedAt 新者为准合并，兼容 FUPAN v1）。roundtrip 测试固化"丢库→全恢复"。

**云端同步**（可选，worker/）：
Cloudflare cron 定时抓源 → D1 累积 → 本地 `syncFromCloud` 拉取合并（D1 直连模式走 api.cloudflare.com 规避 workers.dev 数据面阻断；端点模式走 workers.dev）。

**错误流**（全应用）：
index.html 内联钩子（应用加载前单槽记录）→ `installErrorCapture` 接管 window error/unhandledrejection + 引导期记录静默搬运 → `recordError`（errorLog 表，上限 300 条最旧先删）→ ErrorBar 即时弹条 / ErrorBoundary 渲染崩溃页 / 设置页日志卡查看导出。

## 数据库（Dexie/IndexedDB `pwork-workbench`，schema v12）

notes / sources / items / reviews / actions / insights / tasks / goals / snapshots / blocks / profiles / caseFiles / aiCache / errorLog。约束：字段只增不删、读取侧防御缺字段（铁律 2）；实体必备 id/createdAt/updatedAt/schemaVersion（铁律 1）；日志/缓存类属 Raw 暂存层（上限清理，不进备份）。

## 桌面壳（src-tauri）

tauri.conf.json：frontendDist=../dist（vite build 产物），窗口 1360×900 最小 1024×680，NSIS 中文安装器。Rust 侧三件：单实例锁（重复启动聚焦主窗）、内嵌网关（gateway.rs，约 300 行，行为与 Node 版对齐）、fs 权限收窄至 AppData 读写（capabilities/default.json）。更新器签名密钥已备（app/.tauri/，不入库），插件待托管源再接。

## 已知架构边界

- 多标签页同库并发：Dexie last-write-wins，未做跨页协调（单用户低险，backlog）。
- engine 评分链朴素（规则近似，可解释优先）——复杂度让位于用户可调参。
- worker 与本地"天"的口径不同（云端 UTC / 本地本地日），文档化设计非疏漏（复盘 1.6）。
