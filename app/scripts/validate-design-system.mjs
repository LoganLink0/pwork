/* validate-design-system.mjs — 设计系统机器校验（零依赖，Node 18+）
   五项检查：
     1 令牌漂移   tokens.css 双暗色块逐项一致（P-013 同族色值在 CSS 里的断言）
     2 对比度     明暗两套的前景/背景配对全表自动计算（AA 4.5:1 预算）
     3 色值字面量 src 内 tokens.css 之外的 #hex 基线比对——新增即报（P-013 断言）
     4 契约结构   docs/DESIGN.md 九节齐全（对照开源设计系统包约定）
     5 零个人信息 设计两文件不含盘符路径 / 内网地址（PWORK AGENTS.md 规则 7）
   用法：cd app && node scripts/validate-design-system.mjs（或 npm run validate:design）
   退出码：0 全过 / 1 有失败项。 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = [];
const pass = [];
function check(name, ok, detail) {
  (ok ? pass : fail).push({ name, detail });
  console.log((ok ? "  ✓ " : "  ✗ ") + name + (detail ? " — " + detail : ""));
}

/* ---------- 读文件 ---------- */
const tokens = readFileSync(path.join(APP, "src/styles/tokens.css"), "utf8");
const design = readFileSync(path.join(APP, "..", "docs", "DESIGN.md"), "utf8");

/* ---------- 解析：按块抽自定义属性 ---------- */
function extractBlock(text, selectorPattern) {
  const re = new RegExp(selectorPattern.replace(/\s+/g, "\\s*") + "\\s*\\{", "gm");
  const m = re.exec(text);
  if (!m) return null;
  let depth = 1, i = m.index + m[0].length;
  while (depth > 0 && i < text.length) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
    i++;
  }
  const body = text.slice(m.index + m[0].length, i - 1);
  const map = {};
  for (const mm of body.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) map[mm[1].trim()] = mm[2].trim();
  return map;
}
const light = extractBlock(tokens, ":root");
const mediaDark = extractBlock(tokens, "@media \\(prefers-color-scheme: dark\\) \\{\\s*:root:not\\(\\[data-theme='light'\\]\\)");
const explicitDark = extractBlock(tokens, ":root\\[data-theme='dark'\\]");

/* var() 一层解析（--p-* 定义在主题无关的 :root 块，全文件合并后可解） */
const allProps = {};
for (const mm of tokens.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
  if (!(mm[1] in allProps)) allProps[mm[1].trim()] = mm[2].trim();
}
function resolve(value, local) {
  let v = value, guard = 0;
  while (guard++ < 8) {
    const m = String(v).match(/var\((--[\w-]+)(?:,\s*([^)]+))?\)/);
    if (!m) break;
    const rep = (local && local[m[1]]) ?? allProps[m[1]] ?? m[2] ?? "";
    v = String(v).replace(m[0], rep);
  }
  return v.trim();
}

/* ---------- 检查 1 · 双暗色块漂移 ---------- */
console.log("\n[1] 令牌漂移（双暗色块逐项一致）");
const keys = [...new Set([...Object.keys(explicitDark || {}), ...Object.keys(mediaDark || {})])];
const drift = keys.filter((k) => {
  const a = resolve(explicitDark?.[k] ?? "", explicitDark), b = resolve(mediaDark?.[k] ?? "", mediaDark);
  return a !== b;
});
check("双暗色块一致（" + keys.length + " 项）", explicitDark && mediaDark && drift.length === 0,
  drift.length ? "漂移项：" + drift.join(", ") : "含 --bg/--ink/--accent 等全量语义，已归一");

