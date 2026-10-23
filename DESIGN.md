# DESIGN.md · 视觉规则（「冷静的工作台」设计系统 v3）

> 唯一事实来源是 `app/src/styles/tokens.css`（令牌）——本文档是人读版；应用内实时样例在 `/design` 页。
> 纪律出处：01 文档设计系统节 + 开发复盘 7.1/7.2（两次用户指正沉淀）。

## 总原则

1. **冷静的工作台**：暖中性灰 + 唯一琥珀强调色。工具不该比内容更吵。
2. **色必载义**：颜色只用于承载信息（分类/来源/状态/期限四个维度），不作装饰。判断标准：去掉这个颜色，信息是否丢失。
3. **说人话**：界面文字平实描述事实与做法，禁自造词、比喻、编号黑话（工程文档除外）。
4. **单字族**：全局一套无衬线字族（系统栈：-apple-system → PingFang SC → MiSans → HarmonyOS Sans SC → Microsoft YaHei → Noto Sans SC → Segoe UI），层级只靠字号/字重/留白。

## 色彩令牌（tokens.css 同源）

| 类别 | 令牌 | 亮色 | 用途 |
|---|---|---|---|
| 背景 | `--bg` / `--surface` / `--surface-2` | #f5f4f1 / #ffffff / #faf9f7 | 页面 / 卡片 / 凹陷区 |
| 边线 | `--line` / `--line-strong` | #e6e4df / #cfcac1 | 分隔 / 控件描边 |
| 文字 | `--ink` / `--ink-soft` / `--ink-faint` | #211e1a / #66625a / #736e66 | 正文 / 次要 / 弱化（三级对比必须分明；弱化档也要过 AA 4.5:1，勿再调浅） |
| 强调 | `--accent` / `--accent-deep` / `--accent-text` | #e8833a / #b0500f / #a34e12 | 唯一强调色：CTA/选中/链接；deep 用于按钮底，text 用于文字 |
| 类别 | `--cat-good/need/insight/action` | 绿/赭/蓝/红系 | **只作 3px 边线与 12px 标签**，禁止大面积填充 |
| 模块标记 | `--m-input/process/output/review` | 蓝/绿/赭/琥珀 | 复用类别色取值，用途仅三种：侧边栏选中 3px 左线 / 模块卡标签 / 面包屑点 |
| 语义 | `--danger` / `--ok` | #b8443a / #2f7d52 | 错误 / 成功 |

暗色主题（`prefers-color-scheme` 或 `data-theme` 覆盖）：同套令牌换值（bg #161310 起），**明度区间要拉开**——卡面与背景分离度、文字三级对比是暗色验收线（曾塌过一轮，复盘 7.2）。

## 字号阶梯（8 级，组件禁止自造数值）

`--fs-xs 12`（标签/说明）→ `sm 13`（次要）→ `md 16`（正文）→ `lg 18`（卡片标题）→ `xl 20`（区块 h2）→ `h1 28`（页面标题）→ `hero 32`（首页标语）→ `num 24`（统计数字，恒配 `tnum` 等宽数字）。

## 间距·圆角·阴影

- 间距 8px 基：`--sp-1..7` = 4/8/12/16/24/32/48。页面留白节奏统一 `sp-5` 起。
- 圆角：`--r-sm 8`（输入/按钮）→ `md 12`（浮层/内嵌件：toast、quick-add）→ `lg 16`（卡片容器：set-card、mcard、tile、digest-item、task-card、src-table、note-list、editor）；胶囊用 99px。卡片层不许用 12。
- 阴影单体系：`--shadow-1`（静置）→ `--shadow-2`（悬停抬升）→ `--shadow-pop`（弹层）。禁止彩色阴影。

## 图标（单色线性，唯一来源 icons.tsx）

- 界面图标一律用 `app/src/components/shell/icons.tsx` 的 `Icon` 组件（24×24、描边 2、`currentColor`，几何取自 Feather 公开图形）。常规尺寸：导航 18 / 卡头 20 / 行内 14 / 空态 32。
- 彩色 emoji 不进界面——Windows/macOS 各画各的且带彩色，与单色体系冲突（2026-10-23 全站清除）。
- 按钮文字不带装饰符号，直接说事；进行中状态用「……中」表达。
- 需要语义色的图标由使用处包 span 着色：停=cat-action、继续/达成=cat-good、开始=accent-text、增强回路=cat-good、恶性=cat-action。
- 保留的单色字符：✓ ✗ ★ ✦ ✕ ＋ → ↗（线性字形且承载语义）。导出文档（md/PPT/HTML）内的 emoji 属文档内容，不受本节限制。

## 动效（只动 transform/opacity）

- 令牌：`--dur-1 120ms`（按压/着色）→ `--dur-2 200ms`（抬升/展开）→ `--dur-3 320ms`（路由入场/弹层）；统一缓动 `--ease` cubic-bezier(.22,.61,.36,1)。
- 既有模式：路由切换内容上浮淡入（page-in）、弹层 pop-in、按钮按压 scale(.98)、卡片悬停 translateY(-1~-2px)+shadow、瓦片箭头 hover 位移 2px。
- `prefers-reduced-motion` 全局总闸（base.css）；reduced 用户零动效。
- 错误条入场 bar-in + 呼吸点；历史错误静默（不弹条）。

## 布局

`--content-w 1200px` 内容列 / `--sidebar-w 240px`（≤1279px 收 200px）/ `--topbar-h 56px`；≤768px 侧栏消失、底部导航接管（60px + 安全区）。横滑容器右缘 28px 渐隐提示可滚动。

## 组件级约定（新页面对照清单）

- 表单卡：`set-card > h2 + .desc + .set-body`，行 `set-row`（label 130px 定宽）。
- 输入焦点：描边变 accent + 3px 15% 外发光（box-shadow，非 outline 改形）。
- 状态徽章/边线遵循模块标记三用途；空态卡用 quiet（虚线+降底+无阴影），让有数据的卡主导第一眼。
- 错误呈现三层：ErrorBar（即时红条）/ ErrorBoundary 崩溃页（不白屏）/ 设置页日志卡——色都用 `--danger`。
- 每个新页面上线前对照本文件 + `/design` 样例页核一遍（复盘 7.2 预防条）。
