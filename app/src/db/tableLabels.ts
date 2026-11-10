/**
 * 表名 → 界面中文名（提示条/弹窗/迁移进度共用）。
 * 界面上不直接出现表名英文——同一张表在各处必须叫同一个名字。
 */
export const TABLE_LABEL: Record<string, string> = {
  notes: '速记',
  sources: '信息源',
  items: '信息条目',
  tasks: '待办',
  goals: '目标',
  reviews: '复盘',
  actions: '行动项',
  insights: '洞察',
  snapshots: '周趋势',
  blocks: '数据块',
  profiles: '调研对象',
  caseFiles: '案例文件',
  aiCache: 'AI 缓存',
  errorLog: '错误日志',
  kv: '本地设置',
}

export function tableLabel(name: string): string {
  return TABLE_LABEL[name] ?? name
}
