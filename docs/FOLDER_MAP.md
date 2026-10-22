# 仓库目录地图（FOLDER_MAP）

> 一句话说明每个目录干什么、`scripts/` 里的命名约定是什么。**本文只描述现状**，不构成改动指令。
> 文档索引见 [README.md](README.md)；安装入口见 [../README.md](../README.md)。
>
> 最后核对：随本版本发布（v0.2.0-r4 系列）。新增目录/脚本时请顺手补一行。

---

## 一、顶层布局

```
qq-bridge/
├── README.md / README.en.md / RULES.md   ← 根目录只留这三个文档
├── LICENSE
├── package.json / package-lock.json
├── config.example.json   ← 配置模板（脱敏占位符；真实 config.json 不入库）
├── docs/                 ← 全部文档（见第三节）
├── dsh/                  ← 要装进 DSH 的东西（agent preset 的权威源）
├── plugins/              ← 两个 DSH 插件（bundle）
├── src/                  ← 桥接内核 + MCP server
├── public/               ← 控制台前端（console.html）
├── roles/                ← 人格卡（人设提示词）
├── audio/                ← 语音库（你的音频；默认不入库，只留 README）
├── assets/               ← 仓库配图
├── scripts/              ← 安装 / 测试 / 运维 / 探针脚本
└── state/                ← 运行时数据（不入库）
```

| 目录 / 文件 | 作用 | 能不能删/动 |
| --- | --- | --- |
| `src/` | **桥接内核**：主程序 `bridge.js`、Node 版 DSH 客户端 `dsh-client.js`、三个 MCP server（`mcp-snowluma-safe.js` / `mcp-host-server.js` / `mcp-web-search-safe.js`）、语音共享库 `voice-core.js` + `send-voice-lib.js`、网关连接 `snowluma-conn.js`、Markdown 转纯文本 `md-to-plain.js`、表情库 `sticker-lib.js`、黑话学习 `slang-learner.js`、空间网页端 `qzone-web.js`、token 账本 `token-ledger.js` 等 | 不能删。`bridge.js` 是主程序（单文件很大，改动前先读 [guides/SECURITY_BASELINE.md](guides/SECURITY_BASELINE.md)） |
| `scripts/` | 安装 / 测试 / 运维 / 探针（见第二节） | 测试与 `postinstall` 依赖不能删 |
| `dsh/agent-presets/` | `qq-chat` 与 `qq-chat-v2` 两个 preset 的**权威源**（`agent.cordis.yml` + `preset.yml` + 工具守卫 `qq-tool-restrict.mjs`） | 改 preset 会影响所有人设行为；改完必须重新生成 patch（见下） |
| `plugins/qq-agent-presets/` | DSH bundle：把两个 preset 生成成 `@deepseek-ai/dsh-agent-preset` 行（`presets/*.patch.yml`），并携带唯一的 `qq-tool-restrict` 权威实现 | 由 `scripts/build-agent-preset-patches.mjs` 生成，别手改 `presets/` |
| `plugins/qq-mode-console/` | DSH 插件：注册 `qq-mode` 设置命名空间（**只有 host 半**，没有浏览器 UI 卡片，所以 DSH 设置页看不到它 —— 模式改走桥接控制台） | 改了要重装/重启 DSH |
| `public/console.html` | 桥接自带控制台（`http://127.0.0.1:3100`）的前端 | 目录里只应有这一个文件 |
| `roles/` | 人格卡（`小鲸鱼.md` / `傲娇助手.md` / `朋友们.md` + `README.md` 写法说明）：控制台「人格与角色」页可编辑，保存即生效 | 用户内容，别乱动。写法见 [../roles/README.md](../roles/README.md) |
| `audio/` | **语音库**（你的真实音频）。桥接的语音工具只能发这里的文件 | 用户文件，别删。见 [../audio/README.md](../audio/README.md) |
| `assets/` | 仓库配图（`deepseek娘.png` 等）。演示视频改为 Release 附件，不入库 | 别加大体积二进制 |
| `state/` | **运行时数据**：会话映射、模式、角色、黑话库、表情库、语音缓存索引、日志、锁、控制台令牌。`.gitignore` 排除 | 用户数据，别删；删了会重建但历史映射丢失 |
| `config.json` | 运行配置（真实配置**不入库**）；模板是 `config.example.json` | 值属于用户 |

---

## 二、`scripts/` 命名约定

共 82 个 `.mjs` + 3 个 `.json` 基线 + `sing.py` + `reload-mcp.sh`，另有 `fixtures/` 目录。按前缀区分用途：

