# 参与贡献

PWORK 是本地优先的个人工作台（MIT 开源）。欢迎三类贡献：推荐信源、缺陷报告、代码。

## 推荐信源（最欢迎，改数据不改代码）

信源目录在 [app/src/content/source-catalog.json](app/src/content/source-catalog.json)，提交 PR 前请确认：

1. **原生 RSS/Atom 地址**（浏览器打开能看到 XML，不是网页地址）。
2. **自己实测可达**：`curl -I 地址` 返回 200（或浏览器打开无报错）。
3. 每个字段：`name`（显示名）、`url`（feed 地址）、`tier`（1 核心源=各领域默认预选 / 1.5 优质源 / 2 观察源）。
4. 目录按领域分组；如果是新领域，同时在 `DOMAINS`（[collect.ts](app/src/content/collect.ts)）补一行中文标签。

合并后：CI 每周一自动逐源验证活性，失效源会开 issue 提醒处理。改目录数据的 PR 也会自动跑一轮验证（结果在 Checks 的 summary 里，仅供人工参考，不会硬卡）。

## 报告缺陷

用 issue 模板（bug 报告 / 信源失效两类）。报 bug 请带：操作系统、浏览器或安装包版本（设置 → 关于）、复现步骤、错误日志（设置 → 错误日志 → 导出，已自动带版本与环境信息）。

## 提交代码

1. Fork 后从 master 拉分支；一个 PR 聚焦一件事。
2. 提交前过回归清单（[docs/development.md](docs/development.md)）：`cd app && npx vitest run` 全绿、`npx tsc -b` 零错误、`npm run lint` 不新增警告。
3. 界面文字用平实中文，判断标准是没读过任何文档的人能看懂。
4. 新页面在 [registry.tsx](app/src/registry.tsx) 登记一次，路由/导航/面包屑/命令面板自动获得。
5. 一切写入仓库的内容不得含个人信息（IP、绝对路径、账号名）。

## 环境要求

Node 22+、Rust（桌面壳开发才需要）。开发启动见 [docs/development.md](docs/development.md)。
