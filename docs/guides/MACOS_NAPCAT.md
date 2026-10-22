# macOS 接入：NapCat + DSH 桌面版（MACOS_NAPCAT）

> 本文是**在 macOS 上把 QQ 接进 DSH** 的完整实操记录（已脱敏：所有本机路径写成 `$HOME/...` 或 `/path/to/...`，
> 不含任何真实 QQ 号 / 群号 / 令牌）。每一步都在 Apple Silicon + macOS 上真实跑通过。
>
> 相关文档：[安装与配置](../../README.md) · [DSH 端安装](DSH_SETUP.md) · [语音发送](VOICE.md) ·
> [权限与安全规则](../../RULES.md)

---

## 一、为什么 macOS 要走另一条路

Windows 上推荐 SnowLuma 作为 QQ 网关；**SnowLuma 官方只发 Windows / Linux 版**，没有 macOS 版。
所以在 macOS 上改用 **NapCat**（同样是 OneBot v11 网关，有官方 macOS 安装器）。

对桥接来说两者是**同一个契约**：OneBot v11 的 WebSocket + HTTP API。所以除了下面这些差异，其余文档全部通用：

| 项目 | Windows + SnowLuma | macOS + NapCat |
| --- | --- | --- |
| QQ 网关 | SnowLuma（原生组件挂进 QQ 进程） | NapCat（改 QQ 的加载入口，注入 Shell） |
| 默认 OneBot 端口 | WS `3001` / HTTP `3000` | WS `3001` / HTTP `3000`（可自行配置，需与 `config.json` 一致） |
| 端点自愈 | 从 SnowLuma 安装目录读 token | **不适用**，建议 `snowluma.followDiscoveredEndpoint: false` |
| DSH 形态 | 通常 Web 版（固定端口 3080） | 常见是**桌面版**（端口每次启动都变 → 必须用 `start-mac.mjs`） |
| 语音库路径 | 仓库内 `audio/` 即可 | **必须在 QQ 沙盒容器内**（见第七节） |
| 部分专有能力 | 收藏表情同步、`bot_status`、`status.good` 等 | 见第七节「已知降级」 |

> ⚠️ **本桥接不安装、不启动、不控制任何网关**（SnowLuma / NapCat / QQ 都一样）。
> 下面所有「安装/启动/扫码」都是你自己在 GUI 里完成的动作 —— 这是有意的设计，见 [LICENSE](../../LICENSE) 与 [RULES.md](../../RULES.md)。

---

## 二、前置条件

| 依赖 | 要求 | 检查方式 |
| --- | --- | --- |
| macOS | 能装 QQ 官方 macOS 版即可（Apple Silicon / Intel 都行） |  |
| Node.js | **≥ 22.13** | `node -v` |
| DSH | 桌面版或 Web 版，能正常打开 | 桌面版：`DeepSeek Harness.app` |
| QQ | 官方 macOS 客户端（NapCat 依赖它的容器目录） | `ls /Applications/QQ.app` |
| Homebrew（可选） | 装 ffmpeg / python 用 | `brew -v` |

> 本文以 **DSH 桌面版 + profile 名 `desktop`** 为例。如果你用的是 DSH Web 版，把下文的 `desktop` 换成 `web`，
> 并且不需要 `start-mac.mjs`（Web 版端口固定，直接 `npm start` 即可）。

---

## 三、步骤 1：装桥接本体

```bash
cd "$HOME"
git clone <你的仓库地址>
cd qq-bridge
npm install          # postinstall 会自动修补 @snowluma/sdk 的 ESM 打包 bug
cp config.example.json config.json
```

---

## 四、步骤 2：装 DSH 端（preset + MCP）

**桌面版的 profile 是 `desktop`，不是默认的 `web`** —— 这一步最容易漏参数：

```bash
node scripts/setup-dsh.mjs desktop
```

脚本会（幂等，可重复运行）：

- 把 `qq-chat` / `qq-chat-v2` 两条 `@deepseek-ai/dsh-agent-preset` 行插入 profile
- 在 `~/.dsh/profiles/desktop/cordis.patch.yml` 挂载三个 MCP server
  （`mcp-snowluma` / `mcp-snowluma-host` / `mcp-web-search-safe`）
- 在 profile 的 `package.json` 注册 `qq-agent-presets` / `qq-mode-console` 两个 bundle（`link:` 依赖 + junction）
- 把 `qq-mode` 默认模式设为 `reserved2`（二代仿真），并写 `state/mode.json` 兜底
- 覆盖前会打时间戳备份（`cordis.patch.yml.bak-*`），保留最近若干份

