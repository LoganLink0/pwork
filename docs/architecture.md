# architecture.md · 架构与数据流

> 深层决策记录见 [01-总体架构与决策.md](./design/01-总体架构与决策.md)（六条 ADR）；数据铁律见 [02-数据治理规范.md](./design/02-数据治理规范.md)。本文档讲现状的结构与流动。

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

## 数据库（桌面版 SQLite `pwork.db` / 网页版 Dexie IndexedDB）

08 设计（主库文件化 S1–S3，2026-10-30）后的存储分层：业务代码经 `db/delegate.ts` 访问，实际后端可切换——桌面版默认 **SQLite**（`pwork.db` 落应用数据目录，Rust rusqlite 经命令层执行，事务跨命令共享连接），网页版维持 **Dexie/IndexedDB**（`pwork-workbench`，schema v13），测试跑内存后端。表清单两态一致（15 张：notes/sources/items/reviews/actions/insights/tasks/goals/snapshots/blocks/profiles/caseFiles/aiCache/errorLog/kv + meta）。约束不变：字段只增不删、读取侧防御缺字段（铁律 2）；实体必备 id/createdAt/updatedAt/schemaVersion（铁律 1）；日志/缓存类属 Raw 暂存层（上限清理，不进备份）。桌面版另有 `vault/` 只读镜像（每条数据一个 Markdown 文件，recordMarkdown 与可读档案同源，投影失败重试三次后暂停并静默入错误日志）与 `attachments/` 速记附件目录（R2 批，2026-11-04：图片字节落盘、数据库只带元数据；att_ 前缀白名单 + 20MB 上限 + 原子写，经 attachments.rs 三命令；字节不进备份包裹，可读档案导出时随 zip 带走）。

## 桌面壳（src-tauri）

tauri.conf.json：frontendDist=../dist（vite build 产物），窗口 1360×900 最小 1024×680，NSIS 中文安装器。**多窗口（2026-11-02 起）**：主窗（main）之外有 label=wheel 的轮盘独立窗（420×420 透明/无边框/置顶/不进任务栏，`focus:false + focusable:false` 不夺焦点，热键在鼠标光标位置弹出）——系统级动作（置顶/网址）就地执行，应用类动作经 `wheel_dispatch_action` 唤醒主窗发 `wheel-action` 事件（App 内 WheelActionSink 承接）；同进程场景 WebView2 渲染路径会绕过 NOACTIVATE 抢前台，show 后检测被抢即 `restore_foreground` 归还。capabilities 分文件：default.json（main 全量）与 wheel.json（仅 core 基础——窗内视图无数据读写路径，权限最小化）。Rust 侧：单实例锁（重复启动聚焦主窗）、内嵌网关（gateway.rs，行为与 Node 版对齐）、SQLite 主库命令层（db.rs：通用执行器/事务/迁移分批/VACUUM 快照；迁移关键命令带日志打点）、vault 镜像命令层（mirror.rs：目录白名单+文件名穿越防护+原子写入）、yt-dlp 适配器（ytdlp.rs：spawn 本机 yt-dlp 拉平台投稿清单，参数数组不经 shell、30 秒看门狗、内网地址守卫）、系统工具（system.rs：置顶切换/Shell 通知桥一键配置）、fs 权限收窄至 AppData 读写。更新器已接入（签名密钥在 app/.tauri/，不入库；发布流程见 development.md；mac workflow 对已发布 tag 重跑不覆盖 latest.json——Windows 条目由本地发版合入）。运行日志全构建落盘（LogDir，KeepAll 轮转；迁移命令带行数/耗时打点）。

## 已知架构边界

- 多标签页同库并发：Dexie last-write-wins，未做跨页协调（单用户低险，backlog）。
- engine 评分链朴素（规则近似，可解释优先）——复杂度让位于投票驱动的自动调参（用户侧零参数）。
- worker 与本地"天"的口径不同（云端 UTC / 本地本地日），文档化设计非疏漏（复盘 1.6）。
- 速记「彻底删除」只清本机的记录本体：跨设备删除传播已实现（安全审计 B5：墓碑三处登记 + 推送 + 云端清理）；遗留边界仅一条——云端 pwork_sync_records 的旧 payload 不随 purge 物理清理，新设备首次全量初始化会把已删速记以软删态拉回（不会复活为活跃，回收站可见可再删）。
- AI 全库问答第一段已交付（2026-10-29，e89d0ea：检索与问答上下文同升正文级，Ctrl K「问 AI」带来源作答）；真调用验收待有效 Key（本机 .env.local 已过期 401，用户动作项）；嵌入索引为第二段（条件触发，DeepSeek 无 embeddings 端点已核实）。

## 运行时依赖要点（前端）

生产依赖极少：React 19 / react-router / zustand / Dexie / docx / jszip / marked + dompurify（2026-10-24 引入，速记 Markdown 预览：marked 解析 → DOMPurify 消毒 → 注入）。界面图标为零依赖自绘 SVG（components/shell/icons.tsx），无图标库。
