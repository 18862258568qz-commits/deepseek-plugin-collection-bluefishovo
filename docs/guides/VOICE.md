# 语音发送指南（VOICE）

> 本文讲清楚「AI 怎么在 QQ 上说话」：三条语音链路分别是什么、各自要装什么、`config.json` 里怎么开、
> 以及出问题时先看哪里。**语音是可选功能**，不配也能正常收发文字与图片。
>
> 相关文档：[安装与配置](../../README.md) · [DSH 端安装](DSH_SETUP.md) · [macOS + NapCat 接入](MACOS_NAPCAT.md) ·
> [语音库说明](../../audio/README.md) · [安全基线](SECURITY_BASELINE.md)

---

## 一、先看全景：三条链路

桥接里有**三条**互不相同的发声通道。它们共用同一个「语音库目录」（`socialV2.voice.dir`）作为落盘位置，
但触发方式和依赖完全不同：

| 链路 | 谁在用 | 音色 | 依赖 | 对应工具 / 接口 | 开关 |
| --- | --- | --- | --- | --- | --- |
| **A. 预制语音库** | AI 发预先准备好的固定台词 | 你自己录/合成的音频 | 只需要语音库里有文件 | `qq_list_voices` / `qq_send_voice` | `socialV2.tools.sendVoice` |
| **B. edge-tts 动态合成** | AI 想说什么就说什么 | 微软 Edge 的在线神经音色（5 种语气） | Python + `edge_tts` 模块 + **联网** | `qq_say_voice` | `socialV2.tools.sayVoice` |
| **C. 本地 GPT-SoVITS 专属音色** | 同上，但用你自己的克隆音色 | 由你提供的参考音频克隆 | 本地 GPT-SoVITS 服务（CPU 可跑） | `qq_say_voice`（同一个工具，换后端） | `socialV2.voice.ttsBackend` / `socialV2.voice.gsv.*` |

再加一个**独立的小功能**：`qq_sing_song`（唱《小星星》《生日快乐》《两只老虎》），它固定走 edge-tts 逐字合成 + ffmpeg 变调，
不受 GSV 影响，详见第六节。

`socialV2.voice.enabled` 是「**AI 能不能发语音**」的总闸（默认 `false`）。它只关 AI 通道——
你在控制台里手动试发、或者用 CLI 发，不受它影响。三个 `tools.*` 开关则是**工具级**的：关掉后该工具
**不会注册给模型**（省 token，也避免模型调用后被 403）。

> 💡 三者可以同时存在。常见组合：`sendVoice` 关掉（不用预制库）、`sayVoice` 打开 + `ttsBackend: "gsv"`
> （全部用专属音色现合成）——这正是「只要她自己声音」的配置。

---

## 二、共用部分：语音库目录 `socialV2.voice.dir`

所有音频（含合成缓存）都落在 `socialV2.voice.dir` 指向的目录里：

- 默认值 `audio`，**相对仓库根目录**解析（即 `qq-bridge/audio/`）；写绝对路径则原样使用。
- 该目录默认被 `.gitignore` 排除，**个人音频不进公开仓库**。目录里放什么、怎么命名见 [audio/README.md](../../audio/README.md)。
- 支持的扩展名：`.mp3` `.wav` `.ogg` `.oga` `.opus` `.m4a` `.aac` `.flac` `.amr` `.silk` `.slk` `.wma` `.spx`。
- 会递归扫描**最多 4 层子目录**；以 `.` 开头的文件/目录跳过（所以 `.gitkeep` 之类不会出现在列表里）。
- 合成缓存放在 `<dir>/tts/` 子目录（`say-*.mp3`、`gsv-*.wav`、`sing-*.wav`），各自只保留最近 80 个。

### ⚠️ macOS + NapCat 的硬限制：路径必须在 QQ 沙盒内

桥接把**绝对路径**直接交给网关（`record` 段的 `file` 字段），自己不做拷贝。macOS 上 QQ 跑在 App Sandbox 里，
**只能读自己容器内的路径**。所以 macOS + NapCat 必须把 `socialV2.voice.dir` 指到容器里，例如：

```jsonc
"socialV2": {
  "voice": {
    "dir": "/Users/<你的用户名>/Library/Containers/com.tencent.qq/Data/Documents/napcat-assets/voices"
  }
}
```

（用 `$HOME` 时记得在 shell 里展开成真实路径再写进 JSON —— JSON 里不会做变量替换。）

