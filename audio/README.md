# `audio/` —— 语音库（放你自己的音频）

这个目录是**语音库**：桥接的语音工具只会从这里取文件发给 QQ。默认是空的 —— 它被 `.gitignore` 排除，
**个人音频不进公开仓库**，你放进去的东西只存在于你自己这台机器上。

> 用法总览见 [docs/guides/VOICE.md](../docs/guides/VOICE.md)。
> 配置字段是 `config.json` 的 `socialV2.voice.dir`（默认值就是 `audio`，相对仓库根目录）。

---

## 一、放什么

支持这些扩展名（大小写不敏感）：

```
.mp3  .wav  .ogg  .oga  .opus  .m4a  .aac  .flac  .amr  .silk  .slk  .wma  .spx
```

- 会**递归扫描最多 4 层子目录**，所以可以用子目录分类。
- 以 `.` 开头的文件/目录会被跳过（隐藏文件不会出现在语音列表里）。
- 建议单条 ≤ 5 分钟、≤ 20 MB（上限由 `socialV2.voice.maxSeconds` / `maxBytes` 控制，默认 300 秒 / 20 MB）。

---

## 二、命名规则（很重要：文件名就是 AI 看到的「台词名」）

AI 通过 `qq_list_voices` 看到的是**相对这个目录的路径**，然后原样传给 `qq_send_voice`。
所以文件名应该**一眼能看懂内容**，否则模型不知道什么时候该用哪一条。

推荐格式：`分类-内容.wav`，分类用中文短词：

```
audio/
  撒娇/
    抱抱我嘛.wav
    再陪我一会儿.wav
  傲娇/
    哼才不是呢.wav
  日常/
    晚安.mp3
    早上好.mp3
  通用/
    在的在的.wav
```

AI 看到的名字是 `撒娇/抱抱我嘛.wav`、`日常/晚安.mp3` 这样（**保留子目录**）。
`qq_send_voice` 的 `voice` 参数可以带子目录，也可以**省略扩展名**（桥接会自己匹配）。

**反例**（模型很难用对）：`1.wav`、`final_final.mp3`、`wx_camera_<时间戳>.amr`、`新建文件夹/a.wav`。

> 小技巧：同一句话放两个不同语气的版本（`撒娇/晚安.wav` 与 `日常/晚安.wav`），
> 模型会根据当前语境自己挑，比只放一条更自然。

---

## 三、和 `config.json` 的关系

```jsonc
"socialV2": {
  "voice": {
    "enabled": true,                 // AI 发语音总闸（默认 false）
    "dir": "audio",                  // ← 就是本目录；相对仓库根，也可写绝对路径
    "maxSeconds": 300,
    "maxBytes": 20971520,
    "maxPerMinute": 2,
    "maxPerHour": 10,
    "allowAbsolutePath": false       // 别开：开了 AI 就能拿任意本地文件当语音发出去
  },
  "tools": {
    "sendVoice": true                // 注册 qq_list_voices / qq_send_voice
  }
}
```

- `dir` 写相对路径时，**相对仓库根目录**解析（不是相对当前工作目录）。
- 桥接还会在本目录下建 `tts/` 子目录，放**动态合成的缓存**（`say-*.mp3`、`gsv-*.wav`、`sing-*.wav`），
  各保留最近 80 个。这个子目录是自动生成的，可以随时删（会重新合成）。
- 安全边界：AI **只能**取本目录内的文件，不能传 URL / base64 / 任意本地路径。

### ⚠️ macOS + NapCat 例外

macOS 的 QQ 跑在 App Sandbox 里，只能读自己容器内的路径。桥接把绝对路径直接交给网关、不做拷贝，
所以 macOS + NapCat 必须把 `dir` 指到容器内，例如：

```jsonc
"dir": "/Users/<你的用户名>/Library/Containers/com.tencent.qq/Data/Documents/napcat-assets/voices"
```

这时你可以把音频放容器里，或者**留一份副本在本目录**做备份/编辑（本目录是「素材库」，容器目录是「运行时可见」）。
详见 [docs/guides/MACOS_NAPCAT.md](../docs/guides/MACOS_NAPCAT.md) 第十节。

---

## 四、为什么这个目录默认不进仓库

1. **隐私**：语音里可能有你的声音、家人朋友的声音、真实姓名、地址。
2. **体积**：音频文件动辄几 MB，几十条就能把仓库撑大。
3. **无意义**：别人 clone 下来用不到你的音频，且 AI 人格卡会引用具体文件名 —— 对别人是噪音。

所以 `.gitignore` 排除了这个目录里的音频（只对本说明文件 `README.md` 留了例外）。
如果你 fork 了这个仓库并想公开自己的语音库，请先自己确认版权与隐私（尤其是克隆音色的参考音频，
通常**不应该**公开）。

---

## 五、自己动手生成音频（不录音也能有语音库）

| 方式 | 命令 | 适用 |
| --- | --- | --- |
| macOS 内置 TTS | `say -v Tingting -o /tmp/a.aiff "晚安啦" && afconvert -f WAVE -d LEI16 /tmp/a.aiff audio/日常/晚安.wav` | 快速批量生成固定台词 |
| edge-tts | `python3 -m edge_tts --text "晚安啦" --voice zh-CN-XiaoyiNeural --write-media audio/日常/晚安.mp3` | 更自然的少女音（需联网） |
| ffmpeg 转码/调音量 | `ffmpeg -i in.m4a -ac 1 -ar 24000 out.wav` | 统一成单声道，体积更小、兼容性最好 |

> 单声道 24 kHz 的 WAV 或 64 kbps 的 MP3 就足够 QQ 语音用，不必追求高码率。

---

## 六、检查有没有配对

启动桥接后打开控制台 <http://127.0.0.1:3100>，或直接问 AI「语音库里有什么」——
它会调 `qq_list_voices`。列表为空通常是这三个原因：

1. 文件扩展名不在支持列表里（例如 `.aiff`、`.mp4`）；
2. 文件在以 `.` 开头的目录/文件名里（会被跳过）；
3. `socialV2.voice.dir` 指到了别的目录（尤其 macOS 上被改成了容器路径）。
