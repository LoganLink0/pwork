# development.md · 开发方式、命令与回归清单

> 环境坑全集见 [开发复盘.md](./开发复盘.md) 第三节（Windows 重灾区）；本文档只放日常要用的。

## 环境要求

Node ≥ 20（实测 24）· Rust 工具链 + VS2022（仅桌面版构建需要）· 现代浏览器。无后端依赖；云端同步功能另需 Cloudflare 免费账号（可选）。

## 日常命令（都在 app/ 目录）

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器（端口 **5273**，专属端口勿改——启动器/书签依赖） |
| `npm test` / `npx vitest run` | 全量测试（基线 **355** 全绿；压测单文件排除：`--exclude '**/perf.bench.test.ts'`） |
| `npx tsc -b` | 类型检查（0 错；vitest 不查类型，提交前必跑——两次教训） |
| `npm run lint` | oxlint（基线 **27 警告 0 错**，勿新增；2026-10-12 核对，旧记 26 为过时数） |
| `npm run gateway` | 开发版 AI 网关（127.0.0.1:8788；Key 读 app/.env.local，复制 tools/.env.example） |
| `npm run build` | 生产构建（tsc -b + vite build + PWA 预缓存 → dist/） |
| `npm run serve` | 零依赖静态服务 dist/（默认 5273，`--port N` 换） |
| `npx tauri build` | 桌面安装包（→ src-tauri/target/release/bundle/nsis/，默认联网版约 48MiB；package.json 无 tauri 脚本，npm run tauri 会报 Missing script） |
| `npm run audit:classes` | className 定义完整性检查（TSX 类名在 CSS 零定义即红，复盘 1.14） |

worker/ 目录：`npx vitest run`（19 绿）· 部署与 D1 配置见 worker/README.md。

## 回归清单（每次收尾必过，按序）

1. `npx vitest run` → 404 全绿
2. `npx tsc -b` → 0 错
3. `npm run lint` → 24/0（基线不变）
4. 涉及桌面版：`npx tauri build` 成功 + 冒烟（启动 app.exe 看窗口标题 + `curl 127.0.0.1:8788/health` + taskkill 干净退出）
5. 涉及抓取链：真实抓一轮看横幅（耗时/源成败/无卡死）
6. 涉及 worker：worker 测试 19 绿
7. 提交纪律：一个 commit 一件事；`git add -A` 前先 `git status` 过目（防误装残留/无关文件混入，复盘 3.17）；提交前个人信息 grep 自查（`192.168|E:\\|C:\\Users` 等模式——仓库已公开，AGENTS 纪律 7）

视觉类改动加两步（2026-10-23 起常用）：
- 浏览器计算样式采样断言（字号/圆角/对比度——探针见会话记录，h1=28/h2=18/引导句 13/tnum 12）
- 窄屏 390px 溢出扫描 + 新增 UI 元素的暗色主题过目

## 发布打包（桌面版）

1. 版本号四处同步：`app/package.json`、`app/src-tauri/tauri.conf.json`、`app/src-tauri/Cargo.toml` 的 `version`，加设置关于页文案（Settings.tsx 搜 `v0.`）；lock 文件用 `npm install --package-lock-only` 刷。
2. 打联网版（默认配置，产物约 48MiB）：`cd app && npx tauri build` → 拿走 `bundle/nsis/` 产物，改名加 `-online` 后缀。
3. 打离线版（约 254MiB）：把 `tauri.conf.json` 的 `webviewInstallMode.type` 临时改为 `offlineInstaller` 重打包，产物改名 `-offline`，配置改回 `embedBootstrapper` 再提交。
4. Release：`gh release create vX.Y.Z <online.exe> <offline.exe> --notes-file …`（notes 模板见 v0.1.8）。
5. 更新器（未启用）：签名密钥在 `app/.tauri/`（不入库，私钥丢失则永远无法推送更新）。启用：装 tauri-plugin-updater → conf 配 `plugins.updater.endpoints` 指向 GitHub Releases 的 latest.json → 构建带 `TAURI_SIGNING_PRIVATE_KEY`。当前无托管源故意不接。
6. 代码签名（未购买）：无证书时 Windows 提示"未知发布者"属预期；正式分发可购证书后配 `bundle.windows.certificateThumbprint`。

## 开发约定

- 改完必须 **curl 验证 served 内容**（Vite watcher 竞态是本项目最高频坑：现象"改了不生效"，解法 curl→touch→按端口重启；复盘 3.1）。
- 新逻辑进 `engine/`（纯函数、依赖注入 now、可单测），再接 store/UI；测试先行抓过竞态与时区两类真 bug。
- 时间纪律：本地日期一律 `localDateOf/todayLocal`，禁裸 `toISOString().slice(0,10)`；注入参数体内禁读系统时钟（复盘 2.7）。
- 错误纪律：`void asyncFn()` 前想"它拒绝了谁知道"（全局网+错误日志）；静默 catch 要写明为什么静默。
- UI 改动对照 [DESIGN.md](./DESIGN.md) 与应用内 /design 页；新功能做入口审查（三步内可达）。
- 界面图标一律走 `components/shell/icons.tsx` 的 `Icon`（单色线性 SVG，尺寸四档 18/20/14/32）；彩色 emoji 不进界面，按钮文字不带装饰符号（DESIGN.md 图标节）。速记 Markdown 渲染用 marked + DOMPurify（DOMPurify 消毒后再注入，勿绕过）。
- 可点元素：优先真 `button`；div/span 扮演必须带 `role` + `tabIndex` + 键盘事件，全局 `[role='button' 等]` 已给手型，悬停反馈按卡片 hover 体系补（复盘 3.28）。
- 源文件一律用编辑工具写（Mimosa 钩子拦 Bash 写源码）；弹窗输入禁用 prompt（复盘 3.12）。

## 端口占用速查

5273 本项目 dev/serve · 8788 AI 网关 · 5177/5180/5274/5275 是用户其他项目（Corealize/MIND/RESUME），**杀进程前必查身份**（复盘 3.2/3.3）。孤儿进程：`netstat -ano | grep :端口` → 确认身份 → `taskkill //F //PID`。

## 浏览器自动化注意（IAB）

evaluate 跑在隔离世界（派发事件到不了页面监听器，验证全局处理用单测或真实交互，复盘 2.8）；fill 不触发 React onChange 时用真实键入；locator.click 卡可操作性时用 `locator.evaluate(el => el.click())` 兜底。
