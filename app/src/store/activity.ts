import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { isDesktopApp } from '../engine/platform'

/**
 * 活动注册表（胶囊岛数据源，41+ 批）：进行中活动的全局登记。
 * 主窗各处 reportStart/reportEnd 登记 → 变化时桥接转发给 isle 窗（Rust isle_set_activity）。
 * 仅桌面版转发；网页版/测试环境静默空转。isles 窗渲染与尺寸调整在 isle 窗内部完成。
 */
export interface ActivityItem {
  id: string
  label: string
}

/** 活动结束时的结果瞬态：岛上展示数秒后自动消失（完成 ✓ / 失败 ✗） */
export interface ActivityNotice {
  ok: boolean
  label: string
}

interface ActivityState {
  activities: ActivityItem[]
  /** 登记一个进行中活动（同 id 重复登记为刷新文案） */
  start: (id: string, label: string) => void
  /** 活动结束（撤销登记）；带 done 时岛上展示结果瞬态 */
  end: (id: string, done?: ActivityNotice) => void
}

function pushToIsle(activities: ActivityItem[], notice?: ActivityNotice) {
  if (!isDesktopApp()) return
  void invoke('isle_set_activity', { activities, notice: notice ?? null }).catch(() => {})
}

export const useActivity = create<ActivityState>((set, get) => ({
  activities: [],
  start: (id, label) => {
    const activities = [...get().activities.filter((a) => a.id !== id), { id, label }]
    set({ activities })
    pushToIsle(activities)
  },
  end: (id, done) => {
    const activities = get().activities.filter((a) => a.id !== id)
    set({ activities })
    pushToIsle(activities, done)
  },
}))
