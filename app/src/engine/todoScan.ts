/**
 * 项目待办扫描（2026-10-14 用户拍板：真实工作流需求——各项目 TODO.md 的未完成项聚进 PWORK）。
 * 纯解析与映射在此（可单测）；文件系统访问见 fsTodoScan.ts。
 * 边界（用户已确认）：单向导入不回写源文件；只读；源文件删除的行不反向删；
 * 指纹 = 项目名 + 行文本，重复扫描幂等。
 */

export interface ScannedTodo {
  /** 项目名（TODO.md 所在文件夹名） */
  project: string
  /** 所在小节标题（最近一个 ## 标题；文件头为空） */
  section: string
  /** 未勾选行文本（去掉 "- [ ] " 前缀） */
  text: string
}

export interface TodoTaskInput {
  title: string
  lane: 3
  origin: { kind: 'todo-file'; refId: string }
}

export function todoFingerprint(project: string, text: string): string {
  return `${project}::${text.trim()}`
}

/** 解析一份 TODO.md → 未完成项（只认 "- [ ]"；已完成 [x] 与非任务行忽略；PWORK 自身的 TODO.md 同样适用） */
export function parseTodoMarkdown(md: string): { section: string; text: string }[] {
  const out: { section: string; text: string }[] = []
  let section = ''
  for (const rawLine of md.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('#')) {
      const heading = line.replace(/^#+\s*/, '').trim()
      if (heading) section = heading
      continue
    }
    const m = line.match(/^[-*]\s+\[ \]\s*(.*)$/)
    if (m && m[1]!.trim()) {
      out.push({ section, text: m[1]!.trim() })
    }
  }
  return out
}

/** 扫描结果 → 待办输入；existing 为库中已有的 todo-file 指纹集合（幂等去重） */
export function toTodoTaskInputs(
  scanned: ScannedTodo[],
  existingFingerprints: Set<string>,
): TodoTaskInput[] {
  const seen = new Set<string>()
  const inputs: TodoTaskInput[] = []
  for (const s of scanned) {
    const fp = todoFingerprint(s.project, s.text)
    if (existingFingerprints.has(fp) || seen.has(fp)) continue
    seen.add(fp)
    inputs.push({
      title: `[${s.project}]${s.section ? `「${s.section}」` : ' '}${s.text}`,
      lane: 3,
      origin: { kind: 'todo-file', refId: fp },
    })
  }
  return inputs
}
