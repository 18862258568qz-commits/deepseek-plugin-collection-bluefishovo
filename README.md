# QQ ↔ DeepSeek Harness 桥接

**English**: [README.en.md](README.en.md) | **中文**: [README.md](README.md)

> 🗂️ 文档索引（全部文档一句话说明 + 是否仍然有效）见 **[docs/README.md](docs/README.md)**；仓库目录/脚本命名约定见 **[docs/FOLDER_MAP.md](docs/FOLDER_MAP.md)**。
>
> 🔒 QQ 会话的权限边界与安全承诺见 **[RULES.md](RULES.md)**。
>
> 🎤 语音能力**仓库内自带**，不需要额外的外部工具：预制语音库（放音频即可）+ 动态合成（edge-tts，需自备 Python 包）
> + 本地专属音色（可选，自备 GPT-SoVITS）。用法与全部字段见 **[docs/guides/VOICE.md](docs/guides/VOICE.md)**；
> 放音频的规则见 **[audio/README.md](audio/README.md)**。
>
> 🧩 **两个平台版本，同一套内核**（preset / 人格卡 / 控制台 / 语音工具完全共用，只有网关与语音引擎的装法不同）：
>
> | | Windows 版 | macOS 版 |
> | --- | --- | --- |
> | QQ 网关 | **SnowLuma**（官方 Windows 版） | **NapCat**（SnowLuma 没有 macOS 版） |
> | 语音引擎（可选） | **NVIDIA → CUDA**；AMD / 无独显 → CPU 兜底 | 本地 GPT-SoVITS（CPU / Apple Silicon） |
> | 一键启动 | `windows\start-all-windows.bat` | `./start-all-mac.command` |
> | DSH 桌面版随机端口 | `node scripts\start-windows.mjs` | `node scripts/start-mac.mjs` |
> | 完整文档 | **[docs/guides/WINDOWS.md](docs/guides/WINDOWS.md)**（脚本清单见 [windows/README.md](windows/README.md)） | **[docs/guides/MACOS_NAPCAT.md](docs/guides/MACOS_NAPCAT.md)** |
>
> 语音可选：不装本地引擎时自动回退 **edge-tts**（联网即可，零显卡要求）。

把 QQ 消息接入 DSH agent：QQ 好友/群发来的消息会变成 DSH 会话里的用户消息，agent 的回复（含提问、工具审批）会发回 QQ。