Windows + SnowLuma 没有这个限制，`audio` 默认值即可。详见 [MACOS_NAPCAT.md](MACOS_NAPCAT.md)。

### 安全边界：AI 只能取语音库里的文件

`qq_send_voice` 的 `voice` 参数只接受**语音库内的相对名字**（可带子目录、可省略扩展名）。
它不能发任意本地路径、URL 或 base64 —— 这是防「提示词注入让 AI 把 `~/.ssh/id_rsa` 当语音外发」的边界。
`socialV2.voice.allowAbsolutePath` 默认 `false`；除非你完全清楚后果，否则不要打开。

---

## 三、链路 A：预制语音库（`qq_list_voices` / `qq_send_voice`）

**适用场景**：想让 AI 说几句固定的、你精心准备过的台词（口头禅、晚安、撒娇）。质量最高，成本为零。

1. 把音频放进 `socialV2.voice.dir`（默认 `audio/`），文件名就是 AI 看到的「台词名」。
   建议用**中文、能一眼看懂内容**的名字，例如 `撒娇-抱抱我嘛.wav`、`日常-晚安.mp3`；子目录可用来分类
   （`撒娇/`、`傲娇/`、`通用/`），AI 看到的名字形如 `撒娇/抱抱我嘛.wav`。
2. 打开开关：`socialV2.voice.enabled: true` **且** `socialV2.tools.sendVoice: true`。
3. AI 先 `qq_list_voices` 看有哪些可选（会返回文件、大小、时长和当前 limits），再用 `qq_send_voice` 发。

**限制**（`socialV2.voice.*`，超限会被拒绝而不是截断）：

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `maxSeconds` | 300 | 单条语音最长秒数 |
| `maxBytes` | 20971520（20 MB） | 单文件最大字节 |
| `maxPerMinute` | 2 | 每分钟最多发几条 |
| `maxPerHour` | 10 | 每小时最多发几条 |
| `defaultVolume` | 1 | 默认音量倍数（0.1~4，1 = 原样） |
| `loudness` | `normal` | 智能响度档位：`quiet`(-20 LUFS) / `normal`(-16) / `loud`(-13) |
| `ffmpegPath` | 空 | ffmpeg 可执行文件位置；空则找 `FFMPEG_PATH` 环境变量，再找 `PATH` |
| `autoReadback` | true | 发送后回读校验 `record` 段是否真的落地（`verified` 字段） |

> `qq_send_voice` 返回的 `verified: true` 表示已用 `get_msg` 回读到这条消息的 `record` 段 ——
> 只有它才是「语音确实发出去了」的证据。桥接的提示词也要求模型只在这个值为真时才声称发了语音。

---

## 四、链路 B：edge-tts 动态合成（`qq_say_voice`）

**适用场景**：没有本地模型，但想让 AI 想说什么就说什么。一条命令装好，质量稳定，**需要联网**。

### 依赖

```bash
pip install --user edge-tts        # 或 pipx install edge-tts
```

桥接按下面顺序找「带 `edge_tts` 模块的 Python」（第一个 `import edge_tts` 成功的胜出）：

1. 环境变量 `QQ_BRIDGE_EDGE_TTS_PYTHON`
2. `~/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3`（DSH 自带运行时）
3. `/opt/homebrew/bin/python3`（Apple Silicon Homebrew）
4. `/usr/bin/python3`
5. `python3`（走 PATH）

想指定自己的解释器，最稳的是设环境变量：

```bash
QQ_BRIDGE_EDGE_TTS_PYTHON=/opt/homebrew/bin/python3 npm start
```

### 五种语气

`tone` 参数决定音色与速率/音高（都在 `src/bridge.js` 的 `TTS_TONES` 里）：

| tone | 音色 | rate / pitch | 适合 |
| --- | --- | --- | --- |
| `软萌`（默认） | zh-CN-XiaoyiNeural | -5% / +10Hz | 日常撒娇 |
| `俏皮` | zh-CN-XiaoyiNeural | +8% / +20Hz | 接梗、打趣 |
| `治愈` | zh-CN-XiaoxiaoNeural | -3% / +3Hz | 安慰、晚安 |
| `元气` | zh-CN-XiaoyiNeural | +15% / +25Hz | 兴奋、催更 |
| `低语` | zh-CN-XiaoyiNeural | -12% / -5Hz | 悄悄话 |

### 限额与缓存

