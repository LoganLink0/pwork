# AGENTS.md · 简历辅导（resume-coach）协作规则

## 项目一句话定位

简历辅导服务的独立工作台：八步流程（自检包 → 解码 → 追问 → 诊断 → 改写 → 简历稿 → 交付核对）走完一个客户案例。与 PWORK 完全独立，PWORK 只做跳转入口。

## 怎么跑

- `npm install`（首次）→ `npm run dev`（端口 5274，不要改——PWORK 入口页和浏览器数据都绑在它上面）
- `npm test`（vitest）/ `npm run lint`（oxlint）/ `npm run build`
- AI 走本地网关（PWORK `app` 目录 `npm run gateway`，8788）或直连，在应用「AI 设置」配置；不配 AI 全功能可用

## 技术栈

React 19 + Vite + Dexie（IndexedDB，库名 resume-coach）+ docx/mammoth/pdfjs；测试 vitest + testing-library + fake-indexeddb。

## 目录与硬约定

- `src/engine/` 纯函数（不碰 DOM/DB），`src/db/` 数据层，`src/pages/` 页面——新逻辑先进引擎再接界面
- **上传必须逐文件报告处理结果**（成功 N 字 / 失败原因），禁止静默吞错——`fileExtract.test.ts` 契约锁定
- AI 超时 240s 不要调小（思考型模型实测需要）；每步手册见仓库根 `交接文档.md` 与 PWORK 仓库 `08-简历辅导场景包（服务手册）.md`
- 字段只增不删；软删除；不编造（素材没有的证据如实标缺口）

## 当前状态与下一步

- 八步 E2E 已真机验证通过（2026-09-13，测试数据）；测试 17 个全绿
- 下一步：真实客户跑第一单 → 数据备份/导出 → 版本对比视图
- 完整交接信息（迁移步骤、外部合同、已知坑）见 `交接文档.md`