装完 **必须重启 DSH**（preset 与 MCP 只在 DSH 启动时加载）。

验证：

```bash
node scripts/start-mac.mjs --check     # 先确认能探测到 DSH 端口
```

DSH 侧应该能看到 `qq-chat`（QQ 聊天角色）与 `qq-chat-v2`（二代仿真）；工具列表里出现
`mcp__snowluma__*` / `mcp__snowluma-host__*` / `mcp__web-search-safe__*`。
更多细节与排错见 [DSH_SETUP.md](DSH_SETUP.md)。

---

## 五、步骤 3：装 NapCat

### 5.1 用官方安装器

1. 从 NapCat 官方 release 下载 **NapCat-Mac-Installer**（`.app`），双击打开。
2. 安装器会把 NapCat Shell 解压进 QQ 的沙盒容器，并把 `QQ.app` 里的入口改到它自己的加载器。
3. **改入口这一步必须由你在 GUI 里完成**：它会要求把安装器加入
   「系统设置 → 隐私与安全性 → **App 管理**」，然后点「切换程序入口『NapCat』」并输入开机密码。
   > 直接用 `sudo` 或 `osascript` 做同一件事会被 macOS 的 App Management（TCC）拦下，
   > 实测报 `Operation not permitted` —— 这不是权限没给够，而是这条路径**只能走 GUI 授权**。
4. 装完确认版本：安装器界面会显示当前 NapCat 版本（例：`4.18.41`，与官方 release digest 一致即正常）。

### 5.2 相关路径（macOS）

| 内容 | 路径 |
| --- | --- |
| NapCat 配置 | `~/Library/Containers/com.tencent.qq/Data/Library/Application Support/QQ/NapCat/config/` |
| 其中 OneBot 配置 | `onebot11_<机器人QQ号>.json` |
| WebUI 配置 | `webui.json`（含 WebUI 访问令牌） |
| QQ 容器内资源目录 | `~/Library/Containers/com.tencent.qq/Data/Documents/napcat-assets/` |
| NapCat 加载器 | `~/Library/Containers/com.tencent.qq/Data/Documents/loadNapCat.js` |

> 不同 NapCat / QQ 版本下 `config/` 可能出现在 `.../Documents/napcat/config/` 或
> `.../Library/Application Support/QQ/NapCat/config/`。**以安装器或 WebUI 里显示的实际路径为准**。

### 5.3 启动 NapCat

先**完全退出原版 QQ**，再带 `--no-sandbox` 启动（NapCat 运行在 QQ 主进程里）：

```bash
/Applications/QQ.app/Contents/MacOS/QQ --no-sandbox
```

想直接快速登录某个账号（省掉手点）：

```bash
/Applications/QQ.app/Contents/MacOS/QQ --no-sandbox -q <机器人QQ号>
```

> 仓库的 `start-all-mac.command` 会替你启动这一步：设了 `NAPCAT_QQ` 就带 `-q`，没设就不带 `-q`
> 让你在 QQ 窗口里手动登录（首次登录推荐后者）。QQ 路径可用 `QQ_APP_BIN` 覆盖。

---

## 六、步骤 4：配 OneBot

打开 NapCat WebUI（默认 `http://127.0.0.1:6099`，令牌在 `webui.json` 里），在「网络配置」里开：

- **HTTP 服务器**：`http://127.0.0.1:3000`
- **WebSocket 服务器**：`ws://127.0.0.1:3001`
- 两者都**只监听回环地址**；单机使用可以不设 token（设了就把值填进 `config.json` 的 `snowluma.accessToken`）

然后改 `config.json`：

```jsonc
{
  "snowluma": {
    "wsUrl": "ws://127.0.0.1:3001",
    "httpUrl": "http://127.0.0.1:3000",
    "accessToken": "",
    "followDiscoveredEndpoint": false
  },
  "ownerQQ": <你自己的QQ号>,
  "allow": { "private": [<你自己的QQ号>], "groups": [] }
}
```

**为什么 `followDiscoveredEndpoint: false`**：那是给 SnowLuma 的端点自愈用的（换账号后端口/token 会变）。
NapCat 的端口是你手工配的、不会自己漂移；关掉它可以避免桥接把 `wsUrl` 改写成意外值。

> 白名单留空 + `allowAllWhenEmpty: false`（默认）= **不响应任何 QQ 消息**（fail-closed）。
> 这是刻意设计，不是 bug。白名单可以在控制台里填（见步骤 6）。