- 单条 ≤ 300 字；**每分钟最多 6 条、每小时最多 60 条**（合成侧限流，与发送侧 `maxPerMinute` 是两道闸）。
- 相同文本 + 相同语气会命中缓存（`<dir>/tts/say-<hash>.mp3`），不重复请求网络。
- **发送目标**：`ownerQQ` 的私聊，或 `allow.groups` 里的白名单群（群里的语音直接发到那个群）。
  非白名单会话调用会被 403 拒绝 —— 动态合成是「她在这个会话里说话」，不是群发工具。
  > 注意 `qq_sing_song` 不同：它**只发 `ownerQQ` 私聊**（见第六节）。

### 常见故障

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `TTS 引擎不可用：找不到带 edge_tts 的 Python` | 没装或装到了别的解释器 | 装 `edge-tts`，或设 `QQ_BRIDGE_EDGE_TTS_PYTHON` |
| `语音合成失败：…` | 网络被拦、DNS 失败、或参数不被接受 | 先手动跑一次 `python3 -m edge_tts --text 测试 --voice zh-CN-XiaoyiNeural --write-media /tmp/t.mp3` |
| `语音合成输出为空（edge-tts 可能被网络拦截）` | 连上了但没拿到音频（企业网/代理常见） | 换网络或配代理；也可改用链路 C 本地合成 |
| `语音合成太频繁（每分钟最多 6 条）` | 触发限流 | 等一会儿；或调整人格卡让语音别那么密 |

> edge-tts 依赖微软的在线服务，**这是唯一需要出网的语音链路**。完全离线环境请用链路 C。

---

## 五、链路 C：本地 GPT-SoVITS 专属音色

**适用场景**：想让 AI 用**你指定的那个声音**说话（零样本克隆，不需要训练）。纯本地推理，
**不消耗任何 LLM token**，但会占内存、首次合成较慢。

### 5.1 桥接侧的配置（先理解这几个字段）

```jsonc
"socialV2": {
  "voice": {
    "enabled": true,
    "ttsBackend": "auto",              // "edge" | "gsv" | "auto"
    "followUpWindowMs": 600000,        // 语音模式窗口，见第八节
    "gsv": {
      "enabled": true,
      "url": "http://127.0.0.1:9881",           // 端口以这里为准
      "controllerUrl": "http://127.0.0.1:3101", // 可选：常驻控制器，"" = 关闭自动拉起
      "refAudio": "audio/ref/your-reference.wav", // 相对仓库根或绝对路径
      "promptText": "参考音频里说的那句话的逐字文本",
      "promptLang": "zh",
      "textLang": "zh",
      "version": "v2ProPlus",
      "speed": 1.05,
      "temperature": 0.68,
      "topK": 10,
      "topP": 0.85,
      "sampleSteps": 48
    }
  }
}
```

> 上面这份**字段与取值和 `config.example.json` 一致**，只把 `enabled` / `ttsBackend` 换成了
> 「要用专属音色」时的值。模板出厂是 `ttsBackend: "edge"` + `gsv.enabled: false` —— 那是为了让
> 新用户**不装 GSV 也能开箱出声**，别误以为 GSV 默认就开着。
>
> `gsv.version` 必须与你 GSV 的推理配置（`tts_infer_v2proplus_cpu.yaml`）对齐；
> `refAudio` 写相对路径时相对**仓库根目录**解析。

`ttsBackend` 的语义（代码在 `gsvVoiceCfg()` / `synthesizeTts()`）：

| 值 | 行为 |
| --- | --- |
| `"edge"` | 只用 edge-tts（即使 `gsv.enabled` 为 true 也不走 GSV） |
| `"gsv"` | 只用 GSV；**GSV 不可用时直接报错，不回退**（模板不选它，就是为了避免新用户哑火） |
| `"auto"` | 优先 GSV，失败自动回退 edge-tts 并在日志打 `[tts] GSV 合成失败，回退 edge-tts：…` |

> 不填 `ttsBackend` 时：`gsv.enabled === true` → 按 `gsv` 处理，否则按 `edge`。
> 模板的 `"edge"` + `gsv.enabled: false` 是**开箱可用**的组合；你要用专属音色就改成 `"auto"`（推荐，有兜底）
> 或 `"gsv"`（只要专属音色，宁可报错也不换嗓子）。

