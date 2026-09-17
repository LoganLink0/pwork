# make-launcher · Windows 双击启动器打包工具包

> 给任何"本地 dev 服务 + 浏览器"形态的项目生成一个双击即用的 `xxx-Launcher.exe`：
> 按需自动安装依赖 → 按端口幂等拉起各服务 → 自动打开页面 → 服务在打包器退出后存活。
> 已在 RESUME（简历辅导，vite + Fastify sidecar 双进程）真机验证。

## 用法（三步）

1. 在项目里写一份 `launcher.json`（参照 `launcher.json.example`）：项目路径、名字、打开地址、每个服务（端口 + 启动命令 + 健康检查路径）
2. 运行：
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File make-launcher.ps1 -ConfigPath launcher.json
   ```
3. 得到 `<name>-Launcher.exe`（在项目根目录）——发给谁都能双击；也可随项目目录一起走

## 它生成了什么

| 文件 | 作用 |
|---|---|
| `<name>-Launcher.exe` | IExpress 自解压启动器：展开 launch.cmd 并执行 |
| `tools/launch.cmd` | 入口：探测项目目录（四级回退）→ **经 explorer 转发**调 start-servers.cmd → 轮询主端口 → 打开浏览器 |
| `tools/start-servers.cmd` | 真正拉服务：**逐端口幂等**（端口空闲才启动），子命令输出落 `launcher-<名>.log` |

## 五个坑（每个都真实踩过，别绕开）

1. **IExpress exe 启动的子进程会随打包器退出被 Job 对象连带杀掉**——所以 launch.cmd 绝不直接 start 服务进程，必须经 `explorer` 转发（explorer 在 Job 外，它的子进程不受连带）。症状：服务起来一两分钟后莫名全死
2. **Git Bash 调 iexpress 会把 `/N /Q /M` 开关当路径转换**，iExpress 收不到 SED 参数就弹交互向导卡死。用 PowerShell 调（本工具就是这么做的），或 Git Bash 里加 `MSYS_NO_PATHCONV=1`
3. **批处理必须 CRLF 行尾**——LF 会导致标签跳转与变量解析错乱（症状：`'xxx' 不是内部或外部命令`，xxx 是某行被拦腰截断的词）。生成器已统一 CRLF；手改后注意编辑器别改回 LF
4. **launcher.sed 的 [Strings] 段必须显式定义 `AdminQuietInstCmd=` 和 `UserQuietInstCmd=`**（空值也算定义）——缺了会弹向导对话框
5. **端口是外部合同**：入口页探测、浏览器 IndexedDB 数据都绑在端口上——生成后不要改，改了等于换了一个应用

## 项目迁移时

复制整个项目目录（**排除 `node_modules/`**）→ 新目录 `npm install` → 双击 exe。
launch.cmd 的项目目录探测有四级回退（脚本父目录 → 脚本目录 → 当前工作目录 → 手写回退路径）；双击 exe 时当前目录就是 exe 所在目录，通常天然命中。若放在别处运行找不到项目，改 launch.cmd 顶部那行回退路径即可。

## 设计要点（改代码前读）

- **按端口幂等**：launch.cmd 和 start-servers.cmd 各自都会先 `netstat` 探测端口，空闲才启动——重复双击、部分服务已手动启动，都不冲突
- **日志落盘**：每个服务子命令 `>> launcher-<名>.log 2>&1`，失败可排查（旧日志被运行中进程握住时截断会失败，属正常，用追加语义不受影响）
- **主服务 = services 第一项**：等待轮询和浏览器打开都用它的端口；其余服务启动后做健康检查，不通也不阻塞（页面能开，API 可能晚几秒）
- **手写回退路径**：项目固定在一台机器的固定位置时填上，双击最稳
