#!/bin/bash
# 让 DSH 重新拉起 MCP 服务（改完 src/mcp-snowluma-safe.js 后执行即可，不用重启 DSH）
# 原理：MCP 是 DSH 的子进程，被 kill 后 DSH 会自动重启它（已实测约 12 秒）。
#
# 匹配用的是**本仓库的真实绝对路径**，不写死仓库目录名 —— 这样仓库被 clone 成
# 别的名字（或放在任意目录）都能正常工作。
set -u
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENTRY="$REPO_DIR/src/mcp-snowluma-safe.js"

pkill -f "$ENTRY" 2>/dev/null
sleep 12
if pgrep -f "$ENTRY" >/dev/null; then
  echo "MCP 已由 DSH 自动重启（新 pid $(pgrep -f "$ENTRY" | head -1)）"
else
  echo "MCP 未自动重启：请重启 DSH 桌面版（Cmd+Q 重开）"
fi
