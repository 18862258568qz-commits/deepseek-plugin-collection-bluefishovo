# 文档索引（docs/README.md）

> 根目录只留 `README.md` / `README.en.md` / `RULES.md` 三个文档，其余全部在本目录下。
> 仓库目录结构与 `scripts/` 命名约定见 **[FOLDER_MAP.md](FOLDER_MAP.md)**；安装入口见 **[../README.md](../README.md)**。
>
> **状态标记**：✅ 仍然有效（按它做就对） · ⚠️ 部分内容以代码为准

---

## guides/ —— 面向使用者 / 运维

| 文档 | 一句话说明 | 状态 |
| --- | --- | --- |
| [guides/DSH_SETUP.md](guides/DSH_SETUP.md) | **DSH 端安装说明**：`qq-chat` / `qq-chat-v2` 两个 preset 与三个 MCP server 怎么装到目标设备的 DSH 上（`scripts/setup-dsh.mjs` 的 profile 参数、幂等性、验证方式），外加一整节常见报错对照表 | ✅ **装完桥接必读** |
| [guides/WINDOWS.md](guides/WINDOWS.md) | **Windows 接入全流程**：SnowLuma 网关、DSH Web/桌面版（`scripts/start-windows.mjs` 探测随机端口）、`windows/` 一键启动与环境体检、语音引擎选型（NVIDIA CUDA / AMD CPU 兜底 / 不装走 edge-tts）、常见问题与回滚 | ✅ **Windows 用户从这里开始** |
| [guides/MACOS_NAPCAT.md](guides/MACOS_NAPCAT.md) | **macOS 接入全流程**：为什么 macOS 用 NapCat 而不是 SnowLuma、NapCat 安装器与 App 管理（TCC）授权、OneBot 配置、DSH 桌面版随机端口（`scripts/start-mac.mjs`）、已知降级、DSH 0.2.1 的 `{{cwd}}` 兼容修复、完整回滚步骤 | ✅ **macOS 用户从这里开始** |
| [guides/VOICE.md](guides/VOICE.md) | **语音发送全解**：三条链路（预制语音库 / edge-tts 动态合成 / 本地 GPT-SoVITS 专属音色）、全部 `socialV2.voice.*` 字段、GSV 安装与参考音频准备、ffmpeg 依赖、语音模式窗口、故障排查表 | ✅ |
| [guides/TOKEN_USAGE_CONSOLE.md](guides/TOKEN_USAGE_CONSOLE.md) | 控制台「令牌与花费」看板：数据来源、计价口径（峰谷分时）、API、配置 | ✅ |
| [guides/CONSOLE-UI-TESTING.md](guides/CONSOLE-UI-TESTING.md) | 控制台离线预览（`npm run preview:console`）与离线浏览器回归（`npm run test:console-ui`）怎么用 | ✅ |
| [guides/SECURITY_BASELINE.md](guides/SECURITY_BASELINE.md) | **安全基线与威胁模型**：威胁主体、已实现的边界（准入 / 工具面 / 出站 / 控制台 / 落盘 / 网络）、已知残余风险、发布前回归清单、改动检查单 | ✅ **改动安全相关代码前必读** |
| [guides/DSH_020_ADAPTATION.md](guides/DSH_020_ADAPTATION.md) | **DSH 0.2.0 适配改动记录**（v0.1.7 → v0.2.0）：逐条列出为适配 0.2.0-rc.2 做的改动（现象 / 为什么必须改 / 证据 / 怎么验证），并单独列出「复核后判定兼容、因此没改」的部分 | ✅ **升级 DSH 前先读** |
| [guides/PRIVACY.md](guides/PRIVACY.md) | **发布前隐私检查**：`scripts/privacy-scan.mjs` 的用法、内置规则（本机绝对路径 / QQ 号 / 高熵串等）、命中后怎么判读，以及为什么「忘了就 push」是不可逆的 | ✅ **对外发布或 fork 前必读** |

---

## 想找什么 → 去哪看

| 我想…… | 看这个 |
| --- | --- |
| 从零把它跑起来（Windows） | [guides/WINDOWS.md](guides/WINDOWS.md)（脚本见 [../windows/README.md](../windows/README.md)） |
| 从零把它跑起来（macOS） | [guides/MACOS_NAPCAT.md](guides/MACOS_NAPCAT.md) |
| 在新设备上把 qq-bridge 接进 DSH | [guides/DSH_SETUP.md](guides/DSH_SETUP.md) |
| 让 AI 会发语音 / 换成我自己的音色 | [guides/VOICE.md](guides/VOICE.md) |
| 放自己的语音素材 | [../audio/README.md](../audio/README.md) |
| 看 AI 烧了多少钱 / 计价口径 | [guides/TOKEN_USAGE_CONSOLE.md](guides/TOKEN_USAGE_CONSOLE.md) |
| 改控制台界面并做离线回归 | [guides/CONSOLE-UI-TESTING.md](guides/CONSOLE-UI-TESTING.md) |
| 升级 DSH 前先知道有哪些坑 | [guides/DSH_020_ADAPTATION.md](guides/DSH_020_ADAPTATION.md) |
| 动安全相关代码 / 做发布前检查 | [guides/SECURITY_BASELINE.md](guides/SECURITY_BASELINE.md) |
| 发布前扫一遍有没有泄漏个人信息 | [guides/PRIVACY.md](guides/PRIVACY.md) |
| 知道某个目录/脚本是干什么的 | [FOLDER_MAP.md](FOLDER_MAP.md) |
| 权限边界与安全承诺 | [../RULES.md](../RULES.md) |
| 改人格（人设 / 说话风格） | [../roles/README.md](../roles/README.md) |

---

## 本目录里没有的东西（别再找了）

本仓库是**发布用副本**，只带「跑起来需要的东西」。以下内容属于作者本机的开发/审计过程产物，
**不随仓库发布**，因此本索引里也不再列出它们：

- `docs/design/`（设计与规划）、`docs/research/`（调研记录）、`docs/audits/`（审查与体检报告）、
  `docs/legacy/`（历史归档）——这些目录在本仓库中不存在。
- `docs/guides/PROJECT_GUIDE.md`（一份 100 KB+ 的内部项目说明书）。
- token 成本实测档案、本地模型选型笔记等含个人用量/硬件数据的文档。

设计意图已经**收敛进上面这几篇**：要理解「为什么这么写」看 `SECURITY_BASELINE.md` 与
`DSH_020_ADAPTATION.md`；要理解「当前怎么跑」看根目录 `README.md`。

> 约定：**根目录只留 `README.md` / `README.en.md` / `RULES.md` 三个文档**，其余一律进 `docs/`，
> 并在本索引里登记一行（含「仍然有效 / 已被取代」）。新增文档请放 `docs/guides/`。
