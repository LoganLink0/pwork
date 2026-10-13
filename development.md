# development.md · 开发方式、命令与回归清单

> 环境坑全集见 [开发复盘.md](./开发复盘.md) 第三节（Windows 重灾区）；本文档只放日常要用的。

## 环境要求

Node ≥ 20（实测 24）· Rust 工具链 + VS2022（仅桌面版构建需要）· 现代浏览器。无后端依赖；云端同步功能另需 Cloudflare 免费账号（可选）。

## 日常命令（都在 app/ 目录）

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器（端口 **5273**，专属端口勿改——启动器/书签依赖） |
| `npm test` / `npx vitest run` | 全量测试（基线 **340** 全绿；压测单文件排除：`--exclude '**/perf.bench.test.ts'`） |
| `npx tsc -b` | 类型检查（0 错；vitest 不查类型，提交前必跑——两次教训） |
| `npm run lint` | oxlint（基线 **27 警告 0 错**，勿新增；2026-10-12 核对，旧记 26 为过时数） |
| `npm run gateway` | 开发版 AI 网关（127.0.0.1:8788；Key 读 app/.env.local，复制 tools/.env.example） |
| `npm run build` | 生产构建（tsc -b + vite build + PWA 预缓存 → dist/） |
| `npm run serve` | 零依赖静态服务 dist/（默认 5273，`--port N` 换） |
| `npx tauri build` | 桌面安装包（→ src-tauri/target/release/bundle/nsis/，约 210MiB——内嵌 WebView2 离线安装器，首次构建联网下载约 200MB 后有缓存；package.json 无 tauri 脚本，npm run tauri 会报 Missing script） |
| `npm run audit:classes` | className 定义完整性检查（TSX 类名在 CSS 零定义即红，复盘 1.14） |

worker/ 目录：`npx vitest run`（19 绿）· 部署与 D1 配置见 worker/README.md。

## 回归清单（每次收尾必过，按序）

1. `npx vitest run` → 340 全绿
2. `npx tsc -b` → 0 错
3. `npm run lint` → 27/0（基线不变）
4. 涉及桌面版：`npx tauri build` 成功 + 冒烟（启动 app.exe 看窗口标题 + `curl 127.0.0.1:8788/health` + taskkill 干净退出）
5. 涉及抓取链：真实抓一轮看横幅（耗时/源成败/无卡死）
6. 涉及 worker：worker 测试 19 绿
7. 提交纪律：一个 commit 一件事；`git add -A` 前先 `git status` 过目（防误装残留/无关文件混入，复盘 3.17）

## 开发约定

- 改完必须 **curl 验证 served 内容**（Vite watcher 竞态是本项目最高频坑：现象"改了不生效"，解法 curl→touch→按端口重启；复盘 3.1）。
- 新逻辑进 `engine/`（纯函数、依赖注入 now、可单测），再接 store/UI；测试先行抓过竞态与时区两类真 bug。
- 时间纪律：本地日期一律 `localDateOf/todayLocal`，禁裸 `toISOString().slice(0,10)`；注入参数体内禁读系统时钟（复盘 2.7）。
- 错误纪律：`void asyncFn()` 前想"它拒绝了谁知道"（全局网+错误日志）；静默 catch 要写明为什么静默。
- UI 改动对照 [DESIGN.md](./DESIGN.md) 与应用内 /design 页；新功能做入口审查（三步内可达）。
- 源文件一律用编辑工具写（Mimosa 钩子拦 Bash 写源码）；弹窗输入禁用 prompt（复盘 3.12）。

## 端口占用速查

5273 本项目 dev/serve · 8788 AI 网关 · 5177/5180/5274/5275 是用户其他项目（Corealize/MIND/RESUME），**杀进程前必查身份**（复盘 3.2/3.3）。孤儿进程：`netstat -ano | grep :端口` → 确认身份 → `taskkill //F //PID`。

## 浏览器自动化注意（IAB）

evaluate 跑在隔离世界（派发事件到不了页面监听器，验证全局处理用单测或真实交互，复盘 2.8）；fill 不触发 React onChange 时用真实键入；locator.click 卡可操作性时用 `locator.evaluate(el => el.click())` 兜底。
