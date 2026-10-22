# Windows 完整安装指南（SnowLuma + DSH）

> 本文是 **Windows 版**的完整从零安装。macOS 版（NapCat）见
> [MACOS_NAPCAT.md](MACOS_NAPCAT.md)；两版共用的东西（preset、人格卡、控制台、MCP 工具、
> 语音字段）都写在各自的通用文档里，本文只讲 **Windows 特有的部分**。
>
> 脚本都在仓库的 [`windows/`](../../windows/README.md) 目录，先看那张清单会更快。

---

## 一、前置条件

| 依赖 | 要求 | 检查方式 |
| --- | --- | --- |
| Windows | Windows 10 / 11（x64） | — |
| Node.js | **≥ 22.13** | `node -v` |
| DSH | **Web 版**（固定 3080）或**桌面版**（随机端口） | 能打开 DSH 界面即可 |
| QQ 网关 | **SnowLuma**（官方 Windows 版） | 见第四节 |
| Python（可选） | 3.10（3.9~3.11 一般也行），仅语音需要 | `python --version` |
| ffmpeg（可选） | 仅语音的音量/变调需要 | `ffmpeg -version` |
| 显卡（可选） | NVIDIA → CUDA；AMD → CPU 兜底 | `nvidia-smi` |

> ✅ **语音是可选的。** 不装 Python / GPT-SoVITS，桥接会自动用 edge-tts；连 edge-tts 都没装时，
> 语音工具会明确报错但**不影响文字聊天**。

装完想看环境是否齐：**先跑体检脚本**

```bat
powershell -ExecutionPolicy Bypass -File windows\check-env.ps1
```

它会逐项打印 `[OK]` / `[!!]`（Node 版本、Python、ffmpeg、显卡、3000/3001/3080/3100/9881 端口、
config.json、白名单是否为空），只读不写。

---

## 二、步骤 1：装桥接本体

```bat
git clone <你的仓库地址> qq-bridge
cd qq-bridge
npm install
copy config.example.json config.json
```

`npm install` 的 `postinstall` 会自动修补 `@snowluma/sdk` 的 ESM 打包 bug。

> 没有 git？在 GitHub 页面点 **Code → Download ZIP**，解压后进目录执行后两条命令即可。

---

## 三、步骤 2：装 DSH 端（最容易漏的一步）

```bat
node scripts\setup-dsh.mjs web
```

- **DSH Web 版** → 参数写 `web`（默认值，可省略）
- **DSH 桌面版** → 参数写 `desktop`：`node scripts\setup-dsh.mjs desktop`

脚本会做三件事：装两个 agent preset（`qq-chat` / `qq-chat-v2`）、挂三个 MCP server、
把两个 bundle 注册进 profile，并在没有 DSH 设置时写一份 `state\mode.json` 兜底。

> ⚠️ **装完必须重启 DSH**：preset 与 MCP 只在 DSH 启动时加载。
> 跳过这一步桥接不会崩，但 QQ 上会**毫无反应**（日志里是「缺少 preset」）。

细化说明见 [DSH_SETUP.md](DSH_SETUP.md)。

---

## 四、步骤 3：安装并配置 SnowLuma（QQ 网关）

1. 下载：<https://github.com/SnowLuma/SnowLuma/releases/latest>
   选 **`SnowLuma-v<版本>-win-x64.zip`（完整版，自带 Node 运行时）**；Lite 版需要本机 Node 22.13+。
2. 解压到任意目录（例如 `C:\SnowLuma`），双击 **`launcher.bat`**。
3. 打开启动日志里的 WebUI 地址（README 写 `http://localhost:5099`，以日志为准），用**日志里的初始密码**登录。
4. 按引导：同意条款 → 设置密码 → 接入 QQ 进程（**扫码登录你的机器人账号**）。
5. 在 WebUI 里开启 OneBot：
   - **WebSocket 服务端** → 端口默认 `3001`
   - **HTTP API** → 端口默认 `3000`
   - 如果设置了 **accessToken**，记下来（下面要填）
6. 验证网关活着：浏览器打开 `http://127.0.0.1:3000/get_login_info`，应返回 `"status":"ok"` 和机器人账号。

> 本项目**不安装、不启动、不控制** SnowLuma（见 [LICENSE](../../LICENSE) 与 [RULES.md](../../RULES.md)）。
> 上面这些操作都是你在它自己的 WebUI 里完成的。

---

## 五、步骤 4：填写 `config.json`

最少要改这四处（用记事本 / VS Code 打开，**注意 JSON 逗号**）：