| 前缀 / 形态 | 含义 | 归宿 |
| --- | --- | --- |
| `setup-*.mjs` | **安装 / 初始化**：把 preset、MCP、bundle 写进目标设备的 DSH profile（`setup-dsh.mjs [profile]`，默认 `web`，桌面版传 `desktop`；幂等，覆盖前打时间戳备份） | **保留**（新用户第一步） |
| `start-mac.mjs` | **macOS 启动器**：探测 DSH 桌面版当前端口 → 写回 `config.json` 的 `dsh.baseUrl` → 启动桥接。`--check` 只探测不启动 | **保留**（桌面版必用） |
| `build-agent-preset-patches.mjs` | 从 `dsh/agent-presets/` 生成 `plugins/qq-agent-presets/presets/*.patch.yml`。改了 preset 必须重跑 | **保留** |
| `patch-snowluma-sdk.mjs` | 修补 `@snowluma/sdk` 的 ESM 打包 bug。**`postinstall` 自动执行** | **必须保留**（删了 `npm install` 就坏） |
| `harden-state-acl.mjs` | 收紧 `state/` 目录权限（Windows 上要靠 ACL，`mode 0o600` 是空操作）。**任何路径都以 0 退出，绝不阻断启动**，被 `start.bat` 调用 | 保留 |
| `diagnose-acl.mjs` | 只读盘点：列出被切断 ACL 继承的路径，分「有意收紧」与「非预期收紧」两类并给出恢复命令。**必须在无沙箱终端跑** | 保留（`npm run diagnose:acl`） |
| `test-*.mjs` | **自动化测试**。其中被 `test-audit.mjs` 的 `tests[]` 列进的那些会跑在 `npm run test:audit` 里（离线、不发真 QQ 消息、不用生产凭据） | 保留；改动需同步 `test-audit.mjs` 清单 |
| `test-dsh-*.mjs` | **需要活的 DSH**（不在 `test:audit` 里）：`test-dsh-auth`（鉴权链路）、`test-dsh-inbox-projection`（队列投影解析）、`test-dsh-session-retire`（退役会话端到端）、`test-dsh-v2-wait`（preset 工具面） | 保留（改 DSH 契约时必须跑） |
| `test-audit-*.mjs` | `test-audit` 的子模块（bridge / protocol / security / setup 及其 helpers / guards），由 `test-audit.mjs` 直接运行 | 保留 |
| `test-console-ui.mjs` + `console-ui-*.json` + `console-ui-fixture.mjs` + `fixtures/` | 控制台**离线浏览器回归**与基线（`npm run test:console-ui` / `npm run preview:console`），说明见 [guides/CONSOLE-UI-TESTING.md](guides/CONSOLE-UI-TESTING.md) | 保留（基线只在后端契约真变时才重录） |
| `test-voice-*.mjs` | 语音链路测试（edge-tts 合成、音量处理、预览、图形界面） | 保留 |
| `verify-*.mjs` | **一致性校验**：`verify-dsh-020-adaptation`（`npm run verify:adaptation`）、`verify-persona-config`（`npm run verify:persona`）、`verify-agent-presets-017` | 保留 |
| `scan-dsh-tool-names.mjs` + `dsh-tool-names.mjs` | **工具名对账**：从已安装的 DSH 包里抽真实工具名，与 QQ 守卫的 restrict 名单双向求差（防拼错假名静默失效 / 防新版新增能力漏隐藏）。抽取实现只有一份 | 保留（**每次升级 DSH 后跑一次**：`npm run scan:tool-names`） |
| `probe-*.mjs` | **探针**：问 DSH / SnowLuma「实际支持什么」（RPC 形状、工具清单、事件流、工作区、模型、协议帧、settings 命名空间、心跳载荷）。鉴权统一走 `probe-auth.mjs` | 保留，按需重跑 |
| `probe-020-protocol.mjs` / `probe-020-settings.mjs` | 0.2.0 版探针：前者采样 `session/control` baseline、`session/projections`、`session/follow`、`$events`、`session/cancel` 的**原始帧结构**；后者列 settings 命名空间并**幂等写回**验证 `qq-mode` 可写。控制台「改模式不生效」时的第一手诊断 | 保留（`npm run probe:protocol` / `probe:settings`） |
| `probe-snowluma-heartbeat.mjs` | 只读探针：连 OneBot WS 等一个 `meta_event/heartbeat`，打印 `status.online` / **`status.good`**。不发消息、不建会话 | 保留（`npm run probe:heartbeat`） |
| `send-*.mjs` | 面向网关的**真发送**小工具（`send-voice.mjs` 走桥接；`send-test-group.mjs` 发测试群） | 保留，但注意会真的发消息 |
| `check-onebot-status.mjs` | 手工排查：查 OneBot 连通性 | 保留（运维常用） |
| `privacy-scan.mjs` + `privacy-rules.example.json` | **发布前隐私扫描**：扫 `git ls-files` + 未忽略的未跟踪文件，规则见 [guides/PRIVACY.md](guides/PRIVACY.md) | 保留（发布前硬性一步） |
| `sing.py` | 唱歌：edge-tts 逐字合成 + ffmpeg 变调拼接（被 `qq_sing_song` 调用） | 保留 |
| `reload-mcp.sh` | 热重载 MCP：kill 掉 MCP server 子进程，DSH 会自动重启它并刷新工具清单（改 MCP 工具后不必重启 DSH） | 保留 |
| `audit-bridge-harness.mjs` / `dsh-modules.mjs` | 审计脚手架（虚拟网关 + 沙箱化行为审计） / 按路径加载 DSH 安装内模块 | 保留（被测试引用） |
| `voice-tool-locator.mjs` | 历史遗留：解析「独立发语音工具」的位置（那个工具**不在本仓库**，所以相关测试在缺目录时会自动跳过） | 保留（被若干测试引用） |

