/**
 * 回路模块 schema shim：统一数据层在 PWORK 根 schema（W3 数据层统一，03 §5.1）。
 * 模块内代码继续从 './schema' 导入 db，无感迁移到 `pwork-workbench` 库。
 */
export { db, usingMemoryFallback } from '../../../db/schema'