```json
{
  "snowluma": {
    "wsUrl": "ws://127.0.0.1:3001",
    "httpUrl": "http://127.0.0.1:3000",
    "accessToken": "你的 OneBot token（没设就留空）"
  },
  "ownerQQ": 你的QQ号,
  "allow": {
    "private": [你的QQ号],
    "groups": []
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `wsUrl` | OneBot **WebSocket** 端口（不要填成 HTTP 的 3000，否则连不上） |
| `httpUrl` | OneBot **HTTP API** 端口（填成 WS 端口会报 HTTP 426） |
| `ownerQQ` | 管理员 QQ 号：只有它能用「账号装扮 / 好友管理 / 唱歌」等主人专属工具 |
| `allow.private` / `allow.groups` | 白名单。**留空 = 不响应任何消息**（刻意的 fail-closed） |

> 白名单也可以之后在控制台「访问与安全」页里填，不用手改 JSON。

---

## 六、步骤 5：启动

### 方式 A：DSH Web 版（端口固定 3080）—— 一键

```bat
windows\start-all-windows.bat
```

它会依次：拉起 `%USERPROFILE%\SnowLuma\launcher.bat` → 等 OneBot 就绪（最多 30 秒）→
（可选）拉起语音引擎 → 启动桥接守护（崩溃 5 秒后自动重启）。

可用的环境变量：

```bat
set SNOWLUMA_HOME=D:\SnowLuma    :: SnowLuma 目录（默认 %USERPROFILE%\SnowLuma）
set GSV_DIR=D:\GPT-SoVITS        :: 语音引擎目录（AUTOSTART 时才需要）
set GSV_AUTOSTART=1              :: 同时拉起语音引擎（默认不拉）
```

### 方式 B：DSH 桌面版（每次启动端口都变）

```bat
node scripts\start-windows.mjs
```

它用 `netstat -ano` + `tasklist` 找到**正在运行的 DSH 进程**监听的端口，逐个探测
`401 + "dsh web authentication required"`，命中后把 `dsh.baseUrl` 写回 `config.json`，再启动桥接。

只想看看探测结果：`node scripts\start-windows.mjs --check`（不写配置、不启动）。

> 为什么需要它：桥接内部的端口自愈走的是 macOS 的 `pgrep + lsof`，Windows 上拿不到端口。

### 方式 C：手动

```bat
npm start
```

（用 `config.json` 里现有的 `dsh.baseUrl`，不探测。）

### 启动成功的标志

- 桥接日志：`SnowLuma 已连接：ws://127.0.0.1:3001`
- 控制台 <http://127.0.0.1:3100> 能打开（令牌：`state\console-token`，首次启动自动生成）
- 用你的 QQ 私聊机器人发一句「你好」，几秒内应有回复

> 桥接**单实例**：重复启动会被拒绝（`exit 2`）。要重启用 `restart.bat`。

---

## 七、步骤 6：语音（三选一，可选）

三条链路的关系见 [VOICE.md](VOICE.md)。Windows 上推荐顺序：

### 选 0：不装本地引擎（最省事）

只装 Python + edge-tts：

```bat
pip install --user edge-tts
ffmpeg -version    :: 没装的话：winget install Gyan.FFmpeg
```

`config.json` 保持 `socialV2.voice.ttsBackend: "edge"`、`gsv.enabled: false` 即可。
语音是微软在线音色（5 种语气），需要联网。

### 选 A：NVIDIA 显卡 + 本地专属音色（CUDA）

1. 装 **NVIDIA 驱动**（`nvidia-smi` 能出表就行）。
2. 装 **GPT-SoVITS**（二选一）：
   - **推荐：官方整合包**（自带 `runtime\python.exe`、模型、依赖）——从
     <https://github.com/RVC-Boss/GPT-SoVITS/releases> 下载 `GPT-SoVITS-v2proplus*.7z`，解压到例如 `D:\GPT-SoVITS`。
   - 或自己 clone 仓库 + `pip install -r requirements.txt` + 下载预训练模型（步骤多，见其官方文档）。
3. 确认整合包是 **CUDA 版 PyTorch**（整合包默认就是；如果你是手动装的 CPU 版 torch，需要：
   `pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121`）。