---

## 三、`docs/` 结构

```
docs/
├── README.md       # 文档索引（每篇一句话 + 是否仍然有效）  ← 先看这个
├── FOLDER_MAP.md   # 本文件
└── guides/         # 面向使用者 / 运维：
                    #   DSH_SETUP.md            装到 DSH（preset + MCP）
                    #   MACOS_NAPCAT.md         macOS 全流程（NapCat + 桌面版端口）
                    #   VOICE.md                语音三条链路
                    #   TOKEN_USAGE_CONSOLE.md  令牌与花费看板
                    #   CONSOLE-UI-TESTING.md   控制台离线预览与回归
                    #   SECURITY_BASELINE.md    安全基线与威胁模型
                    #   DSH_020_ADAPTATION.md   DSH 0.2.0 适配改动记录
                    #   PRIVACY.md              发布前隐私扫描
```

> 本仓库**不包含** `docs/design/`、`docs/research/`、`docs/audits/`、`docs/legacy/`
> 与 `docs/guides/PROJECT_GUIDE.md` —— 那些是作者本机的开发/审计过程产物，未随发布。
> 设计意图已收敛进 `SECURITY_BASELINE.md` 与 `DSH_020_ADAPTATION.md`。

规则：**根目录只留 `README.md` / `README.en.md` / `RULES.md` 三个文档**，其余一律进 `docs/` 对应子目录，
并在 [README.md](README.md) 索引里登记一行（含「仍然有效 / 已被取代」）。

---

## 四、不在本仓库里的东西

| 东西 | 说明 |
| --- | --- |
| 独立「发语音」工具（`voice-tool/`） | 曾经从本仓库拆出去的图形界面/命令行工具，**不在本仓库**，相关 npm 脚本（`voice-gui` / `voice-cli`）**已移除**。语音统一走：CLI `npm run send-voice`，或 MCP 工具 `qq_send_voice` / `qq_say_voice` / `qq_sing_song`（实现见 `src/voice-core.js` + `src/send-voice-lib.js`），说明见 [guides/VOICE.md](guides/VOICE.md) |
| `config.json` / `state/` | 真实配置与运行时数据，永不入库 |
| `audio/` 里的音频 | 个人素材，永不入库（只保留 `audio/README.md` 说明） |
| 演示视频 `project-intro.mp4` | 改为 GitHub Release 附件托管，不在仓库里 |
| DSH 本体 / SnowLuma / NapCat / QQ | 都是独立的第三方软件，本项目**只对接、不打包、不部署** |

---

## 五、依赖关系速查（谁生成谁）

```
dsh/agent-presets/*/agent.cordis.yml   ──build-agent-preset-patches.mjs──►  plugins/qq-agent-presets/presets/*.patch.yml
                                                                                    │
scripts/setup-dsh.mjs  ──► ~/.dsh/profiles/<profile>/cordis.patch.yml  ◄────────────┘
                       ──► ~/.dsh/profiles/<profile>/package.json（bundles + link: 依赖）
                       ──► ~/.dsh/plugins/qq-{agent-presets,mode-console}（junction 目标）

src/mcp-*.js  ──► cordis.patch.yml 里三个 MCP 条目（绝对路径；移动仓库后要重跑 setup-dsh.mjs）
```

> 移动或重新 clone 仓库到别的路径后，**必须重跑 `node scripts/setup-dsh.mjs <profile>`**，
> 否则 DSH 里的 MCP / 插件绝对路径仍指向旧位置。
