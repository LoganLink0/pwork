import type { CSSProperties } from 'react'

/** 便签卡的直贴姿态（CSS 变量形式，便签不再倾斜）；与组件分离以便 fast-refresh */
export const stickyStraight: CSSProperties = { '--tilt': '0deg' } as CSSProperties
