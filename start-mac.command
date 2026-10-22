#!/bin/bash
# 双击启动（macOS）：探测 DSH 桌面版端口 → 启动 QQ 桥接
cd "$(dirname "$0")" || exit 1
exec "$(command -v node || echo /opt/homebrew/bin/node)" scripts/start-mac.mjs