---

## 七、步骤 5：启动桥接（DSH 桌面版必须用这个启动器）

**DSH 桌面版每次启动都用 `--port 0`，即端口由系统随机分配。** 而桥接既靠 `dsh.baseUrl` 连 DSH，
又用 `~/.dsh/.credentials.yaml` 的签名密钥「离线铸造」带 authority 的会话 Cookie —— authority 对不上就是 401。
所以每次启动桥接前，**必须把当前端口写回 `config.json`**：

```bash
node scripts/start-mac.mjs            # 探测端口 → 写 config.json → 前台启动桥接
node scripts/start-mac.mjs --check    # 只探测并打印，不改配置、不启动
```

也可以双击 `start-mac.command`。**一键全启**（NapCat + 可选 GSV + 桥接）：

```bash
./start-all-mac.command
# 或指定账号快速登录：
NAPCAT_QQ=<机器人QQ号> ./start-all-mac.command
```

> ⚠️ 直接用 `npm start` 会沿用 `config.json` 里**上一次**的 `dsh.baseUrl`；DSH 重启后端口变了就连不上。
> 桌面版请始终走 `start-mac.mjs`。Web 版（固定端口）可以直接 `npm start`。

成功的日志长这样：

```
[bridge] SnowLuma 已连接：ws://127.0.0.1:3001
[bridge] 机器人昵称: <你的机器人昵称>
[bridge] DSH 已就绪（模式: reserved2）
```

> 日志里出现 `SnowLuma 已连接` 是历史文案，**接 NapCat 时也打这句**（它表示「OneBot 网关已连接」）。
> 另外首次连接失败一次（`code=1006`）后自愈重连，在 SnowLuma 上是正常现象；
> NapCat 上如果反复 1006，多半是 `wsUrl` 端口填错或 NapCat 没启动。

---

## 八、步骤 6：填白名单并做首次端到端验证

1. 打开控制台 <http://127.0.0.1:3100>，令牌在 `state/console-token`（首次启动自动生成）。
2. 「访问与安全」页填：**管理员 QQ（ownerQQ）** = 你自己的 QQ；**私聊白名单** = 你自己的 QQ（要接群就填群号）。
3. 用你的 QQ 私聊机器人发一句「你好」，几秒内应收到回复。

---

## 九、验证清单（照着勾）

- [ ] `node scripts/start-mac.mjs --check` 能打印出 DSH 端口
- [ ] 桥接日志出现「已连接」「DSH 已就绪」
- [ ] 控制台 `/api/status`：`connected: true`、`accountOnline: true`
- [ ] MCP 工具可调用：`snowluma_status` 返回网关可达；`qq_status` 返回 online
- [ ] 私聊机器人有回复（端到端）
- [ ] `node src/self-test.js http://127.0.0.1:<DSH端口>` 通过（DSH 连接 / 建会话 / prompt / 回合结束）

---

## 十、已知降级（NapCat 与 SnowLuma 的能力差异）

NapCat 走的是 OneBot v11 标准接口，因此以下**依赖 SnowLuma 专有 action** 的能力会降级或不可用。
它们都不是故障，桥接对缺失能力做了优雅降级：

| 能力 | 影响 |
| --- | --- |
| 收藏表情同步（`fetch_custom_face*` 系列） | 可能拿不到完整收藏列表；表情收发本身仍可用 |
| `bot_status` / 心跳里的 `status.good` 健康信号 | 上游健康判断退化为「靠 `get_status` + 事件间隔」，控制台的上游卡片可能一直显示正常 |
| 戳一戳（`send_poke`） | 视 NapCat 版本可能不可用 |
| 语音转写（收到别人语音转文字） | 不可用；收到的语音仍只显示占位文本 |
| 合并转发 / 部分媒体字段 | 逐版本核对，缺失时退化为占位文本 |

**语音库路径（重要）**：macOS 的 QQ 跑在 App Sandbox 里，**只能读自己容器内的路径**。
桥接把文件绝对路径直接交给网关，不做拷贝，所以 `socialV2.voice.dir` 必须指到容器内，例如：

```jsonc
"socialV2": { "voice": { "dir": "$HOME/Library/Containers/com.tencent.qq/Data/Documents/napcat-assets/voices" } }
```

（JSON 里不做变量替换，请写展开后的真实路径。）详见 [VOICE.md](VOICE.md) 第二节。

---

