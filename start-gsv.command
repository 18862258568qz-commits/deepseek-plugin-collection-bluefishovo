#!/bin/bash
# 启动本地 GPT-SoVITS 语音引擎（仅监听 127.0.0.1:9881，与 config.json 的 socialV2.voice.gsv.url 一致）
#
# 可用环境变量（都可省略）：
#   GSV_DIR     GPT-SoVITS 目录，默认 $HOME/gpt-sovits
#   GSV_PYTHON  虚拟环境 python，默认 $GSV_DIR/venv/bin/python
#   GSV_CONFIG  TTS 推理配置，默认 $GSV_DIR/GPT_SoVITS/configs/tts_infer_v2proplus_cpu.yaml
#   GSV_PORT    监听端口，默认 9881（改了记得同步 config.json 的 socialV2.voice.gsv.url）
set -u

GSV_DIR="${GSV_DIR:-$HOME/gpt-sovits}"
GSV_PYTHON="${GSV_PYTHON:-$GSV_DIR/venv/bin/python}"
GSV_CONFIG="${GSV_CONFIG:-$GSV_DIR/GPT_SoVITS/configs/tts_infer_v2proplus_cpu.yaml}"
GSV_PORT="${GSV_PORT:-9881}"

if [ ! -d "$GSV_DIR" ]; then
  echo "[gsv] 找不到 GPT-SoVITS 目录：$GSV_DIR"
  echo "[gsv] 用 GSV_DIR=/path/to/gpt-sovits 指定；装法见 docs/guides/VOICE.md"
  exit 1
fi
if [ ! -x "$GSV_PYTHON" ]; then
  echo "[gsv] 找不到可执行的 python：$GSV_PYTHON"
  echo "[gsv] 通常是虚拟环境没建好（python -m venv venv），或用 GSV_PYTHON=... 指定"
  exit 1
fi

cd "$GSV_DIR" || exit 1
if lsof -nP -iTCP:"$GSV_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[gsv] 已在运行：http://127.0.0.1:$GSV_PORT"
  exit 0
fi
echo "[gsv] 启动中（首次加载模型约 20~60 秒）..."
exec env OMP_NUM_THREADS=6 MKL_NUM_THREADS=6 "$GSV_PYTHON" api_v2.py -a 127.0.0.1 -p "$GSV_PORT" -c "$GSV_CONFIG"
