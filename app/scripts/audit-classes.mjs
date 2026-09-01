import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = 'src'
const cssFiles = []
const tsxFiles = []
function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    const s = statSync(p)
    if (s.isDirectory()) walk(p)
    else if (f.endsWith('.css')) cssFiles.push(p)
    else if (f.endsWith('.tsx') || f.endsWith('.ts')) tsxFiles.push(p)
  }
}
walk(SRC)
const cssText = cssFiles.map((f) => readFileSync(f, 'utf8')).join('\n')

const classes = new Set()
for (const f of tsxFiles) {
  const text = readFileSync(f, 'utf8')
  for (const m of text.matchAll(/className=["'`]([^"'`]+)["'`]/g)) {
    for (const c of m[1].split(/\s+/)) {
      if (/^[a-z][a-z0-9-]*$/i.test(c)) classes.add(c)
    }
  }
  for (const m of text.matchAll(/className=\{[`'"]([^}]*)[`'"]/g)) {
    for (const c of m[1].split(/[\s'"]+/)) {
      if (/^[a-z][a-z0-9-]*$/i.test(c) && !c.includes('$')) classes.add(c)
    }
  }
}
const missing = []
for (const c of classes) {
  const esc = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp('\\.' + esc + '[\\s,{:\\[.>]')
  if (!re.test(cssText)) missing.push(c)
}
console.log('TSX/TS 引用的类名总数:', classes.size)
console.log('CSS 无定义的类名:', missing.length ? missing.join(', ') : '（无）')
