/**
 * 回路模块 datetime shim：统一使用根级实现（超集，含 UTC 漂移防护的同一套函数）。
 */
export { fmtLocal, monthLocal, todayLocal } from '../../../engine/datetime'
