# Windows 版（SnowLuma + NVIDIA / AMD）

> 这是 **Windows 版本**的入口。macOS 版保持不变，见仓库根目录 [README](../README.md) 与
> [docs/guides/MACOS_NAPCAT.md](../docs/guides/MACOS_NAPCAT.md)。
>
> 两个版本共用同一套桥接内核、preset、人格卡、控制台与语音工具 —— **只有 QQ 网关和
> 语音引擎的安装方式不同**。完整安装步骤见 **[docs/guides/WINDOWS.md](../docs/guides/WINDOWS.md)**。

---

## 一、Windows 版和 macOS 版的区别

| 项目 | macOS 版（保持原样） | Windows 版（本目录） |
| --- | --- | --- |
| QQ 网关 | NapCat（SnowLuma 没有 macOS 版） | **SnowLuma**（官方 Windows 版，原生组件挂进 QQ） |
| OneBot 端口 | WS `3001` / HTTP `3000` | WS `3001` / HTTP `3000`（同名同义） |
| DSH 形态 | 桌面版随机端口 → `start-mac.mjs` | Web 版固定 3080；桌面版随机端口 → `scripts/start-windows.mjs` |
| 语音引擎 | 本地 GPT-SoVITS（CPU / Apple Silicon） | **NVIDIA 用 CUDA**，**AMD 用 CPU 兜底**（详见下表） |
| 启动脚本 | `start-all-mac.command` | `windows/start-all-windows.bat` |
| 环境自检 | — | `windows/check-env.ps1` |

---

## 二、脚本清单（都在本目录）

| 脚本 | 作用 | 什么时候用 |
| --- | --- | --- |
| `check-env.ps1` | 只读体检：Node/Python/ffmpeg/显卡/端口/配置 | **第一次安装时先跑这个** |
| `start-all-windows.bat` | 一键：拉起 SnowLuma → 可选语音引擎 → 启动桥接守护 | 日常启动（DSH **Web 版**） |
| `start-gsv-nvidia.bat` | 启动本地 GPT-SoVITS 语音引擎（**CUDA**） | 有 NVIDIA 显卡、想要专属音色 |
| `start-gsv-amd.bat` | 启动本地 GPT-SoVITS 语音引擎（**CPU**） | AMD 显卡 / 无独显；也能用 `GSV_DEVICE=cuda` 配合 ZLUDA |
| `gsv/tts_infer_v2proplus_cuda.yaml` | CUDA 推理配置模板（device: cuda） | 脚本会自动复制到 GSV 目录 |
| `gsv/tts_infer_v2proplus_cpu.yaml` | CPU 推理配置模板（device: cpu） | 同上 |

DSH **桌面版**（每次启动端口都变）请改用仓库里的：

```bat
node scripts\start-windows.mjs          :: 探测端口 → 写回 config.json → 启动桥接
node scripts\start-windows.mjs --check  :: 只探测，不写、不启动
```

---

## 三、显卡怎么选（语音引擎）

| 你的显卡 | 用哪个脚本 | 说明 |
| --- | --- | --- |
| **NVIDIA**（GTX 16 系及以上 / RTX 全系） | `start-gsv-nvidia.bat` | 走 CUDA，快（短句约 1~3 秒）；显存 6GB 以上舒服，4GB 可把 `is_half` 设 false |
| **AMD**（RX 6000/7000 等） | `start-gsv-amd.bat` | GPT-SoVITS **没有官方 Windows ROCm 版**，所以这个脚本默认走 **CPU**（能跑，短句约 4~10 秒）。想更快：Linux + ROCm，或社区 ZLUDA（成功时设 `GSV_DEVICE=cuda` 用 CUDA 配置） |
| **没有独显 / 核显** | `start-gsv-amd.bat` | 同样是 CPU 模式 |
| **不想装语音引擎** | 什么都不用跑 | 桥接会自动回退 **edge-tts**（微软在线音色，联网即可，零显卡要求） |

> 语音是**可选功能**。不装 GPT-SoVITS 也完全能用：文字、图片、表情包、空间、好友、
> 画图全部正常，语音走 edge-tts。

---

## 四、最短路径（DSH Web 版 + NVIDIA）

```bat
:: 0) 体检（可选但推荐）
powershell -ExecutionPolicy Bypass -File windows\check-env.ps1

:: 1) 在仓库根目录装依赖、生成配置
npm install
copy config.example.json config.json

:: 2) 装 DSH 端（preset + MCP），然后重启 DSH
node scripts\setup-dsh.mjs web

:: 3) 启动 SnowLuma（首次要在 WebUI 里扫码登录 + 开 OneBot）
::    双击 SnowLuma 的 launcher.bat

:: 4) 一键启动（会等 OneBot 就绪再起桥接）
windows\start-all-windows.bat
```

想要专属音色（NVIDIA）：

```bat
set GSV_DIR=D:\GPT-SoVITS
windows\start-gsv-nvidia.bat
:: 然后在 config.json 里把 socialV2.voice.gsv.enabled 设为 true、url 保持 http://127.0.0.1:9881
```

控制台：<http://127.0.0.1:3100>（令牌在 `state\console-token`，首次启动自动生成）。

---

## 五、下一步

- 完整安装（含 SnowLuma WebUI 引导、OneBot 配置、语音参考音频、排错表）→ **[docs/guides/WINDOWS.md](../docs/guides/WINDOWS.md)**
- 语音三条链路与全部字段 → [docs/guides/VOICE.md](../docs/guides/VOICE.md)
- DSH 端安装细节 → [docs/guides/DSH_SETUP.md](../docs/guides/DSH_SETUP.md)
- 权限边界 → [RULES.md](../RULES.md)
