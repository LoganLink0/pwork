#!/bin/sh
# 部署向导（macOS / Linux 入口，与 部署向导.cmd 等价）：主体逻辑在 scripts/deploy-wizard.mjs（跨平台）。
# 双击或终端运行本脚本即可；需要已安装 Node.js ≥ 20。
cd "$(dirname "$0")" || exit 1
node scripts/deploy-wizard.mjs
echo
echo "向导已结束——如输出里有端点地址与 Token，请回到应用内粘贴保存。"
read -r -p "按回车关闭窗口…" _