4. 启动语音引擎：

   ```bat
   set GSV_DIR=D:\GPT-SoVITS
   windows\start-gsv-nvidia.bat
   ```

   脚本会自动把 `windows\gsv\tts_infer_v2proplus_cuda.yaml` 复制到
   `%GSV_DIR%\GPT_SoVITS\configs\`，然后用 `device: cuda` 在 `127.0.0.1:9881` 起服务。

5. 在 `config.json` 里打开：

   ```json
   "socialV2": {
     "voice": {
       "enabled": true,
       "ttsBackend": "gsv",
       "gsv": {
         "enabled": true,
         "url": "http://127.0.0.1:9881",
         "refAudio": "D:/GPT-SoVITS/ref/your-reference.wav",
         "promptText": "参考音频里说的那句话（要一致）",
         "version": "v2ProPlus"
       }
     }
   }
   ```

   > `refAudio` 用**干净的单人 5~10 秒音频**（32kHz 单声道 wav 最好），
   > 背景音乐/噪声会被一起学进去，听起来会「糊、电音」。

6. 重启桥接，在控制台或 QQ 上说「发条语音听听」验证。

**显存不够（报 CUDA out of memory）**：把 `tts_infer_v2proplus_cuda.yaml` 里的 `is_half: true`
保持不动、把 `sample_steps` 调低，或换用 `tts_infer_v2proplus_cpu.yaml`（CPU 模式）。

### 选 B：AMD 显卡 / 没有独显

GPT-SoVITS **没有官方 Windows ROCm 版**，所以：

```bat
set GSV_DIR=D:\GPT-SoVITS
windows\start-gsv-amd.bat
```

- 默认走 **CPU**（`tts_infer_v2proplus_cpu.yaml`）：能跑，短句约 4~10 秒，不需要显卡驱动。
- 想要 GPU 加速的两条路（都属于进阶/实验）：
  - **Linux + ROCm**：官方支持的 AMD GPU 路径；
  - **ZLUDA**（社区项目，把 CUDA 调用翻译到 AMD）：装好后如果能正常 `import torch; torch.cuda.is_available()`，
    设 `set GSV_DEVICE=cuda` 再跑 `start-gsv-amd.bat`，脚本会用 CUDA 配置。
- 固态建议：**不折腾就选 0（edge-tts）**，音色差一点但零维护。

---

## 八、常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| QQ 上完全没反应，日志说已连接 | ① 白名单为空（fail-closed）→ 控制台填；② 没跑 `setup-dsh.mjs` 或没重启 DSH |
| MCP 工具报 **HTTP 426** | `httpUrl` 填成了 WebSocket 端口，改回 `http://127.0.0.1:3000` |
| 连不上 DSH（桌面版重启后必现） | 用 `node scripts\start-windows.mjs`，或把 `dsh.baseUrl` 改成当前实际端口 |
| 启动报「已有实例在运行」 | 桥接单实例锁：先 `restart.bat` 或结束残留的 `node.exe` |
| 控制台打不开 / 要令牌 | 令牌在 `state\console-token`；端口 `consolePort`（默认 3100）被占用时改配置 |
| 中文在 cmd 窗口乱码 | 桥接与 `.bat` 已强制 `chcp 65001` + 纯 ASCII 脚本；仍乱码请用 Windows Terminal |
| 语音报「找不到带 edge_tts 的 Python」 | `pip install --user edge-tts`，或设 `QQ_BRIDGE_EDGE_TTS_PYTHON` 指向解释器 |
| GSV 报 CUDA out of memory | 换 CPU 配置，或降 `sample_steps` / 换更小模型（v2 而非 v2ProPlus） |
| GSV 起来了但语音还是 edge-tts 音色 | `ttsBackend` 不是 `gsv`，或 `gsv.url` 端口与脚本不一致（默认 9881） |
| 端口 3000/3001 被占用 | SnowLuma WebUI 里换端口，并同步改 `config.json` 的 `wsUrl` / `httpUrl` |

排查顺序：`check-env.ps1` → 看 SnowLuma 日志 → 看桥接日志（`state\bridge.log`）→ 控制台「运行总览」。

---

## 九、更新与回滚

**更新桥接**：停桥接 → `git pull` → `npm install` → 重启桥接；改了 `dsh/agent-presets/` 时
额外跑一次 `node scripts\build-agent-preset-patches.mjs` 并重启 DSH。

**回滚**：
1. `Ctrl+C` 停桥接（或结束 `node.exe`）。
2. 删掉 `%USERPROFILE%\.dsh\plugins\qq-mode-console` 与 `qq-agent-presets` 两个链接。
3. 用备份还原 `%USERPROFILE%\.dsh\profiles\<profile>\cordis.patch.yml`（`setup-dsh.mjs` 每次覆盖前
   都会留 `*.bak-<时间戳>`），并从 `package.json` 的依赖/bundles 里删掉两个 `qq-*` 条目。重启 DSH。
4. SnowLuma 卸载：用它自己的卸载/切回原版功能；本项目不碰 QQ 本体。

---

## 十、平台对照速查

| 事项 | Windows | macOS |
| --- | --- | --- |
| 文档 | 本文 | [MACOS_NAPCAT.md](MACOS_NAPCAT.md) |
| 网关 | SnowLuma | NapCat |
| 一键启动 | `windows\start-all-windows.bat` | `./start-all-mac.command` |
| DSH 桌面版端口 | `node scripts\start-windows.mjs` | `node scripts/start-mac.mjs` |
| 语音引擎 | `windows\start-gsv-*.bat` | `./start-gsv.command` |
| 环境自检 | `windows\check-env.ps1` | `node scripts/start-mac.mjs --check` |
