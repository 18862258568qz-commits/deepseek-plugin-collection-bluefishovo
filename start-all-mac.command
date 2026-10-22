#!/bin/bash
# 双击一键启动（macOS）：先拉起 NapCat（QQ + 注入加载器），再探测 DSH 端口并启动 qq-bridge。
# 详细步骤、已知坑与回滚方式见 docs/guides/MACOS_NAPCAT.md。
#
# 可用环境变量（都可省略）：
#   NAPCAT_QQ   机器人 QQ 号。给了就带 `-q` 快速登录；不给则以不带 -q 的方式启动 NapCat，
#               由你在 QQ 窗口里手动登录（首次登录 / 换号时推荐这种）。
#   QQ_APP_BIN  QQ.app 内的可执行文件，默认 /Applications/QQ.app/Contents/MacOS/QQ
#   GSV_DIR     GPT-SoVITS 目录，默认 $HOME/gpt-sovits（没装则跳过，桥接自动回退 edge-tts）
#   GSV_PYTHON  GPT-SoVITS 的 python，默认 $GSV_DIR/venv/bin/python
#   GSV_CONFIG  TTS 推理配置，默认 $GSV_DIR/GPT_SoVITS/configs/tts_infer_v2proplus_cpu.yaml
#   GSV_PORT    GSV 监听端口，默认 9881（改了记得同步 config.json 的 socialV2.voice.gsv.url）
set -u
cd "$(dirname "$0")" || exit 1
mkdir -p state

QQ_APP_BIN="${QQ_APP_BIN:-/Applications/QQ.app/Contents/MacOS/QQ}"
GSV_DIR="${GSV_DIR:-$HOME/gpt-sovits}"
GSV_PYTHON="${GSV_PYTHON:-$GSV_DIR/venv/bin/python}"
GSV_CONFIG="${GSV_CONFIG:-$GSV_DIR/GPT_SoVITS/configs/tts_infer_v2proplus_cpu.yaml}"
GSV_PORT="${GSV_PORT:-9881}"

# 机器人 QQ 号只从环境变量来，仓库里绝不写死真实账号：
#   NAPCAT_QQ=<你的机器人QQ号> ./start-all-mac.command
NAPCAT_QQ="${NAPCAT_QQ:-}"
NAPCAT_QQ_ARG=""
if [ -n "$NAPCAT_QQ" ]; then
  NAPCAT_QQ_ARG="-q $NAPCAT_QQ"
else
  echo "[start-all] 未设置 NAPCAT_QQ：本次不带 -q 启动，请在 QQ 登录窗口手动登录机器人账号。"
  echo "[start-all] 想自动快速登录：NAPCAT_QQ=你的机器人QQ号 ./start-all-mac.command"
fi

if ! pgrep -f "$QQ_APP_BIN --no-sandbox" >/dev/null 2>&1; then
  if [ ! -x "$QQ_APP_BIN" ]; then
    echo "[start-all] 警告：找不到 $QQ_APP_BIN，跳过 NapCat 启动（可用 QQ_APP_BIN=... 指定）。"
  else
    echo "[start-all] 启动 NapCat（$QQ_APP_BIN --no-sandbox $NAPCAT_QQ_ARG）..."
    # shellcheck disable=SC2086  # 故意不加引号：NAPCAT_QQ_ARG 为空时要整体消失
    nohup "$QQ_APP_BIN" --no-sandbox $NAPCAT_QQ_ARG > state/napcat.log 2>&1 &
    for i in $(seq 1 30); do
      sleep 1
      if curl -sS -m 1 http://127.0.0.1:3000/get_login_info 2>/dev/null | grep -q '"status":"ok"'; then
        echo "[start-all] NapCat OneBot 已就绪（HTTP 3000）"
        break
      fi
      if [ "$i" = 30 ]; then
        echo "[start-all] 警告：30 秒内没等到 NapCat OneBot 就绪，请看 state/napcat.log"
      fi
    done
  fi
else
  echo "[start-all] NapCat 已在运行"
fi

# 本地 GPT-SoVITS 语音引擎（默认端口 9881；没装/没启动时桥接会自动回退 edge-tts）
if ! lsof -nP -iTCP:"$GSV_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  if [ -x "$GSV_PYTHON" ]; then
    echo "[start-all] 启动本地 GPT-SoVITS 语音引擎（$GSV_DIR）..."
    OMP_NUM_THREADS=6 MKL_NUM_THREADS=6 nohup "$GSV_PYTHON" "$GSV_DIR/api_v2.py" \
      -a 127.0.0.1 -p "$GSV_PORT" -c "$GSV_CONFIG" \
      > state/gsv.log 2>&1 &
    for i in $(seq 1 120); do
      sleep 1
      if lsof -nP -iTCP:"$GSV_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
        echo "[start-all] GPT-SoVITS 已就绪（http://127.0.0.1:$GSV_PORT）"
        break
      fi
      if [ "$i" = 120 ]; then
        echo "[start-all] 警告：120 秒内 GPT-SoVITS 未就绪，桥接将回退 edge-tts（见 state/gsv.log）"
      fi
    done
  else
    echo "[start-all] 未发现 GPT-SoVITS（$GSV_PYTHON），跳过语音引擎；桥接将使用 edge-tts"
  fi
fi

exec "$(command -v node || echo /opt/homebrew/bin/node)" scripts/start-mac.mjs