**端口口径**：以 `socialV2.voice.gsv.url` 为准。本仓库的示例配置与 `start-gsv.command` /
`start-all-mac.command` 都用 **9881**；桥接代码内的兜底默认值是 **9880**（`url` 未填时生效）。
换端口时两边要一起改。

**语气映射**：GSV 后端下 `tone` 不换音色（音色由参考音频决定），只微调语速与温度
（`GSV_TONE`：软萌 1.0/0.80、俏皮 1.10/0.92、治愈 0.95/0.72、元气 1.16/0.88、低语 0.90/0.72）。

**缓存**：同一段文本 + 同一语气 + 同一组参数 → `<dir>/tts/gsv-<hash>.wav`，命中即秒发。
调过参考音频或参数后 hash 变化，会重新合成。

### 5.2 启动 GSV

```bash
./start-gsv.command            # 只起语音引擎
./start-all-mac.command        # 一键：NapCat + GSV + 桥接
```

两个脚本都支持环境变量覆盖（都不含任何个人路径）：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `GSV_DIR` | `$HOME/gpt-sovits` | GPT-SoVITS 代码 + venv + 模型所在目录 |
| `GSV_PYTHON` | `$GSV_DIR/venv/bin/python` | 虚拟环境解释器 |
| `GSV_CONFIG` | `$GSV_DIR/GPT_SoVITS/configs/tts_infer_v2proplus_cpu.yaml` | TTS 推理配置 |
| `GSV_PORT` | `9881` | 监听端口（改了要同步 `gsv.url`） |

引擎只监听 `127.0.0.1`。首次加载模型约 20~60 秒；`start-all-mac.command` 最多等 120 秒，
超时会提示「桥接将回退 edge-tts」而不是卡死。

> 桥接在合成前还会尝试 `POST <gsv.controllerUrl>/gsv/ensure`（默认 `http://127.0.0.1:3101`，最多等 90 秒）——
> 这是可选的「常驻控制器」通道，用来按需拉起被回收的引擎（它闲置时占 4.5 GB 内存）。
> **没有这个控制器也没关系**：请求失败会被静默忽略，继续走正常合成。
> 不想让它去敲那个端口，把 `socialV2.voice.gsv.controllerUrl` 设为 `""` 即可关闭自动拉起。

### 5.3 按平台/显卡选启动方式（Windows 版）

macOS 用上面 `./start-gsv.command`；**Windows 用 `windows/` 里的脚本**：

| 你的显卡 | 脚本 | 推理设备 | 说明 |
| --- | --- | --- | --- |
| **NVIDIA**（GTX 16 系 / RTX 全系） | `windows\start-gsv-nvidia.bat` | `device: cuda` | 快（短句约 1~3 秒）。显存 <6 GB 报 OOM 时把配置里的 `is_half` 改 `false` |
| **AMD**（RX 6000/7000 等） | `windows\start-gsv-amd.bat` | `device: cpu` | GPT-SoVITS **没有官方 Windows ROCm 版**，默认走 CPU（短句约 4~10 秒）。进阶：Linux + ROCm，或社区 ZLUDA（成功时设 `GSV_DEVICE=cuda`） |
| 无独显 / 核显 | `windows\start-gsv-amd.bat` | `device: cpu` | 同上 |
| 不装引擎 | —（不运行） | 自动回退 edge-tts | 零显卡要求，联网即可 |

Windows 脚本支持的环境变量与 macOS 一致（`GSV_DIR` / `GSV_PYTHON` / `GSV_CONFIG` / `GSV_PORT`），
另外会自动把仓库里的推理配置模板复制到 GSV 目录：

| 模板 | 用途 |
| --- | --- |
| `windows/gsv/tts_infer_v2proplus_cuda.yaml` | NVIDIA（`device: cuda`、`is_half: true`） |
| `windows/gsv/tts_infer_v2proplus_cpu.yaml` | AMD / 无独显（`device: cpu`） |

> `device` 与 `is_half` 是**每个版本段各自**的字段（文件里 `custom` / `v2ProPlus` 等各有自己的），
> 改的时候要改你实际使用的那一段（默认 `v2ProPlus`）。
> Windows 完整安装步骤见 [WINDOWS.md](WINDOWS.md)。

### 5.3 装 GPT-SoVITS（参考步骤）

以下是在 Apple Silicon 上跑通的路径，Intel Mac / Linux 同理（把 CPU 换成 GPU 配置会更慢或更快，取决于硬件）。

