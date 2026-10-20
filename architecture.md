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
`runFetchAll`（store）→ `runCollect`（engine/collect：并发≤5 编排）→ 每源 `fetchFeed`（engine/rss 三级通路：直连 → rsshub 换镜像 → 转接服务，逐源 10s 超时，读体单独防护）→ `prefilter`（屏蔽词/标题过短砍量）→ `fingerprintOf` 去重 → `scoreByRules`（四维：信源分级/新鲜度/兴趣词/实用词；权重固定默认——2026-10-20 起零参数，存量配置忽略，≤30 字理由）→ 入库 stage 流转（raw→scored→kept/discarded）→ `digestFor` 当日 Top N 分发。每源失败原因进 health；整轮失败进 FetchProgress.error + 错误日志（按钮永不卡死）。

**采集调参闭环**（回路，2026-10-20 重设计；按控制论的信号流描述——迭代任何一节前先定位自己在环上的位置）：

```text
信源抓取 ──→ 前馈预筛（屏蔽词/标题过短：评分前砍掉已知扰动）
        ──→ 分层筛选（worker 两段 AI：便宜模型预筛→强模型评分；AI 失败回落规则＝安全旁路）
        ──→ 本地合并 + 同日排名分层（前 2 必看 / 3–8 可看 / 其余可略）
        ──→ 信息日报（你阅读的地方）
        ──→ 你的投票（多推/没想好/少推 ＝ 观测器回传的误差信号）
        ──→ 控制器：①信源分级自动升降（多推率 ≥60%→T1 / ≥30%→T1.5，≥8 票才动）
                    ②AI 兴趣词表归纳（≥20 票启动，每 +15 票自动重跑；被低估样本重点补课）
        └──→ 回到「分层筛选」的输入——下一轮更贴近你的标准

稳定性边界（防极限环）：投票可取消；429 仅自动重试 1 次；信源连败 3 次停用；AI 失败回落规则、不无限重试。
系统辨识（误差统计→前馈修正）：日报页对齐行（多推条目当时的分层分布）＋ 条目库筛除原因聚合（哪类原因/哪个屏蔽词/哪个源）。
```

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
- engine 评分链朴素（规则近似，可解释优先）——复杂度让位于投票驱动的自动调参（用户侧零参数）。
- worker 与本地"天"的口径不同（云端 UTC / 本地本地日），文档化设计非疏漏（复盘 1.6）。