> ⚠️ **当前版本 `v0.2.0-r4`，适配 DSH 0.2.0-rc.2**（在该版本上逐项实测：`npm run verify:adaptation`）。
> 鉴权用 `~/.dsh` 里持久化的浏览器会话签名密钥**离线铸造 Cookie** —— DSH 0.1.7 起进程启动 token
> 只存在于内存、不再落盘，旧版「从 guard 日志里读 token」的方式已失效。agent preset 是 DSH 0.1.7 起的
> `@deepseek-ai/dsh-agent-preset` Cordis 行（`~/.dsh/.agent-presets/` 目录机制已废）。协议代次
> （Cookie 鉴权 / 斜杠 RPC / `/api/remote.mux` 事件流）自 DSH `0.1.2-alpha.1` 起引入，与更早的点号
> endpoint 协议不兼容 —— **DSH `0.1.1-rc.2` 及更早**请改用 tag
> [`v0.1.0`](https://github.com/Derpyu520/qq-bridge/releases/tag/v0.1.0)；**DSH 0.1.5-rc.1** 用
> [`v0.1.5`](https://github.com/Derpyu520/qq-bridge/releases/tag/v0.1.5)；**DSH 0.1.7-rc.2** 用
> [`v0.1.7`](https://github.com/Derpyu520/qq-bridge/releases/tag/v0.1.7)。
>
> v0.2.0 修的主要是**会话待处理队列读不出来**：桥接退役/重置 QQ 会话时要先清掉 DSH 侧没跑的队列，
> 而那段解析认的是一个**从来不存在的字段**（`session/control` baseline 的 `value.queues[<id>]`）——
> 于是**每一次**退役都抛 `invalid session/control baseline`，队列清不掉、旧任务继续在 DSH 里跑，
> 而日志里只有一行警告。**注意：这不是 0.2.0 引入的**——该代码随 v0.1.7 发布，报错日志早于
> 0.2.0-rc.2 的发布，0.2.0 只是把它翻了出来。现在读队列以一元 RPC `session/projections` 为主路径、
> 以 `projections[<id>].values.inbox` 为回退形状，并补了两条回归网。
> 同一轮还按 0.2.0 的真实工具清单重新对账了 QQ 安全守卫（新增 15 个必须隐藏的工具名，
> 含全局层默认启用的 `read_mcp_resource`、`plugin_manager`、`subagent_codex` 等）。
>
> 逐条改动说明见 [docs/guides/DSH_020_ADAPTATION.md](docs/guides/DSH_020_ADAPTATION.md)。
>
> **r4 主要改动**：QQ 表情包/动图链路（表情 CDN 优先、`emoji_id` 兜底、DNS 多地址故障切换）、
> 联网搜索改用与 DSH 同源的 DeepSeek 搜索（Bing 仅兜底）、`qq_wait_for_messages` 改 5 分钟长轮询、
> 控制台切模式被 5 秒轮询改回去、回合永久「繁忙」、机器人身份未注入等 issue 修复，外加一轮整体体检。
> 逐条见 [**Release v0.2.0-r4**](https://github.com/Derpyu520/qq-bridge/releases/tag/v0.2.0-r4)。
>
> 默认分支 `main` **就是**本版本，`git clone` 直接拿到，无需切换分支。

```
QQ 消息 ──► QQ 网关（OneBot v11 WS）──► 本桥接进程 ──► DSH Web API (127.0.0.1:3080/api)
                                                ▲                      │
                                                └── agent 回复/提问/审批 ┘
```

> 网关二选一：**Windows/Linux 用 SnowLuma**（下文以此为主），**macOS 用 NapCat**（SnowLuma 没有 macOS 版）。
> 对桥接来说两者是同一个 OneBot v11 契约，只有端点自愈、部分专有能力与 DSH 形态不同 ——
> 差异与 macOS 全流程见 [docs/guides/MACOS_NAPCAT.md](docs/guides/MACOS_NAPCAT.md)。

## 项目展示

📽️ [AI 仿真群友 - 项目介绍视频](https://github.com/Derpyu520/qq-bridge/releases/download/v0.1.5/project-intro.mp4)（约 11 MB）

> 视频改由 **Release 附件**托管，不在仓库里——只想安装桥接的人不必再下载这 11 MB（它此前占整个仓库体积的 88%）。

## 架构

- **QQ 侧**：`@snowluma/sdk` 的 `SnowLumaWebSocketClient`（OneBot v11 WebSocket 客户端，自动重连）
- **DSH 侧**：适配 DSH 0.1.2 起引入、**0.2.0-rc.2 上逐项复核**的协议——用本机持久化签名密钥铸造会话 Cookie 鉴权、`/api/<namespace>/<method>` 斜杠 RPC、`/api/remote.mux` + `session/follow` 事件流（`session/control` 的队列读 `value.projections[<id>].values.inbox`，另有一元 `session/projections` 主路径）；复用 `AbstractApiClient` 传输层但不再依赖旧版 zod value schema。会话模型由桥接按 `config.json` 的 `dsh.model` 逐会话 `session.selectModel` 固定（默认 `deepseek-flash` = DeepSeek-V41-Flash，多模态）
- **agent 自主收发 QQ**：DSH 的 MCP 客户端（`~/.dsh/profiles/web/cordis.patch.yml` 配置）接入三个 MCP server：
  - `snowluma`（桥接自带 `src/mcp-snowluma-safe.js`）：QQ 动作**安全子集**（查状态/查群/查消息/发消息，发送强制白名单；发送工具支持可选 `replyToMessageId` 引用回复）
  - `snowluma-host`（桥接自带 `src/mcp-host-server.js`）：**只有** `snowluma_status`（只读探活 `get_login_info`）。
    ⚠️ **v0.1.5 起移除了 `start_snowluma` / `stop_snowluma`**（以及 `snowluma.allowProcessControl` 配置项）——
    原因是 **SnowLuma EULA §5.4** 规定「将其并入第三方安装包或 Docker 镜像、**通过自动化脚本部署**」
    须事先取得书面授权，而原生组件属专有组件。本程序**只探测、不部署**：SnowLuma 的安装、启动与扫码
    始终由你自己完成（详见 [LICENSE](LICENSE) 与 [RULES.md](RULES.md)）。
  - `web-search-safe`（桥接自带 `src/mcp-web-search-safe.js`）：只读 `web_search` / `web_fetch`（带 SSRF 防护），供 agent 查网络用语/资料。
    **搜索优先复用 DSH 原本的联网搜索**（同一个 DeepSeek Anthropic 兼容端点 + `web_search` 服务端工具，凭据按 `config.webSearch.apiKey` → 环境变量 `DEEPSEEK_API_KEY` → DSH 的 `.credentials.yaml` 顺序解析），
    因而结果质量与 DSH 内的搜索一致、且**不再默认把群聊关键词发给 Bing**（Bing RSS 只在 DeepSeek 不可用时兜底）。
    抓取仍由桥接自己做 SSRF 校验并限制正文大小；**黑话学习默认开启**，会把群聊里提取的词条交给所选的搜索后端。
    数据出机清单见 [LICENSE](LICENSE) 的「数据出机清单」，不需要就关掉黑话自动研究（`slang.autoResearch`）或把 `webSearch.provider` 设为 `bing`。
- **会话模型**：每个 QQ 会话（私聊/群）对应一个独立的 DSH 会话，统一归组到「QQ 聊天」工作区（不再散落未分组）；映射持久化在 `state/sessions.json`
- **性格定制**：QQ 会话默认使用 `qq-chat` agent preset，`reserved2` 使用 `qq-chat-v2`。DSH 0.1.7 起 preset 不再是 `~/.dsh/.agent-presets/<名>/` 目录，而是 `plugins/qq-agent-presets/` bundle 生成并插入 profile 的一条 `@deepseek-ai/dsh-agent-preset` 行（重启 DSH 后生效）；人格与默认 DSH 一致（coding agent），仅附加 QQ 场景规则；**角色扮演**是可选机制——由控制台或管理端设置 `state/current-role.json` 注入（群友无法更改）
- **本地控制台**：桥接自带 Web 控制台 `http://127.0.0.1:3100`——左侧按操作任务分为「运行总览 / 会话与审批 / 人格与角色 / 二代仿真 / 一代仿真 / 黑话词库 / 令牌与花费 / 访问与安全 / 调试与运维 / 工具参考」十个页面，右上角搜索框可跨页定位任意功能项；支持**浅色 / 深色双主题**（顶栏一键切换，未选择时跟随系统）；切换运行模式（chat / closed-agent / reserved / reserved2）、设置角色、静默开关、查看活动日志、修改管理员/控制台令牌，全部即时生效；访问需要令牌（`config.json` 的 `consoleToken`，未配置时自动生成并打印在启动日志；控制台内可手动修改或重新生成）
  - **令牌与花费看板**：实时显示 AI 的 token 消耗与折算金额（元），可下钻到**每个群 / 每个好友 / 每一轮对话**（轮次、步数、缓存命中/未命中输入、输出、命中率、花费、峰谷时段），并有**按时间的消耗走势图**（24 小时 / 3 天 / 7 天 / 30 天，柱子按高峰/空闲着色，一眼看出什么时候烧得凶、哪几个小时是 2 倍价）。累计总量取自 DSH 的 `tokenUsage` 投影（精确，含桥接启动前的历史），逐轮明细由 `assistant/message` 的 `usage` 折叠而来；金额按 DeepSeek 官方价目表折算并区分**高峰 / 空闲时段**（高峰单价为空闲的 2 倍，已内置中国法定节假日）。详见 [docs/guides/TOKEN_USAGE_CONSOLE.md](docs/guides/TOKEN_USAGE_CONSOLE.md)
  - **人格（角色扮演）管理**：列表点选即可载入查看/编辑提示词，支持新建、保存修改、改名（自动重命名文件）、另存为副本、删除；超过注入上限或含一代专用指令会实时提示
  - **两层提示词可分别查看与修改**：「仿真提示词」（预设内置，管行为与协议，保存后同步到 DSH，需重启生效）与「人格提示词」（`roles/*.md`，管人设与语气，保存即生效）；仿真层保存前做安全不变量校验与自动备份，可一键还原
  - **会话初始提示词**（二代仿真）：「二代仿真 → 初始提示词」里可以给某个群/私聊预写一段环境说明（圈子主题、群内氛围、常见话题、忌讳），AI **只在该会话第一次唤醒时收到一次**（之后已在会话上下文里，不再重复注入）。可在群还没说过话时提前写；AI 既读不到也改不了这份设置（仅控制台接口）。会话被重置（「会话映射」里的重置或「重置二代状态」）后，下一次首次唤醒会重新带上它。字数上限见 `socialV2.initialPromptMaxChars`
  - **DSH 思考强度**：默认 `max`，可选 `high` / `low`，档位从 DSH 实际公布的能力读取，保存后下一条消息生效；控制台会明示该设置同时写入 DSH 全局默认（`~/.dsh/settings.yaml`）
- **运行模式**：
  - `chat`：白名单群 + 白名单私聊 → qq-chat 安全聊天
  - `closed-agent`：仅私聊 owner（config.json 的 ownerQQ，可在控制台设置）→ 完整工具（默认用 DSH 自己声明的默认 preset，即 `standard`；可在控制台「closed-agent preset」下拉改为任意 DSH preset），可在 QQ 上操控 DSH
  - `reserved`（一代仿真）：仿真群友，观望/活跃/试探/退场状态机，选择性参与、按空格分句发送、主动收尾
  - `reserved2`（二代仿真，运行 `setup-dsh.mjs` 后 DSH 默认）：文本不自动转发，AI 通过 `qq_get_unread_messages` / `qq_send_message` 等工具自主看消息、发言、等待、设置唤醒/潜水；DSH 端使用 `qq-chat-v2` preset
- **交互增强**：
  - agent 通过 `ask_user_question` 提问时，问题会转发到 QQ，回复即自动应答
  - agent 请求工具审批时，转发到 QQ，回复「通过」/「拒绝」即可决策
  - 支持 DSH 斜杠命令（如 `/model`）与 `/reset`（重置会话上下文）
  - 群聊引用/回复会解析成「被引用人 + 原文」注入 DSH（如 `[引用 Derp：El Psy Kongroo是啥]机关的走狗`），让 AI 判断这句话是对谁说的，不会把群友之间引用第三方的对话误当成指向自己；引用机器人自己时会被视为必回
  - **图片/表情（含动图 GIF）**：表情包优先走 QQ 的 CDN 直链，`get_image` 失败时用 `emoji_id` 推出 CDN 地址兜底；媒体元数据保留 `emoji_id`/`summary`/`sub_type` 等字段。下载走同一套 SSRF 防护传输，并修掉了「DNS 先返回 IPv6、本机没有 IPv6 出口 → 每次白等 20 秒」的根因（改为 **IPv4 优先 + 逐地址故障切换**），动图表情不再时好时坏。单条消息上限默认 8MB / 64MP / 5 张（`socialV2.media`）
  - MCP 发送工具支持可选 `replyToMessageId`，并新增专用 `qq_reply` 工具：AI 可以先用 `qq_get_group_history` 拿到真实消息 id，再引用/回复某条消息（是否允许 AI 主动使用由人格/策略决定；桥接会检测发送类工具调用并自动跳过该回合的重复自动转发）
  - 一代仿真模式（`reserved`）下，AI 可以只输出 `[SILENT]` 表示“潜水/不接话”，桥接会静默不发送
  - 一代仿真模式（`reserved`）按空格分句：AI 用空格表示拆成多条消息；中英文/数字之间的空格也会被当成分条信号，不想分条就不要加空格（`reserved2` 不适用，分条请用 `qq_send_message` 数组）

## 本仓库包含什么 / 不包含什么

先说清楚边界，免得你 clone 下来才发现缺东西（或者担心把不该公开的东西带出去）。

### ✅ 包含：功能与设定（clone 下来就有）

| 内容 | 位置 | 说明 |
| --- | --- | --- |
| 桥接内核 + 三个 MCP server | `src/` | OneBot ↔ DSH 双向通道；QQ 工具面是**安全子集**，发送强制白名单 |
| 两代 agent preset | `dsh/agent-presets/`（权威源）→ `plugins/qq-agent-presets/presets/`（生成的 patch） | `qq-chat`（安全聊天/一代仿真）、`qq-chat-v2`（二代仿真，AI 用工具自主收发） |
| 人格卡 | `roles/*.md` | 人设与说话风格（`小鲸鱼` / `傲娇助手` / `朋友们` 三个示例 + 写法说明） |
| 本地控制台 | `public/console.html`（跑在 `127.0.0.1:3100`） | 十个页面：运行总览 / 会话与审批 / 人格与角色 / 二代仿真 / 一代仿真 / 黑话词库 / 令牌与花费 / 访问与安全 / 调试与运维 / 工具参考 |
| DSH 插件 | `plugins/qq-mode-console`、`plugins/qq-agent-presets` | 注册 `qq-mode` 设置命名空间；生成 preset 行与工具守卫 |
| 语音链路 | `src/voice-core.js`、`src/send-voice-lib.js`、`scripts/sing.py` | 三条链路全在仓库内，见 [docs/guides/VOICE.md](docs/guides/VOICE.md) |
| 安装 / 运维 / 测试脚本 | `scripts/` | 含 `setup-dsh.mjs`、`start-mac.mjs`、完整离线回归、探针 |
| 脱敏配置模板 | `config.example.json` | 字段齐全、值全是占位符 |

**AI 能做什么**（工具按 `socialV2.tools.*` 逐个开关，默认只开安全项）：

- **聊天与群管理**：读群/私聊历史、读未读、引用回复、分条发送、按需潜水（`qq_wait_for_messages` / `qq_mark_read` / `qq_set_wake_config`）
- **多媒体**：看图/表情/动图、发表情包、收藏表情、发语音、唱歌、画图（`qq_get_message_images` / `qq_send_sticker` / `qq_send_voice` / `qq_say_voice` / `qq_sing_song` / `qq_draw`）
- **记忆与黑话**：话题/待办/群友印象的轻量记忆、群聊黑话学习（`qq_memory_*` / `qq_slang_*`）
- **QQ 空间**：看动态/评论/留言板、点赞、评论、留言（`qq_qzone_*`）
- **账号装扮（仅主人私聊）**：改昵称签名、换头像、发/删说说、改在线状态、改群名片、给好友点赞（`qq_set_profile` / `qq_set_avatar` / `qq_publish_qzone` / `qq_set_online_status` …）
- **好友管理（仅主人私聊）**：看待处理申请、同意/拒绝、自动同意白名单、主动邀请（`qq_friend_requests` / `qq_handle_friend_request` / `qq_friend_autoapprove` / `qq_invite_friend`）

> 「仅主人私聊」的工具在群里、或别人私聊时调用会被**直接拒绝**，不是靠提示词约束，是代码硬校验。

### ❌ 不包含：个人数据与凭据（永远不会出现在仓库里）

| 不包含 | 为什么 | 你自己怎么放 |
| --- | --- | --- |
| 聊天记录、会话映射、日志 | 属于你的隐私 | 运行时生成在 `state/`，`.gitignore` 排除 |
| `config.json` | 里面是你的 QQ 号、群号、令牌 | 从 `config.example.json` 复制后自己填 |
| `audio/` 里的个人音频 | 你的声音/家人朋友的声音、体积大 | 自己放进去（默认不入库），见 [audio/README.md](audio/README.md) |
| 任何 API key / 令牌 | 泄漏即失效且有账单风险 | **环境变量**或 `~/.dsh/.credentials.yaml`（见下） |
| 作者本机的开发/审计文档 | 含真实路径、用量数据、内部规划 | 不在本仓库，见 [docs/README.md](docs/README.md) 末尾 |
| DSH / SnowLuma / NapCat / QQ 本体 | 第三方软件，各有自己的许可 | 你自己安装；本项目**只对接、不打包、不部署** |

### 凭据放哪里（推荐顺序）

1. **环境变量**（最省事，不进任何文件）：
   ```bash
   export DEEPSEEK_API_KEY=sk-...        # 联网搜索用（也可让桥接去读 DSH 的凭据）
   export FFMPEG_PATH=/opt/homebrew/bin/ffmpeg   # 可选
   ```
2. **`~/.dsh/.credentials.yaml`**：DSH 自己的凭据库。桥接会读它做两件事 ——
   用 `client-connection/browser-session` 的签名密钥**离线铸造** DSH 会话 Cookie（所以 `dsh.authToken` 通常留空），
   以及按 `webSearch.apiKeyEnv` 里配置的同名 ref 取搜索 key。**这个文件不在仓库里，也不该进仓库。**
3. **`config.json` 里直接写**：能用，但它是明文文件。仅在你确认这台机器只有你自己用时才这么做。

> ⚠️ 把 `config.json`、`state/`、`audio/` 提交上去，等于把你的 QQ 号、群号、聊天记录、声音一起公开。
> 仓库的 `.gitignore` 默认挡住它们；fork 后**别把这些行删掉**。发布前请跑一遍 `npm run privacy-scan`（见 [docs/guides/PRIVACY.md](docs/guides/PRIVACY.md)）。

## 前置条件

1. **Node.js ≥ 22.13**（`node -v` 确认；`package.json` 的 `engines` 会拦）
2. 运行中的 **DSH**（桌面版或 Web 版）。Web 版默认 `http://127.0.0.1:3080`；桌面版端口随机，
   macOS 用 `scripts/start-mac.mjs`、Windows 用 `scripts/start-windows.mjs` 探测并写回配置
3. 运行中的 **QQ 网关（二选一）**，且配好 OneBot WebSocket 与 HTTP API（默认 `ws://127.0.0.1:3001` / `http://127.0.0.1:3000`，`accessToken` 视配置填写）：
   - **SnowLuma**（Windows / Linux；原生组件挂进 QQ 进程）
   - **NapCat**（macOS 首选；改 QQ 加载入口注入 Shell）

## 给别人的安装清单（照着做就能跑起来）

> 这是「把仓库交给别人」时的最短路径。细节在下文对应章节。
> **平台不同，第 5~8 步的装法不同**：
> - **Windows**：SnowLuma + `windows\start-all-windows.bat`（完整步骤：[docs/guides/WINDOWS.md](docs/guides/WINDOWS.md)，先跑 `windows\check-env.ps1` 体检）
> - **macOS**：NapCat + `./start-all-mac.command`（完整步骤：[docs/guides/MACOS_NAPCAT.md](docs/guides/MACOS_NAPCAT.md)，GUI 授权没法用命令代替）

| # | 做什么 | 命令 / 说明 |
| --- | --- | --- |
| 1 | 确认 Node | `node -v` ≥ **22.13** |
| 2 | 装依赖 | `npm install`（`postinstall` 会自动修补 `@snowluma/sdk` 的 ESM bug） |
| 3 | 生成配置 | `cp config.example.json config.json`（Windows CMD：`copy config.example.json config.json`） |
| 4 | 填网关 + 白名单 | `snowluma.wsUrl` / `httpUrl` / `accessToken`；`ownerQQ`；`allow.private` / `allow.groups` |
| 5 | **装 DSH 端**（最容易漏） | `node scripts/setup-dsh.mjs` ← **默认 `web` profile；DSH 桌面版必须传 `desktop`**：`node scripts/setup-dsh.mjs desktop` |
| 6 | **重启 DSH** | preset 与 MCP 只在 DSH 启动时加载；不重启则 QQ 上毫无反应 |
| 7 | 启 QQ 网关 | **Windows**：SnowLuma 双击 `launcher.bat` → WebUI 扫码；**macOS**：NapCat（`/Applications/QQ.app/Contents/MacOS/QQ --no-sandbox`） |
| 8 | 启桥接 | **Windows**：`windows\start-all-windows.bat`（一键）或 `npm start`；DSH 桌面版用 `node scripts\start-windows.mjs`。**macOS**：`./start-all-mac.command`；DSH 桌面版用 `node scripts/start-mac.mjs` |
| 9 | 打开控制台 | <http://127.0.0.1:3100>，令牌见 `state/console-token`（首次启动自动生成）；「访问与安全」页填 `ownerQQ` 与白名单 |
| 10 | 端到端验证 | 用你的 QQ 私聊机器人发「你好」，几秒内应有回复；不通过就看「排查顺序」 |

**两条必须知道的行为（否则一定踩坑）**：

- **白名单是 fail-closed**：`allow.private` / `allow.groups` 为空 + `allowAllWhenEmpty: false`（模板默认）
  ⇒ 桥接**不响应任何消息**。这不是坏了，是刻意设计。请在控制台或 `config.json` 里填自己的 QQ 号/群号。
- **没装 DSH 端 = 没反应**：第 5 步跳过时桥接不会崩，但群聊/仿真会话会因为「拿不到 `qq-chat` preset」而
  **被拒绝建会话**（日志里 `⛔ 群聊/仿真会话缺少 preset …`）。这是有意的 fail-closed：绝不让 QQ 会话
  回退到带 bash/文件工具的默认 preset。

## 安装与配置

```bash
npm install        # 安装依赖（postinstall 会自动修补 @snowluma/sdk 的 ESM 打包 bug）
```

复制 `config.example.json` 为 `config.json` 后编辑：

> Windows CMD 用户请用：`copy config.example.json config.json`

> ⚠️ 真实 `config.json` 与 `state/` 不会进入公开仓库，仓库只提供脱敏的 `config.example.json` 模板。

| 字段 | 说明 |
| --- | --- |
| `dsh.baseUrl` | DSH Web 地址，默认 `http://127.0.0.1:3080` |
| `dsh.provider` / `dsh.model` / `dsh.reasoningEffort` | DSH 会话使用的模型/推理强度；若你的 DSH 没有示例中的模型，改成 DSH 设置页里可用的模型即可（选择失败只打日志，不阻塞启动） |
| `dsh.authToken` | DSH launch token（进程启动凭据）。**通常应留空**：留空时桥接用 `~/.dsh/.credentials.yaml` 里持久化的签名密钥**离线铸造**会话 Cookie，不依赖任何进程期状态（DSH 0.1.7 起启动 token 只存在于内存、日志里那条是上一个进程的陈旧值，换 Cookie 只会 401）。只有显式填了才会优先走 token 交换 |
| `dsh.authHeader` / `dsh.authPrefix` | 保留字段，当前新版 DSH 链路使用 Cookie 交换，不再直接发送该鉴权头 |
| `snowluma.wsUrl` | SnowLuma OneBot **WebSocket** 地址（如 `ws://127.0.0.1:3001`） |
| `snowluma.httpUrl` | OneBot **HTTP API** 地址（如 `http://127.0.0.1:3000`）；不要填 WebSocket 端口，否则会报 HTTP 426 |
| `snowluma.accessToken` | OneBot accessToken，未配置留空 |
| `snowluma.followDiscoveredEndpoint` | 默认 `true`。换 QQ 账号后 token 与端口都会变，桥接会自愈：重新发现并**跟随** SnowLuma 的端点（同时写回 `config.json`）。**想跑第二个实例 / 指向另一份 SnowLuma 安装（多账号、测试）时设为 `false`** —— 那时只自愈 token，绝不动 URL，也不写回 URL。详见「已知行为」 |
| `snowluma.silenceWarnMs` | 上游静默告警阈值（毫秒），默认 `600000`（10 分钟）。已连接但这么久没收到任何事件包（含心跳）时打警告；这只是**提示**，不确定性的判断交给 `good` |
| `snowluma.launcherPath` / `homeDir` | SnowLuma 安装目录（用于 token/端点自发现）。⚠️ 桥接**不会**启动或停止 SnowLuma（见 `LICENSE`） |
| `agentPreset` | QQ 会话使用的 DSH agent preset，默认 `qq-chat`（改性格见下文） |
| `socialV2.agentPreset` | `reserved2` 模式使用的 DSH agent preset，默认 `qq-chat-v2` |
| `socialV2.initialPromptMaxChars` | 会话「初始提示词」（控制台为某个群/私聊预写的环境说明）的字数上限，默认 2000，允许 100~8000。越界值会在启动时收敛并保持原文件不动 |
| `socialV2.media` | 图片/表情的上限：`maxBytes`（单条消息总字节，默认 8MB）、`maxPixels`（单张像素，默认 64MP）、`maxCount`（单条最多处理几张，默认 5）。越界值启动时收敛 |
| `webSearch.provider` | 联网搜索后端：`auto`（默认，优先 DeepSeek、失败回退 Bing）/ `deepseek`（仅 DeepSeek，无凭据时报错）/ `bing` |
| `webSearch.apiKeyEnv` / `apiKey` | 搜索凭据的环境变量名（默认 `DEEPSEEK_API_KEY`）/ 直接写死 key（不推荐）。都不设置时读 DSH 的 `$DSH_HOME/.credentials.yaml` 里同名 ref |
| `webSearch.baseURL` / `model` / `maxUses` / `maxResults` | 搜索端点（默认 `https://api.deepseek.com/anthropic/v1`，必须 https 且解析到公网）、模型（默认 `deepseek-v4-flash`）、单次搜索最多用几次工具、返回条数上限 |
| `workspaceTitle` | QQ 会话在 DSH 界面中的归组名称，默认「QQ 聊天」 |
| `allow.private` / `allow.groups` | 白名单（QQ 号/群号数组）；留空且 `allowAllWhenEmpty: true` 时放行全部 |
| `deny.*` | 黑名单，优先于白名单 |
| `ackMessage` | 消息投递后的立即回复，空字符串关闭 |
| `sendDelayMs` | QQ 连续发送间隔，防止触发频率限制 |
| `consolePort` | 本地控制台端口，默认 `3100` |
| `consoleToken` | 控制台访问令牌；留空时启动自动生成并保存到 `state/console-token` |

> ⚠️ `allowAllWhenEmpty: true` 表示「白名单没填就全部放行」——把 agent 接入 QQ 等于把账号控制权交给了模型，建议先填白名单。

### DSH 端安装（必做：装 preset + 挂 MCP）

桥接和控制台能跑起来还不够，DSH 端还需要安装两个聊天 preset（`qq-chat` / `qq-chat-v2`）并挂载 MCP。**单机新装同样必须执行这一步**（不是只有「另一台设备」才需要），装完还要**重启 DSH**：

```bash
node scripts/setup-dsh.mjs              # 默认装进 web profile（DSH Web 版）
node scripts/setup-dsh.mjs desktop      # DSH 桌面版：profile 是 desktop，必须显式传
```

> `setup-dsh.mjs` 的第一个参数就是 **profile 名**（`~/.dsh/profiles/<profile>/`）。DSH **桌面版用的是 `desktop`**，
> 不传就会装进 `web`，表现是「脚本说成功了，但 DSH 里看不到 preset / MCP 工具」。
> 也可用 `DSH_HOME=/path/to/.dsh node scripts/setup-dsh.mjs <profile>` 指定 DSH 根目录。

> 全新环境下脚本会把 DSH 默认模式设为 **`reserved2`（二代仿真）**，并创建本地 `state/mode.json` 兜底；这样 AI 使用 `qq_send_message` 等工具收发消息时，DSH 会自动使用 `qq-chat-v2` 模式。如果本机已存在旧的 `state/mode.json` 或 DSH 设置值，脚本会保留不覆盖。之后可在**桥接控制台**（默认 `http://127.0.0.1:3100`）顶部按钮切换模式，控制台会同时写入 DSH 设置与本地兜底文件。

详细步骤见 **[docs/guides/DSH_SETUP.md](docs/guides/DSH_SETUP.md)**。

## 完整启动流程（Windows + SnowLuma，从零开始）

> 🍎 **macOS 请改看 [docs/guides/MACOS_NAPCAT.md](docs/guides/MACOS_NAPCAT.md)** —— 网关换成 NapCat、
> DSH 端 profile 要传 `desktop`、启动要走 `scripts/start-mac.mjs`（桌面版端口随机）。

共 6 步。DSH 已安装并运行，缺的是 SnowLuma 本体 + 桥接侧的 DSH 端安装（**第 2、3 步最容易漏，漏了 QQ 上会毫无反应**）：

1. **DSH**（已运行，无需操作）
   确认 `http://127.0.0.1:3080` 能打开即可。

2. **装桥接并复制配置**
   ```bash
   git clone <你的仓库地址>
   cd qq-bridge
   npm install
   ```
   Windows CMD 用 `copy config.example.json config.json`，其他平台用 `cp config.example.json config.json`。
   **示例模板里 `allow.private` / `allow.groups` 是空数组**——空白名单 + `allowAllWhenEmpty: false` 时桥接不响应任何消息（这是刻意的 fail-closed 默认值）。白名单在第 5 步填。

3. **装 DSH 端（preset + MCP），然后重启 DSH**
   ```bash
   node scripts/setup-dsh.mjs
   ```
   装完**必须重启 DSH**——preset 与 MCP 只在 DSH 启动时加载。
   跳过这步桥接不会崩，但群聊会话拿不到 `qq-chat` preset，桥接会**拒绝建会话**（有意的安全设计：绝不回退到带 bash/文件工具的默认 preset），表现同样是 QQ 上没反应。

4. **下载并解压 SnowLuma**
   - 下载：<https://github.com/SnowLuma/SnowLuma/releases/latest> 选 `SnowLuma-v<版本>-win-x64.zip`（完整版，自带 Node 运行时；Lite 版需本机 Node 22.13+）
   - 解压到任意目录（例如 `C:\SnowLuma`），双击 `launcher.bat`

5. **首次引导（WebUI）+ 填写桥接配置**
   - 打开启动日志里的 WebUI 地址（README 写的是 `http://localhost:5099`，以你启动日志里实际打印的为准）
   - 用**启动日志中的初始密码**登录，按引导：同意条款 → 设置密码 → 接入 QQ 进程（扫码登录）
   - 在 WebUI 里配置 OneBot 连接：开启 **WebSocket 服务端** 和 **HTTP API**，分别记下**端口**（默认 WS `3001`、HTTP `3000`）和 **accessToken**（若配置了）
   - 回到 `config.json` 填好 `snowluma` 段，并把 `allow.private` / `allow.groups` 换成**你自己的 QQ 号 / 群号**：

     ```json
     "snowluma": {
       "wsUrl": "ws://127.0.0.1:3001",
       "httpUrl": "http://127.0.0.1:3000",
       "accessToken": "你在 WebUI 里配置的 token（没配置就留空）"
     }
     ```

   `wsUrl` 是 OneBot **WebSocket** 端口，`httpUrl` 是 OneBot **HTTP API** 端口（不要填成同一个 WS 端口，否则 MCP 工具会报 HTTP 426）。

6. **启动桥接**
   ```bash
   npm start          # 前台运行（崩溃不自动重启）
   ```
   看到 `SnowLuma 已连接` 即成功；然后 QQ 上给机器人账号发条消息测试。
   Windows 想要「崩溃自动重启」请改用 `start.bat`（见下节）。
   > 这条日志是历史文案：它表示「OneBot 网关已连接」，接 NapCat 时也打这句。
   > **DSH 桌面版不要用 `npm start`**：桌面版端口每次启动都变，必须用 `node scripts/start-mac.mjs` 先探测端口并写回 `config.json`。

## 运行与运维

```bash
npm start          # 或双击 start.bat（守护模式：崩溃自动重启，关闭窗口即停止）
```

**⚠️ 重要**：
- **桥接只能运行一个实例**（有单实例锁，重复启动会被拒绝并提示"已有实例在运行"）
- **用 start.bat 启动**（守护模式），窗口别关——桥接崩溃会在 5 秒后自动拉起
- 桥接异常/消息无反应时：双击 `restart.bat`（自动杀旧实例 → 清理锁 → 重新启动守护）
- **重启 DSH 通常不需要动桥接**：每 5 秒探活，DSH 不可用期间收到的 QQ 消息在桥接进程内排队（最多 50 条/会话，满后丢最旧项），恢复后尝试补投。桥接进程退出会丢失内存队列；断线期间已经结束的回复暂不保证补发。
- 修改 `config.json` / `roles/` / `state/current-role.json` 后重启桥接生效；修改 `dsh/agent-presets/`（改完要跑 `node scripts/build-agent-preset-patches.mjs` 重新生成 bundle patch）或 MCP 配置后重启 DSH 生效

日志示例：

```
12:00:01 [bridge] SnowLuma 已连接：ws://127.0.0.1:3001
12:00:02 [bridge] 新会话 private:12345678 -> sess_xxxx
12:00:02 [bridge] 已投递 private:12345678: 你好
12:00:20 [bridge] agent 回复 (private:12345678) 42 字
```

## 自测（不需要 SnowLuma / QQ）

离线回归（使用临时目录和模拟服务，不读取真实配置、不发 QQ 消息）：

```bash
npm run test:audit
```

reserved2 的 token 开销优化、消息水位协议、升级及回退说明（该专项分析为本地文档，未随仓库发布。）专项离线回归可运行 `npm run test:token`，已包含在上面的完整回归中。

控制台「令牌与花费」看板的账本与价目表回归（峰谷分时、幂等折叠、基线合并、压缩与容错）：

```bash
npm run test:tokens        # 单元测试
npm run test:console-ui    # 离线浏览器回归（含看板渲染与逐轮下钻）
```

本轮审查与修复明细为本地审计文档，未随仓库发布。升级后会为没有权限元数据的历史映射重建一次 QQ 会话；模式或 preset 变化也会自动重建，避免保留旧权限。旧历史仍在 DSH 中。

验证 DSH 侧链路是否打通（会创建一个独立测试会话，不影响现有会话）：

```bash
npm run self-test
```

预期输出：连接成功 → 测试会话创建 → prompt 被接受 → 打印 agent 回复。

## 目录结构

```
qq-bridge/
  README.md / README.en.md / RULES.md   # 根目录只留这三个文档，其余全在 docs/
  LICENSE
  config.example.json   # 配置模板（脱敏占位符；真实 config.json 不入库）
  package.json
  docs/
    README.md           # 文档索引（每篇一句话 + 是否仍然有效）  ← 先看这个
    FOLDER_MAP.md       # 目录结构与 scripts/ 命名约定
    guides/             # 面向使用者/运维，共 8 篇：
                        #   DSH_SETUP.md            装到 DSH（preset + MCP）
                        #   MACOS_NAPCAT.md         macOS 全流程（NapCat + 桌面版端口）
                        #   VOICE.md                语音三条链路
                        #   TOKEN_USAGE_CONSOLE.md  令牌与花费看板
                        #   CONSOLE-UI-TESTING.md   控制台离线预览与回归
                        #   SECURITY_BASELINE.md    安全基线与威胁模型
                        #   DSH_020_ADAPTATION.md   DSH 0.2.0 适配改动记录
                        #   PRIVACY.md              发布前隐私扫描
  audio/                # 语音库：放你准备好的音频，可作 QQ 语音发出（规则见 audio/README.md）
  windows/              # ★ Windows 版：一键启动 / 语音引擎（NVIDIA CUDA、AMD 走 CPU）/ 环境体检
    README.md           #   Windows 入口（脚本清单 + 显卡怎么选）
    start-all-windows.bat   #   SnowLuma → 可选语音引擎 → 桥接守护
    start-gsv-nvidia.bat    #   GPT-SoVITS（device: cuda）
    start-gsv-amd.bat       #   GPT-SoVITS（CPU；AMD 无官方 Windows ROCm）
    check-env.ps1           #   只读环境体检（Node/Python/ffmpeg/显卡/端口/配置）
    gsv/                #   tts_infer_v2proplus_{cuda,cpu}.yaml 推理配置模板
  dsh/agent-presets/    # qq-chat / qq-chat-v2 的 preset 权威源（含工具守卫 qq-tool-restrict.mjs）
  plugins/
    qq-agent-presets/   # DSH bundle：生成两个 preset 行 + 携带工具守卫
    qq-mode-console/    # DSH 插件：注册 qq-mode 设置命名空间（仅 host 半，无 UI 卡片）
  public/console.html   # 本地控制台前端（127.0.0.1:3100）
  roles/                # 人格卡（人设提示词；写法见 roles/README.md）
  assets/               # 仓库配图（演示视频在 Release，不在仓库）
  src/
    bridge.js           # 主程序
    dsh-client.js       # Node 版 DSH API 客户端（WS 下行）
    mcp-snowluma-safe.js / mcp-host-server.js / mcp-web-search-safe.js   # 三个 MCP server
    voice-core.js / send-voice-lib.js   # 语音共享实现
    snowluma-conn.js    # OneBot 网关连接与端点发现
    md-to-plain.js      # Markdown → QQ 纯文本
    self-test.js        # DSH 侧自测
  scripts/              # 安装/测试/运维/探针（命名约定见 docs/FOLDER_MAP.md）
    setup-dsh.mjs           # 装 DSH 端（preset + MCP + bundle）
    start-mac.mjs           # macOS：探测 DSH 桌面版端口 → 启动
    start-windows.mjs       # Windows：netstat + tasklist 探测 DSH 桌面版端口 → 写回配置 → 启动
    patch-snowluma-sdk.mjs  # 修补 SDK 的 ESM 打包 bug（postinstall 自动执行）
  state/                # 运行时数据（不入库）
```

> 🎤 **语音能力全在仓库内**，不需要额外目录或外部工具：
> 预制语音库 = `audio/`；动态合成 = edge-tts（需自备 Python 包）；专属音色 = 可选的本地 GPT-SoVITS。
> 相关 MCP 工具：`qq_list_voices` / `qq_send_voice`（预制库）、`qq_say_voice`（现合成）、`qq_sing_song`（唱歌）。
> 完整说明见 **[docs/guides/VOICE.md](docs/guides/VOICE.md)**。
>
> 📌 仓库**不包含** `docs/design/` `docs/research/` `docs/audits/` `docs/legacy/` 与
> `docs/guides/PROJECT_GUIDE.md`（作者本机的开发/审计产物）。原因与替代阅读路径见
> [docs/README.md](docs/README.md) 末尾。
>
> 📌 曾经拆出去的那个独立「发语音」工具（`../voice-tool/`）**已从本仓库的 npm 脚本里移除**。
> 语音统一走：CLI `npm run send-voice`，或 MCP 工具 `qq_send_voice` / `qq_say_voice` / `qq_sing_song`
> （实现见 `src/voice-core.js`、`src/send-voice-lib.js`）。

## SnowLuma 版本与上游健康（「连上了但收不到消息」）

「注入」在这个技术栈里只发生在一处：**SnowLuma 用原生组件挂进 QQ 客户端进程**（它自己日志里叫
`[Hook]`，载体是安装目录的 `native/snowluma-win32-x64.{dll,node}`）。**本桥接没有任何原生/注入面**
（依赖全为纯 JS，源码里没有 `.dll` / `.node` / FFI / 进程注入），也不启动、不控制 SnowLuma 或 QQ ——
所以「QQ 注入失败」不可能是本桥接造成的。但**桥接过去无法把这个失败讲清楚**，于是它经常被误报成
「qq-bridge 的问题」。现在桥接会主动把上游健康报出来。

### 已知行为：连上了 ≠ 收得到

SnowLuma 的 `[Hook]` 会退化：它的进程和 OneBot WebSocket **都还活着**，但收不到 QQ 侧的数据。
它自己的日志长这样：

```
WARN [Hook] receive path stale: PID=… UIN=… silentFor=136193ms; reporting good=false
WARN [Hook] process enumeration timed out after 4000ms (worker abandoned)
```

这时桥接这边**一切正常**：WebSocket 通、日志打过 `SnowLuma 已连接`、控制台没有异常，但群里一条消息都不来。
桥接现在对此做两件事：

1. **主信号**：每 30 秒一次的 `meta_event/heartbeat` 载荷里的 `status.good`（SnowLuma 对「QQ → 原生 hook → 我」这条**接收链路**的自评，静默约 105 秒后翻 `false`）。心跳是 SnowLuma 自己的定时器无条件发的，所以这条信号免费且及时，且不需要较新的运行时。
   兜底：每 60 秒问一次 `get_status`（`{online, good}`）。加分项：`bot_status`（账号会话上下线，**SnowLuma 1.14.20 才真的有**）+「距最近一个事件包的时长」（只能证明进程/WS 还活着，**不能**证明收得到 QQ 数据 —— 心跳会一直来）。
   > ⚠️ **不要用 `get_login_info` 取 `good`**：它只返回 `{user_id, nickname}`，而 SDK 不校验 data 载荷 ⇒ 不会报错、`good` 永远是 `null`、这条判断变成永不触发的死代码。（本功能的第一版实现正是这么写错的，回归里已加反面断言钉住。）
2. 判定退化时：日志打**明确指向 SnowLuma `[Hook]`** 的警告、控制台「运行总览」出现 `SnowLuma 上游` 卡片、
   「访问与安全」页出现告警条，`GET /api/status` 的 `snowluma` 字段给出 `degraded` / `good` / `hint`。

排查顺序：控制台看 `SnowLuma 上游` 卡片 → 看 SnowLuma 的 `logs/snowluma-*.log` 里的 `[Hook]` 行 → 再考虑升级 SnowLuma（**升级不换原生组件，见下**）。

### 版本要求

| 组件 | 要求 | 说明 |
| --- | --- | --- |
| SnowLuma **运行时**（QQ 网关本体） | **1.14.20 已实测**（1.14.9 亦兼容） | **实测记录（2026-10-03，SnowLuma 1.14.20 + QQ 在线）**：包 SHA256 与官方发布摘要一致；心跳 `status.good=true`／`interval=30000`；桥接走完「首次 1006 → 自愈 WS token → 已连接」；收到群消息（`lastPacketKind: message/group`）；完整往返成功（唤醒 → DSH 建会话挂 `qq-chat-v2` → 工具发送 1/1 条 → 实际发出两条回复）。 ⚠️ **升级运行时不会更换注入用的原生组件**：实测 `native/snowluma-win32-x64.{dll,node}` 与 `websocket-win32-x64.node` 在 **1.14.9 与 1.14.20 之间逐字节完全相同**（三方对比：官方 1.14.9 包 == 本机安装 == 官方 1.14.20 包），变的只有 `index.mjs`（+414 KB）等 JS 层。所以**升级能带来 OneBot 事件流水线、收发与新区块链路上的修复（`bot_status`、markdown 带 text、事件种类订阅更全），但不会修「原生 hook 挂不上 QQ」这类问题** —— 那种要走 SnowLuma 自己的排查。**升级 SnowLuma 是使用者自己的事**：本桥接只探测、不部署（见 [LICENSE](LICENSE) 与 [RULES.md](RULES.md)） |
| `@snowluma/sdk` / `@snowluma/mcp`（本仓库依赖） | 已钉 `^1.14.20` | 客户端库；OneBot v11 是稳定契约，新库可连旧运行时（本项目实测：库 1.14.20 + 运行时 1.14.9 可正常收发） |
| `bot_status`（账号上下线） | **1.14.20 有；1.14.9 没有** | 逐一核对的只有这两个版本：`bot_status` 在 1.14.9 的 `index.mjs` 里出现 **0** 次、1.14.20 里 **3** 次（带 `sub_type`/`user_id`）。**具体从哪个版本引入未逐版核对**。桥接对老运行时**优雅降级**：订阅不到就只靠心跳 `good` 与 `get_status` |

### 已知行为：HTTP token 与 WS token 是**两个不同的值**

SnowLuma 同一个账号的 **HTTP token（默认 3000 端口）与 WebSocket token（默认 3001 端口）并不相同**
（实测；`snowluma.accessToken` 里通常只能存一个 —— 存的是 HTTP 那个）。因此：

- **桥接每次启动的首次 WS 连接几乎必然失败一次**（日志里 `SnowLuma 连接断开（code=1006）` →
  `SnowLuma 首次连接未成功（将在后台自动重连并尝试自愈 WS token）`），随后自愈重新发现 WS token、
  重连成功，才打出 `SnowLuma 已连接`。**这条序列是正常的，不是故障。**
- 真正会一直连不上的情况：**自愈无从下手** —— `snowluma.homeDir` 没配 / 被移动 / 读不到
  SnowLuma 的 `config/onebot_<QQ号>.json`，或权限不足。这时日志里会有 `token 自愈失败`，
  而 QQ 侧表现为**完全收不到消息**。先确认 `homeDir` 指向真正的 SnowLuma 安装目录。

### 已知行为：端点自愈会覆盖你写的 `wsUrl`

换 QQ 账号后 OneBot 端口与 token 都会变，所以桥接在连不上时会自愈：重新发现 SnowLuma 的端点并
**写回 `config.json`**。这在主场景下是对的，但它不区分「配置里是个过期值」和「你就是要指向别处」——
想跑第二个实例或指向另一份 SnowLuma 安装时会连错账号。要关掉：

```json
"snowluma": { "followDiscoveredEndpoint": false }
```

关掉后**只自愈 token**（换账号仍能恢复），绝不动 URL、也不写回 URL。

## 已知限制

- agent 回复在回合结束时一次性发送（不做流式逐字转发）；回复超过 `socialV2.send.maxMessageChars`（默认 500 字，可用 `social.maxReplyChars` 调整）自动按句读/URL 边界分段
- 图片及部分表情可以通过安全下载接入多模态模型；**视频**以及无法取得图片字节的消息仍使用占位文本
- **发**语音支持三条链路（预制语音库 / edge-tts 现合成 / 本地专属音色，见 [docs/guides/VOICE.md](docs/guides/VOICE.md)）；但**收**到的语音目前只显示占位文本，不做语音转写进上下文
- **AI 发语音默认关闭**（`socialV2.voice.enabled` 与 `socialV2.tools.sendVoice` 默认 `false`）：先把音频放进 `audio/`，再到控制台打开开关；你自己发语音不受这个开关影响
- **动态合成（`qq_say_voice`）需要联网**（edge-tts 走微软在线服务）且需要本机有装了 `edge_tts` 的 Python；完全离线请改用本地 GPT-SoVITS 音色
- **本地专属音色（GSV）是 CPU 推理**：冷启动首句约 20 秒、之后每句 6~12 秒，静置内存约 2.3 GB（不烧 LLM token）。想省心就让 `ttsBackend` 用 `auto`，引擎没起来时自动退回 edge-tts
- **macOS + NapCat 下语音库路径必须在 QQ 沙盒容器内**（网关只能读容器路径，桥接不做拷贝），见 [docs/guides/VOICE.md](docs/guides/VOICE.md) 第二节
- agent 的 Markdown 回复会转成纯文本（链接保留 `文字 (url)` 形式）
- `@snowluma/sdk` 的 npm 发布版存在 ESM 扩展名 bug，本仓库通过 postinstall 补丁修复（见 `scripts/patch-snowluma-sdk.mjs`）
- **画图（`qq_draw`）需要一个可用的图片生成端点**：`socialV2.draw.baseURL` + key（`apiKeyEnv` / `apiKeyFrom: "dsh-credentials"`）。`baseURL` 为空会**明确报错**，不会回退到任何公共/个人中转站；模板里的 `https://api.example.com/v1` 是占位符，必须换成你自己的
- 独立的「发语音」图形界面工具**不在本仓库**，且相关 npm 脚本已移除；语音统一走 `npm run send-voice` 或 MCP 工具 `qq_send_voice` / `qq_say_voice` / `qq_sing_song`

## 合规提醒

SnowLuma 是独立第三方项目，与腾讯/QQ 无隶属关系，仅供学习与技术研究；使用前请阅读其 EULA 与《QQ 用户协议》。

## 致谢与上游

本项目是 **[Derpyu520/qq-bridge](https://github.com/Derpyu520/qq-bridge)** 的二次开发（社区版），
遵循上游的 **MIT License**：仓库根目录的 [LICENSE](LICENSE) 保留原版权声明与许可条款，本仓库的修改同样以 MIT 发布。

- 上游仓库：<https://github.com/Derpyu520/qq-bridge>
- 版本溯源（本仓库基于上游 `v0.2.0-r4`，适配 DSH `0.2.0-rc.2`）：
  [v0.1.0](https://github.com/Derpyu520/qq-bridge/releases/tag/v0.1.0) ·
  [v0.1.5](https://github.com/Derpyu520/qq-bridge/releases/tag/v0.1.5) ·
  [v0.1.7](https://github.com/Derpyu520/qq-bridge/releases/tag/v0.1.7) ·
  [v0.2.0-r4](https://github.com/Derpyu520/qq-bridge/releases/tag/v0.2.0-r4)

**本仓库相对上游的主要改动**：

- **macOS / NapCat 接入**：SnowLuma 没有 macOS 版，改用 NapCat（OneBot v11）走通全流程，
  新增 `scripts/start-mac.mjs`（探测 DSH 桌面版随机端口）、`start-all-mac.command`、`start-gsv.command`，
  以及 [docs/guides/MACOS_NAPCAT.md](docs/guides/MACOS_NAPCAT.md)
- **语音三链路**：预制语音库 + edge-tts 动态合成 + 本地 GPT-SoVITS 专属音色（零样本克隆），
  含语音模式窗口、ffmpeg 音量/响度处理，见 [docs/guides/VOICE.md](docs/guides/VOICE.md)
- **QQ 社交能力扩展**：QQ 空间（动态/评论/留言板/点赞）、好友申请与自动同意、账号装扮
  （昵称签名/头像/说说/在线状态/群名片/点赞）、画图（`qq_draw`）
- **人格与设定**：人格卡体系（`roles/`）、「小鲸鱼」与「朋友们」设定、控制台人格/两层提示词编辑
- **社区版整理**：全部个人数据脱敏（路径 / QQ 号 / 群号 / 令牌）、`config.example.json` 占位符化、
  启动脚本参数化（`NAPCAT_QQ` / `GSV_DIR` 等环境变量）、文档重写与失效链接修复

> 上游的作者与贡献者承担了这个项目绝大部分设计与实现工作；本仓库只做增量适配与发布整理。
> 遇到与上游一致的问题，欢迎优先反馈给上游。