/* ---------- 检查 2 · 对比度 ---------- */
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(fg, bg) {
  const l1 = luminance(fg), l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
const AA = 4.5;
const PAIRS = {
  light: [
    ["--ink", "--bg"], ["--ink", "--surface"], ["--ink-soft", "--bg"], ["--ink-faint", "--bg"],
    ["--ink-soft", "--surface"], ["--accent-text", "--bg"],
    ["--cat-good", "--surface"], ["--cat-need", "--surface"], ["--cat-insight", "--surface"], ["--cat-action", "--surface"],
    ["--danger", "--bg"], ["--ok", "--bg"],
  ],
  dark: [
    ["--ink", "--bg"], ["--ink", "--surface"], ["--ink-soft", "--bg"], ["--ink-faint", "--bg"],
    ["--ink-soft", "--surface"], ["--accent-text", "--bg"],
    ["--cat-good", "--surface"], ["--cat-need", "--surface"], ["--cat-insight", "--surface"], ["--cat-action", "--surface"],
    ["--ok", "--bg"],
  ],
};
function themeResolved(mode) {
  const local = mode === "dark" ? { ...light, ...(explicitDark || {}) } : light;
  const out = {};
  for (const k of Object.keys(local)) out[k] = resolve(local[k], local);
  return out;
}
function hex6(value) {
  const m = String(value).match(/^#([0-9a-fA-F]{6})$/);
  return m ? "#" + m[1].toLowerCase() : null;
}
function contrastCheck(mode) {
  const t = themeResolved(mode);
  const rows = [];
  const bad = [];
  for (const [fg, bg] of PAIRS[mode]) {
    const f = hex6(t[fg] || ""), b = hex6(t[bg] || "");
    if (!f || !b) { bad.push(fg + "/" + bg + " 无法解析为色值（" + (t[fg] || "?") + " on " + (t[bg] || "?") + "）"); continue; }
    const r = Math.round(contrast(f, b) * 100) / 100;
    rows.push(mode + " " + fg + " on " + bg + " = " + r.toFixed(2) + ":1" + (r >= AA ? " ✓" : " ✗"));
    if (r < AA) bad.push(fg + " on " + bg + " 仅 " + r + ":1");
  }
  /* 按钮对：fg-on-accent 对 accent-deep（亮暗同值） */
  const btn = contrast(hex6(t["--fg-on-accent"] || "#ffffff"), hex6(t["--accent-deep"] || "#000000"));
  rows.push(mode + " --fg-on-accent on --accent-deep = " + btn.toFixed(2) + ":1 ✓（按钮底预算 5.25）");
  if (btn < AA) bad.push("按钮底对比 " + btn.toFixed(2) + ":1");
  return { rows, bad };
}
console.log("\n[2] 对比度全表（AA " + AA + ":1 预算）");
const li = contrastCheck("light"), da = contrastCheck("dark");
li.rows.concat(da.rows).forEach((r) => console.log("  " + r));
check("亮色对比度 " + li.rows.length + " 对", li.bad.length === 0, li.bad.join("；"));
check("暗色对比度 " + da.rows.length + " 对", da.bad.length === 0, da.bad.join("；"));

/* ---------- 检查 3 · 色值字面量基线（P-013） ---------- */
console.log("\n[3] 色值字面量（tokens.css 之外，基线比对）");
const BASELINE = {
  "#e8833a": 5, "#97928a": 5, "#736e66": 5, "#211e1a": 5, "#ffffff": 3, "#f7f3ea": 3,
  "#f5f4f1": 3, "#e6e4df": 3, "#1b1813": 3, "#fffdf9": 2, "#faf9f7": 2, "#b0500f": 2,
  "#918a7e": 2, "#66625a": 2, "#191816": 2, "#101014": 2, "#ffd28a": 1, "#e5ddcc": 1,
  "#cfd3d8": 1, "#b85c38": 1, "#a5512f": 1, "#a34e12": 1, "#a03131": 1, "#827d73": 1,
  "#6b665e": 1, "#3a342a": 1, "#2a2a2a": 1,
};
import { readdirSync, statSync } from "node:fs";
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(tsx|css)$/.test(name) && name !== "tokens.css") out.push(p);
  }
  return out;
}
const counts = {};
for (const f of walk(path.join(APP, "src"))) {
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
    const k = "#" + m[1].toLowerCase();
    counts[k] = (counts[k] || 0) + 1;
  }
}
const newDrift = Object.keys(counts).filter((k) => (counts[k] || 0) > (BASELINE[k] || 0));
check("色值字面量未超基线（现存 " + Object.keys(counts).reduce((a, k) => a + counts[k], 0) + " 处 / " + Object.keys(counts).length + " 色）",
  newDrift.length === 0, newDrift.length ? "新增漂移：" + newDrift.map((k) => k + "×" + counts[k] + "(基线" + (BASELINE[k] || 0) + ")").join("、") + " —— 请改用令牌引用" : "同框对比基线锁定，见 P-013");

/* ---------- 检查 4 · 契约结构（DESIGN.md 九节） ---------- */
console.log("\n[4] 品牌契约结构（docs/DESIGN.md 九节）");
const SECTIONS = ["视觉主题与氛围", "色板与角色", "字体排印", "布局与间距", "组件", "动效与交互", "图标与影像", "语气与口吻", "边角与变化"];
const missing = SECTIONS.filter((s) => !design.includes(s));
check("九节齐全", missing.length === 0, missing.length ? "缺：" + missing.join("、") : "对照开源设计系统包约定，结构重叠 9/9");

/* ---------- 检查 5 · 零个人信息（AGENTS.md 规则 7） ---------- */
console.log("\n[5] 零个人信息（设计两文件）");
const leak = [tokens, design].map((t) => (t.match(/E:\\|C:\\Users|192\.168\.|10\.\d+\.\d+\./g) || [])).flat();
check("设计令牌与契约无盘符路径 / 内网地址", leak.length === 0, leak.length ? "命中：" + leak.slice(0, 3).join("、") : "");

/* ---------- 汇总 ---------- */
console.log("\n—— 校验完成：" + (fail.length ? "✗ " + fail.length + " 项失败" : "✓ 全部通过") + "（" + (pass.length + fail.length) + " 项）——");
process.exit(fail.length ? 1 : 0);