1. **Python 3.10 + venv**（GSV 官方对 3.10 支持最稳）：

   ```bash
   brew install python@3.10
   cd "$HOME" && git clone https://github.com/RVC-Boss/GPT-SoVITS gpt-sovits
   cd gpt-sovits && python3.10 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

   > 官方 PyPI 在国内可能很慢，可加 `-i https://pypi.tuna.tsinghua.edu.cn/simple`。
   > 模型（`pretrained_models.zip`，约 4.6 GB）从 hf-mirror 之类的镜像下载更稳；ModelScope 有时会卡住。

2. **补齐几个容易漏的依赖**（缺任意一个，`/tts` 会直接返回 400）：

   ```bash
   pip install torchcodec resampy pyloudnorm
   ```

3. **放好配套资源**：`G2PWModel/` → `GPT_SoVITS/text/`；`nltk_data` → 虚拟环境内；
   `open_jtalk` 字典 → `site-packages/pyopenjtalk/`。

4. **CPU 推理配置**：复制一份 `GPT_SoVITS/configs/tts_infer_v2proplus_cpu.yaml`，确认
   `device: cpu`、`is_half: false`、`version: v2ProPlus`（与 `gsv.version` 对齐）。

5. **启动**：`./start-gsv.command`，看到端口监听即成功。

### 5.4 参考音频怎么准备（决定音色的唯一因素）

零样本克隆：**音色 = 参考音频 + 它的逐字文本**。不需要训练、不需要数据集。

- 格式：单声道 WAV，**5~10 秒**，干净、无背景音乐、无混响。
- 内容：一段自然口语，语气接近你想要的人设（软萌就别用播音腔）。
- 文本：`gsv.promptText` 必须是这段音频的**逐字文本**，一个字都不能差（标点可简化）。
  对不上会明显影响自然度，甚至念错。
- 想换音色：替换 `refAudio` + `promptText` 两处即可，**不用重启 GSV**（桥接每次合成都会带上这两个参数，
  缓存 key 也包含它们，所以会自然重新合成）。
- 用现成 TTS 造参考音频也行（例如 `say -v Tingting` 或 edge-tts 生成一段，再用 `afconvert`/ffmpeg 转成单声道 WAV），
  这在没有录音条件时很实用。

### 5.5 性能预期（Apple M4 / 16 GB 实测）

| 指标 | 数值 |
| --- | --- |
| 冷启动首句 | ~20 秒（含模型加载） |
| 之后每句（4~5 秒语音） | ~6~12 秒 |
| 静置内存 RSS | ≈ 2.3 GB（加载模型时约 4.5 GB） |
| LLM token 消耗 | **0**（纯本地推理，只有工具调用本身的几十 token） |

慢是正常的：**这是 CPU 推理**。想更快就上 GPU 配置或换更小的模型；想省心就让 `ttsBackend: "auto"`，
引擎没起来时自动退回 edge-tts（音色会变，但不会哑火）。

### 5.6 常见故障

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 日志 `[tts] GSV 合成失败，直接报错：GSV HTTP 400 …` | 后端是 `"gsv"`，引擎没起或参数不对 | 先 `curl http://127.0.0.1:9881/docs` 确认服务活着；看 `state/gsv.log` |
| `未配置参考音频（socialV2.voice.gsv.refAudio）` | `refAudio` 为空 | 填绝对路径 |
| `GSV 返回的音频过短（服务可能刚启动或参数错误）` | 引擎刚起、模型没加载完 | 等 30 秒重试；或改用 `"auto"` 让它先回退 |
| 合成很慢但能出 | CPU 推理的正常表现 | 接受它，或换 GPU / 用 edge-tts |
| 换音色没生效 | 缓存命中或 `promptText` 与音频不符 | 换参考音频后 hash 会变；确认 `promptText` 逐字一致 |

---

## 六、唱歌（`qq_sing_song`）

内置三首：《小星星》《生日快乐》《两只老虎》。实现是 `scripts/sing.py`：edge-tts **逐字**合成 → ffmpeg
`asetrate`/`atempo` 变调拼接，结果缓存为 `<dir>/tts/sing-<hash>.wav`。

- 只发给 `ownerQQ` 私聊，受与 `qq_say_voice` 相同的合成限流。
- **固定走 edge-tts**，不受 `ttsBackend` 影响。想改成专属音色逐字合成也可以，但每首会慢 40~80 秒（CPU）。
- 首次生成需要几分钟（逐字合成），之后命中缓存秒发。

---

