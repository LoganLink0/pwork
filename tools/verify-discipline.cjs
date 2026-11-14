/* PWORK 纪律机械门禁：把已经发生的事故变成会失败的检查。零依赖。
 *
 * 事故校准依据（每项检查对应真实发生的违规）：
 *   禁词   —— a6e03c3/d584307 等提交说明与代码注释反复出现"落地/钉死"（AGENTS.md 有禁令，模型不执行）
 *   TODO   —— P-12/P-26（占位不实装、验收不可判定），全库审计的代码体量检查项
 *   证据   —— 7acf912/100940b 模型声称"验证通过"用户实机抓出；CDP 截图是渲染器内部帧，DWM 合成后是另一个样子，
 *             因此声称截图验证时必须有真实屏幕截图文件入库
 *   混提   —— cba6f82 把并行会话产出混入提交；本脚本自身提交时即按"只含本任务文件"执行
 *
 * 用法：
 *   node tools/verify-discipline.cjs              全量巡检：结构病 fail（构建产物入库/规范缺失），存量违规只列账不清零
 *   node tools/verify-discipline.cjs --staged     提交前：只查暂存新增行，命中即拒（存量不拦，只拦增量）
 *   node tools/verify-discipline.cjs --commit-msg <msgfile>   说明声称截图验证但无图片入库 → 拒
 *
 * 豁免：AGENTS.md（规则文本必然引用禁词原文）、本脚本、hooks 目录。
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BANNED = ['落地', '钉死', '赋能', '抓手'];
const CODE_EXTS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.rs', '.css'];
const TODO_RE = /\/\/\s*(TODO|FIXME|HACK)\b/;
const CLAIM_RE = /截图验证|桌面截图|实机截图|屏幕截图/;
const IMG_RE = /\.(png|jpe?g|webp|gif)$/i;
/* 豁免路径：规则文本与门禁自身（黑名单文件自身必然含黑名单词）。git 输出路径永远是正斜杠，统一按 / 判定 */
const EXEMPT = p => { const u = p.split(path.sep).join('/'); return u === 'AGENTS.md' || u.startsWith('tools/verify-discipline') || u.includes('scripts/hooks/'); };

const git = (args) => execSync('git ' + args, { encoding: 'utf8', cwd: ROOT }).trim();

let failed = [];
const fail = (msg) => { failed.push(msg); };

/* ---------- 提交前模式：只查暂存新增行 ---------- */
function checkStaged() {
  const diff = git('diff --cached -U0 --no-color');
  const lines = diff.split('\n');
  let file = '';
  const hits = [];
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('+++ b/')) { file = line.slice(6); continue; }
    if (line.startsWith('Binary files')) continue;
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    if (!CODE_EXTS.includes(path.extname(file)) || EXEMPT(file)) continue;
    const body = line.slice(1);
    for (const w of BANNED) {
      if (body.includes(w)) hits.push(`禁词「${w}」 ${file}: ${body.trim().slice(0, 80)}`);
    }
    const m = body.match(TODO_RE);
    if (m) hits.push(`新增 ${m[1]} 注释 ${file}: ${body.trim().slice(0, 80)}`);
  }
  hits.forEach(h => fail('暂存新增行违规：' + h));

  /* 混提预警：把暂存文件清单打出来，提交者对着任务清单自证只含本任务改动（cba6f82 教训） */
  const stagedFiles = git('diff --cached --name-only').split('\n').filter(Boolean);
  console.log('本次提交涉及 ' + stagedFiles.length + ' 个文件：');
  stagedFiles.forEach(f => console.log('  ' + f));
  console.log('确认以上全部属于本任务——并行会话的改动留给其所属会话提交。');
}

/* ---------- 说明模式：声称截图验证必须有图片入库 ---------- */
function checkCommitMsg(msgFile) {
  const msg = fs.readFileSync(msgFile, 'utf8').replace(/\r$/, '');
  if (!CLAIM_RE.test(msg)) return;
  const imgs = git('diff --cached --name-only').split('\n').filter(f => IMG_RE.test(f));
  if (imgs.length === 0) {
    fail('提交说明声称「' + (msg.match(CLAIM_RE) || ['截图验证'])[0] + '」，但本次没有任何图片文件入库。' +
      '真实屏幕证据必须以图片文件入库（建议 .github/screenshots/）；CDP/渲染器内部帧截图不算证据。');
  }
}

/* ---------- 全量巡检：结构病 fail，存量列账 ---------- */
function checkAll() {
  /* 结构病 1：构建产物/依赖目录入库 */
  const tracked = git('ls-files').split('\n');
  const inRepo = tracked.filter(f => /^(app\/dist|dist|node_modules|app\/node_modules)\//.test(f));
  if (inRepo.length) fail(`构建产物或依赖被 git 跟踪 ${inRepo.length} 个文件，如：${inRepo.slice(0, 3).join('、')}`);

  /* 结构病 2：协作规范在场 */
  if (!fs.existsSync(path.join(ROOT, 'AGENTS.md'))) fail('AGENTS.md 缺失');

  /* 存量列账：代码中禁词与 TODO 注释的全部现况（不 fail，由后续任务逐条清，新增由 --staged 拦截） */
  const scanDirs = ['app/src', 'src-tauri/src', 'tools', 'scripts'].filter(d => fs.existsSync(path.join(ROOT, d)));
  let stock = 0;
  for (const dir of scanDirs) {
    const walk = (d) => {
      for (const name of fs.readdirSync(d)) {
        const fp = path.join(d, name);
        const st = fs.statSync(fp);
        if (st.isDirectory()) { walk(fp); continue; }
        if (!CODE_EXTS.includes(path.extname(name)) || EXEMPT(path.relative(ROOT, fp))) continue;
        const rel = path.relative(ROOT, fp).split(path.sep).join('/');
        fs.readFileSync(fp, 'utf8').split('\n').forEach((l, i) => {
          for (const w of BANNED) {
            if (l.includes(w)) { console.log(`  存量禁词「${w}」 ${rel}:${i + 1}`); stock++; }
          }
          if (TODO_RE.test(l)) { console.log(`  存量 TODO ${rel}:${i + 1}`); stock++; }
        });
      }
    };
    walk(dir);
  }
  console.log(`存量合计 ${stock} 处（列账不清零；增量由提交钩子拦截，逐步消化）`);
}

/* ---------- 主流程 ---------- */
if (process.argv.includes('--staged')) {
  checkStaged();
} else if (process.argv.includes('--commit-msg')) {
  const i = process.argv.indexOf('--commit-msg');
  checkCommitMsg(process.argv[i + 1]);
} else {
  checkAll();
}

if (failed.length) {
  failed.forEach(f => console.error('[拦截] ' + f));
  process.exit(1);
}
console.log('[通过] 纪律门禁 ' + (process.argv.includes('--staged') ? '（暂存增量）' : process.argv.includes('--commit-msg') ? '（说明与证据一致性）' : '（全量巡检）'));