## 十一、兼容修复：DSH 0.2.1 起不再注册 `{{cwd}}` 提示词变量

**现象**：QQ 消息能收到、会话能建（preset 挂载成功），但 agent 回合报

```
unknown prompt variable "{{cwd}}" in section "deployment:persona-suffix";
registered variables: provider, model
```

QQ 侧表现为收到「agent 处理出错」。

**原因**：`qq-chat` / `qq-chat-v2` 的 persona `suffix` 里写了 `Your working directory is {{cwd}}.`，
而 DSH 0.2.1-rc.2 的 agent loop 只注册 `provider` / `model` 两个变量（工作目录由 DSH 的
working-directory 服务提供）。

**处理**：仓库里的 preset 已按新版对齐（不再引用 `{{cwd}}`）。如果你是从更早的版本升级上来、或者手工改过 preset：

1. 确认 `dsh/agent-presets/qq-chat/agent.cordis.yml` 与 `qq-chat-v2/agent.cordis.yml` 里没有
   `suffix: Your working directory is {{cwd}}.`
2. 重新生成 patch：`node scripts/build-agent-preset-patches.mjs`
3. 让 DSH 重载 profile（往 `cordis.patch.yml` 追加再删除一行注释即可触发热重载），
   然后归档旧会话（控制台「会话映射」里的重置），下一条消息会按新 preset 重建。
4. 验证：新建 `qq-chat-v2` 会话发一句「只回复两个字：收到」→ 回合正常结束。

> 注：仓库自带的 `verify-persona-config.mjs` / `verify-dsh-020-adaptation.mjs` 里部分断言是
> DSH 0.2.0 时代的（`npm run verify:adaptation` 在 0.2.1 上可能有断言失败）。以实际运行结果为准。

---

## 十二、回滚（把 DSH 和 QQ 都恢复原状）

1. **停桥接**：`Ctrl+C`（或关掉运行它的终端窗口）。
2. **摘掉 DSH 插件链接**：

   ```bash
   rm -f ~/.dsh/plugins/qq-mode-console ~/.dsh/plugins/qq-agent-presets
   ```

3. **恢复 profile**：用 `setup-dsh.mjs` 生成的备份还原，并从 profile 的 `package.json` 里删掉两个 `qq-*` 条目：

   ```bash
   cp ~/.dsh/profiles/desktop/cordis.patch.yml.bak-<时间戳> ~/.dsh/profiles/desktop/cordis.patch.yml
   ```

   然后从 `~/.dsh/profiles/desktop/package.json` 的 `dependencies` / `dsh.profile.bundles`
   里删掉 `qq-mode-console` 与 `qq-agent-presets`，再重启 DSH。
4. **卸载 NapCat**：打开 NapCat 安装器点「卸载 / 切回原版 QQ」，或把 `QQ.app` 里的
   `package.json.bak` 还原成 `package.json`。
5. **（可选）删运行时数据**：`qq-bridge/state/`（会话映射、模式、令牌等）。删了不影响 DSH 里的历史。

---

## 十三、常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| `没有找到正在运行的 DSH 桌面版进程` | DSH 桌面版没开，或开的是 Web 版。Web 版请直接 `npm start` 并手工填 `dsh.baseUrl` |
| `找到了 DSH 进程，但没有探测到 Web 服务端口` | DSH 还在启动中；或 `/` 没返回预期的鉴权响应。等几秒重试，或改用 `--check` 看细节 |
| 桥接报 DSH 401 | `dsh.baseUrl` 与当前 DSH 端口不一致（桌面版重启过）→ 重跑 `start-mac.mjs` |
| QQ 上完全没反应，但日志说「已连接」 | 先看白名单是否为空（fail-closed）；再看控制台「SnowLuma 上游」卡片；最后看 NapCat 自己的日志与 QQ 是否在线 |
| NapCat 启动后 QQ 打不开 / 闪退 | 入口切换后要用 `--no-sandbox` 启动；版本不匹配时回滚到原版入口再重装 |
| 安装器点「切换入口」报 `Operation not permitted` | 没给「App 管理」权限。系统设置 → 隐私与安全性 → App 管理，把安装器加进去 |
| 换机器人账号后连不上 | NapCat 的 `onebot11_<新QQ号>.json` 是新的；确认端口与 `config.json` 一致。桥接侧 `followDiscoveredEndpoint` 建议保持 `false` |
| 语音发不出去 | 语音库路径不在 QQ 容器内 → 见第十节；或 `socialV2.voice.enabled` 没开 |