## 七、ffmpeg 依赖

只在**需要处理音频**时用（调音量、智能响度、唱歌变调、格式转换）。发原样音频不需要它。

- 安装：`brew install ffmpeg`（macOS）/ `winget install ffmpeg` 或 `choco install ffmpeg`（Windows）/ `apt install ffmpeg`（Linux）。
- 查找顺序（实现优先级，别记反）：`config.json` 的 `socialV2.voice.ffmpegPath` → 环境变量 `FFMPEG_PATH` → `PATH`。
- 报 `找不到 ffmpeg（请设置 FFMPEG_PATH 或在 config.json 里指定 socialV2.voice.ffmpegPath）` 就是这三处都没命中。

音量/响度是**本地 ffmpeg 处理后再发**的：OneBot 的 `record` 段没有增益参数，所以桥接只能先处理成新文件。
`volume` 与 `loudness` 互斥，`loudness` 优先。

---

## 八、语音模式窗口（`socialV2.voice.followUpWindowMs`）

真人有「打电话惯性」：一旦开始用语音说话，接下来几轮也倾向语音。桥接用这个字段模拟：

- 成功发出一条语音后，写入 `voiceModeUntil = now + followUpWindowMs`（默认 `600000` = 10 分钟，最小 60 秒）。
- 窗口内该会话的后续回复**倾向也用语音**；隔久了自动回到文字，不需要 AI 自己记。
- 想让她「一开口就停不下来」→ 调大；想「偶尔来一句就够」→ 调小。
- 这只是倾向提示，不是硬约束；实际行为还受人格卡与 `socialV2.voice.enabled` 约束。

---

## 九、配置字段速查

| 字段 | 作用 |
| --- | --- |
| `socialV2.voice.enabled` | **AI 发语音总闸**（默认 `false`）。只关 AI 通道，不关控制台手动试发 |
| `socialV2.voice.dir` | 语音库目录（默认 `audio`，相对仓库根）。macOS+NapCat 必须指到 QQ 容器内 |
| `socialV2.voice.maxSeconds` / `maxBytes` | 单条语音的时长/体积上限 |
| `socialV2.voice.maxPerMinute` / `maxPerHour` | 语音库发送频率上限 |
| `socialV2.voice.allowAbsolutePath` | 是否允许 AI 传绝对路径（默认 `false`，别开） |
| `socialV2.voice.defaultVolume` / `loudness` | 音量倍数 / 智能响度档位（互斥，响度优先） |
| `socialV2.voice.ffmpegPath` | ffmpeg 位置（优先于 `FFMPEG_PATH` 环境变量） |
| `socialV2.voice.autoReadback` | 发送后回读校验（`verified`） |
| `socialV2.voice.ttsBackend` | `edge` / `gsv` / `auto`（见 5.1） |
| `socialV2.voice.followUpWindowMs` | 语音模式窗口（见第八节） |
| `socialV2.voice.gsv.*` | 本地 GSV 音色的全部参数（见 5.1） |
| `socialV2.voice.gsv.controllerUrl` | **可选**。GSV 常驻控制器的地址，默认 `http://127.0.0.1:3101`（合成前 `POST /gsv/ensure` 按需拉起引擎）；填 `""` 关闭自动拉起。`config.example.json` 里**没有这个键**（缺省行为不变） |
| `socialV2.tools.sendVoice` | 注册 `qq_list_voices` / `qq_send_voice` |
| `socialV2.tools.sayVoice` | 注册 `qq_say_voice` |
| `socialV2.tools.singSong` | 注册 `qq_sing_song`（模板默认 `true`） |

---

## 十、排查顺序（记住这一条就够）

1. **先分清是哪条链路**：报错文本里带 `GSV` 的是链路 C，带 `edge_tts`/`edge-tts` 的是链路 B，
   带「语音库」/`找不到语音` 的是链路 A。
2. **再看开关**：`socialV2.voice.enabled`（总闸）→ 对应 `socialV2.tools.*`（工具是否注册）→
   控制台「工具参考」页确认模型实际拿到的工具清单。
3. **最后看网关**：文件路径在不在 QQ 能读的位置（macOS 沙盒）、网关是否支持 `record` 段。
   NapCat 直连 `send_private_msg` + `record` 段是可用的；不支持的情况下会报 action 失败。
4. 日志关键词：`[tts]`（合成）、`[account] TTS 语音已发送`、`[voice]`（语音库发送）。
