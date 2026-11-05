# 参与贡献

PWORK 是本地优先的个人工作台（MIT 开源）。欢迎三类贡献：推荐信源、缺陷报告、代码。提问、想法与使用交流在 [Discussions](https://github.com/LoganLink0/pwork/discussions)（问答 / 想法 / 展示三个分类）。

## 推荐信源（最欢迎，改数据不改代码）

信源目录在 [app/src/content/source-catalog.json](app/src/content/source-catalog.json)，提交 PR 前请确认：

1. **原生 RSS/Atom 地址**（浏览器打开能看到 XML，不是网页地址）。
2. **自己实测可达**：`curl -I 地址` 返回 200（或浏览器打开无报错）。
3. 每个字段：`name`（显示名）、`url`（feed 地址）、`tier`（1 核心源=各领域默认预选 / 1.5 优质源 / 2 观察源）。
4. 目录按领域分组；如果是新领域，同时在 `DOMAINS`（[collect.ts](app/src/content/collect.ts)）补一行中文标签。

合并后：CI 每周一自动逐源验证活性，失效源会开 issue 提醒处理。改目录数据的 PR 也会自动跑一轮验证（结果在 Checks 的 summary 里，仅供人工参考，不会硬卡）。

合并后：CI 每周一自动逐源验证活性，失效源会开 issue 提醒处理。改目录数据的 PR 也会自动跑一轮验证（结果在 Checks 的 summary 里，仅供人工参考，不会硬卡）。

## 复盘模板与场景包（同样改数据不改代码）

复盘模板、场景引导语、情绪词库、知识胶囊卡片都在数据文件里，PR 改数据即可：

- 复盘模板：[app/src/modules/review/content/review-templates.json](app/src/modules/review/content/review-templates.json)（name/tagline/type 等，type 现有 personal 与 team 两类）
- 场景包与决策偏差检查单：[app/src/modules/review/content/scenario-packs-data.json](app/src/modules/review/content/scenario-packs-data.json)
- 情绪词库：[app/src/modules/review/content/emotion-lexicon-data.json](app/src/modules/review/content/emotion-lexicon-data.json)
- 知识胶囊卡片：[app/src/modules/review/content/knowledge-cards-data.json](app/src/modules/review/content/knowledge-cards-data.json)

改数据后跑 `cd app && npx vitest run src/modules/review` 验证内容质量锁（词数/引用完整性等）仍绿即可。文案风格参考 PRD 3.1：一句可背诵的定义 + 生活类比，不夸赞不煽情。

## 报告缺陷

用 issue 模板（bug 报告 / 信源失效两类）。报 bug 请带：操作系统、浏览器或安装包版本（设置 → 关于）、复现步骤、错误日志（设置 → 错误日志 → 导出，已自动带版本与环境信息）。

## 提交代码

1. Fork 后从 master 拉分支；一个 PR 聚焦一件事。
2. 提交前过回归清单（[docs/development.md](docs/development.md)）：`cd app && npx vitest run` 全绿、`npx tsc -b` 零错误、`npm run lint` 不新增警告。
3. 界面文字用平实中文，判断标准是没读过任何文档的人能看懂。
4. 新页面在 [registry.tsx](app/src/registry.tsx) 登记一次，路由/导航/面包屑/命令面板自动获得。
5. 一切写入仓库的内容不得含个人信息（IP、绝对路径、账号名）。

第一次贡献：推荐信源（上一节，改数据不改代码）是最小的一个 PR；改代码可以从打了 good first issue 标签的 issue 挑起——列表里没有合适的，就到 Discussions 提想法，我们先把它变成 issue。

## 环境要求

Node 22+、Rust（桌面壳开发才需要）。开发启动见 [docs/development.md](docs/development.md)。
