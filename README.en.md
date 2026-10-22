# QQ ↔ DeepSeek Harness Bridge (qq-bridge)

> Connect QQ messages to DeepSeek Harness (DSH) agents: QQ friends/groups become DSH conversations, and agent replies (including questions and tool approvals) are sent back to QQ.
>
> This is a **community edition / derivative** of [Derpyu520/qq-bridge](https://github.com/Derpyu520/qq-bridge) (MIT). The full, authoritative documentation is in Chinese — see **[README.md](README.md)**.

> ⚠️ **Current release `v0.2.0-r4`, targets DSH 0.2.0-rc.2** (verified item by item on that version; run `npm run verify:adaptation`). It uses the persistent local signing key to **mint the session Cookie offline**, slash RPC endpoints and the `/api/remote.mux` event stream — a protocol generation introduced in DSH `0.1.2-alpha.1`, incompatible with the older dot-endpoint protocol. Reading the launch token out of the old guard logs has not worked since DSH 0.1.7 (the token is generated per process and never written to disk). Agent presets are `@deepseek-ai/dsh-agent-preset` Cordis rows since DSH 0.1.7 (the `~/.dsh/.agent-presets/` directory mechanism is gone). On **DSH `0.1.1-rc.2` or earlier**, use tag [`v0.1.0`](https://github.com/Derpyu520/qq-bridge/releases/tag/v0.1.0); for **DSH 0.1.5-rc.1** use [`v0.1.5`](https://github.com/Derpyu520/qq-bridge/releases/tag/v0.1.5); for **DSH 0.1.7-rc.2** use [`v0.1.7`](https://github.com/Derpyu520/qq-bridge/releases/tag/v0.1.7).
>
> **r4 highlights**: sticker/animated-emoji pipeline (CDN first, `emoji_id` fallback, multi-address DNS failover), web search now reuses DSH's own DeepSeek search backend (Bing only as fallback), `qq_wait_for_messages` long-polling past the 300 s undici timeout, plus fixes for the mode-switch rollback, permanent "busy" turns, missing self-identity injection and a full-project audit. Details: [Release v0.2.0-r4](https://github.com/Derpyu520/qq-bridge/releases/tag/v0.2.0-r4).

Documentation index (one line per doc, with "still current?" notes): **[docs/README.md](docs/README.md)**.
Folder layout and `scripts/` naming conventions: **[docs/FOLDER_MAP.md](docs/FOLDER_MAP.md)**.
Permission model and security promises: **[RULES.md](RULES.md)**.

## Two platform editions, one core

Presets, persona cards, console, MCP tools and the voice pipeline are shared. Only the QQ gateway and the
optional voice engine differ:

| | Windows edition | macOS edition |
| --- | --- | --- |
| QQ gateway | **SnowLuma** (official Windows build) | **NapCat** (SnowLuma has no macOS build) |
| Voice engine (optional) | **NVIDIA → CUDA**; AMD / no dGPU → CPU fallback | local GPT-SoVITS (CPU / Apple Silicon) |
| One-click start | `windows\start-all-windows.bat` | `./start-all-mac.command` |
| DSH Desktop random port | `node scripts\start-windows.mjs` | `node scripts/start-mac.mjs` |
| Full guide | **[docs/guides/WINDOWS.md](docs/guides/WINDOWS.md)** ([scripts](windows/README.md)) | **[docs/guides/MACOS_NAPCAT.md](docs/guides/MACOS_NAPCAT.md)** |

Voice is optional: without a local engine the bridge falls back to **edge-tts** (no GPU required).

## Architecture

```
QQ messages ──► QQ gateway (OneBot v11 WS) ──► qq-bridge ──► DSH Web API (127.0.0.1:3080/api)
                                                    ▲                      │
                                                    └── agent replies / questions / approvals ┘
```

The gateway is one of two: **SnowLuma** (Windows/Linux) or **NapCat** (macOS — SnowLuma has no macOS build).
Both speak the same OneBot v11 contract; see [docs/guides/MACOS_NAPCAT.md](docs/guides/MACOS_NAPCAT.md) for the macOS walkthrough.

- **QQ side**: `@snowluma/sdk` provides the OneBot v11 WebSocket client.
- **DSH side**: session Cookie minted from the persistent local signing key, `/api/<namespace>/<method>` slash RPC, and `/api/remote.mux` + `session/follow` event stream. The per-session model is pinned by the bridge via `session.selectModel` from `config.json`'s `dsh.model`.
- **Agent tools**: three bundled MCP servers — a restricted QQ toolset (whitelist-enforced sends, no arbitrary local paths), a read-only host probe (`snowluma_status` only), and a read-only `web_search` / `web_fetch` pair with SSRF protection.
  ⚠️ **`start_snowluma` / `stop_snowluma` were removed in v0.1.5**: SnowLuma EULA §5.4 requires prior written permission to deploy its proprietary native components through automated scripts. This program only probes, never deploys.
- **Console**: a local web console at `http://127.0.0.1:3100` — ten task-based pages (Overview, Sessions & Approvals, Persona, Social v2, Social v1, Slang, Usage & Cost, Access & Security, Operations, Tool Reference), cross-page search, light/dark theme.

## What's in this repo / what's not

**Included** (works right after `git clone`):

| Item | Location |
| --- | --- |
| Bridge core + three MCP servers | `src/` |
| Two agent presets (`qq-chat`, `qq-chat-v2`) | `dsh/agent-presets/` (source) → `plugins/qq-agent-presets/presets/` (generated patches) |
| Persona cards | `roles/*.md` |
| Local console | `public/console.html` |
| DSH plugins (`qq-mode` namespace, preset bundle) | `plugins/` |
| Voice: pre-recorded library + edge-tts + optional local GPT-SoVITS | `src/voice-core.js`, `src/send-voice-lib.js`, `scripts/sing.py` → [docs/guides/VOICE.md](docs/guides/VOICE.md) |
| Install / ops / test scripts | `scripts/` |
| Sanitized config template | `config.example.json` |

**Not included** (never committed):

| Not included | Where you put yours instead |
| --- | --- |
| Chat history, session mappings, logs | generated at runtime in `state/` (gitignored) |
| `config.json` | copy from `config.example.json` and fill in |
| Personal audio | `audio/` (gitignored; see [audio/README.md](audio/README.md)) |
| Any API key / token | **environment variables** or `~/.dsh/.credentials.yaml` |
| The author's internal design/audit docs | not shipped — see the end of [docs/README.md](docs/README.md) |
| DSH / SnowLuma / NapCat / QQ themselves | install them yourself; this project only integrates |

Credentials, in order of preference: (1) environment variables (e.g. `DEEPSEEK_API_KEY`, `FFMPEG_PATH`);
(2) `~/.dsh/.credentials.yaml` — DSH's own credential store, which the bridge reads to mint the session Cookie
offline and to resolve the search key; (3) writing them into `config.json` (plaintext, only if the machine is yours alone).

## Features

- Bridges QQ group/private messages to DSH agent sessions; whitelist/blacklist access control, fail-closed by default.
- Social simulation modes (`reserved` state machine, `reserved2` "everything is a tool" — AI reads/sends/wait/sleeps on its own).
- Media: images and stickers (incl. animated GIFs) via SSRF-protected downloads; sticker library with AI-friendly usage; **voice** in three flavours (library / edge-tts / local GPT-SoVITS clone); singing; drawing.
- QQ social features: QZone feeds/comments/board/likes, friend requests with auto-approve, account dressing (nickname, signature, avatar, posts, online status, group card) — all **owner-private-chat only**, enforced in code.
- Lightweight memory (active topics, pending thoughts, member impressions) and slang/network-expression learning with human confirmation.
- Local console: mode switching, persona management, two prompt layers, DSH reasoning effort, token & cost dashboard, security page, tool reference.

## Requirements

- **Node.js ≥ 22.13**
- A running **DSH** (desktop or web). Web defaults to `http://127.0.0.1:3080`; the desktop build picks a **random port** on every launch.
- A running **QQ gateway**, either **SnowLuma** or **NapCat**, with OneBot v11 WebSocket + HTTP API enabled (defaults `ws://127.0.0.1:3001` / `http://127.0.0.1:3000`).

## Quick Start

| # | Step | Command |
| --- | --- | --- |
| 1 | Check Node | `node -v` ≥ 22.13 |
| 2 | Install deps | `npm install` (postinstall patches the `@snowluma/sdk` ESM bug) |
| 3 | Create config | `cp config.example.json config.json` |
| 4 | Fill gateway + whitelist | `snowluma.wsUrl` / `httpUrl` / `accessToken`, `ownerQQ`, `allow.private` / `allow.groups` |
| 5 | **Install the DSH side** | `node scripts/setup-dsh.mjs` — **desktop build: `node scripts/setup-dsh.mjs desktop`** (profile name is `desktop`, not the default `web`) |
| 6 | **Restart DSH** | presets and MCP servers only load at DSH start |
| 7 | Start the gateway | SnowLuma: `launcher.bat` → WebUI QR login. NapCat: `/Applications/QQ.app/Contents/MacOS/QQ --no-sandbox` |
| 8 | Start the bridge | `npm start` (or `start.bat` for guard mode). **DSH desktop**: `node scripts/start-mac.mjs` (probes the port and writes it back first); macOS all-in-one: `./start-all-mac.command` |
| 9 | Open the console | <http://127.0.0.1:3100>, token in `state/console-token`; set `ownerQQ` and the whitelist on the "Access & Security" page |
| 10 | Verify | Private-message the bot from your own QQ — a reply should arrive within seconds |

Two behaviours you must know:

- **The whitelist is fail-closed**: empty `allow.private` / `allow.groups` with `allowAllWhenEmpty: false` (the template default) means the bridge **ignores every message**. That is intentional.
- **Skipping step 5 looks like "no reaction"**: the bridge won't crash, but group/simulation sessions are **refused** because the `qq-chat` preset is missing (log: `⛔ 群聊/仿真会话缺少 preset …`). Intentional fail-closed — a QQ session must never fall back to the default preset with bash/file tools.

Key settings:

| Field | Description |
| --- | --- |
| `dsh.baseUrl` | DSH Web API URL, default `http://127.0.0.1:3080` |
| `dsh.authToken` | Normally **leave empty**: the bridge mints the session cookie offline from `~/.dsh/.credentials.yaml` |
| `dsh.provider` / `dsh.model` / `dsh.reasoningEffort` | Model and reasoning effort per session |
| `snowluma.wsUrl` / `httpUrl` | OneBot **WebSocket** and **HTTP API** URLs — do not point `httpUrl` at the WS port (HTTP 426) |
| `snowluma.accessToken` | OneBot access token, leave empty if not configured |
| `snowluma.followDiscoveredEndpoint` | `true` for SnowLuma endpoint self-healing; set `false` for NapCat or a second instance |
| `ownerQQ` | Administrator QQ (highest privilege) |
| `allow.private` / `allow.groups` | Whitelist of QQ/group IDs |
| `consolePort` / `consoleToken` | Local console port (default `3100`) and access token |

## DSH Setup

The bridge and console can run without extra DSH setup, but the two DSH chat presets (`qq-chat`, `qq-chat-v2`) and the MCP servers must be installed into DSH once per machine:

```bash
node scripts/setup-dsh.mjs           # DSH web build → profile "web"
node scripts/setup-dsh.mjs desktop   # DSH desktop build → profile "desktop"
```

This installs the `qq-agent-presets` bundle (two `@deepseek-ai/dsh-agent-preset` rows + the shared `qq-tool-restrict` guard), the MCP entries in `~/.dsh/profiles/<profile>/cordis.patch.yml`, the plugin bundles in the profile `package.json`, and sets the default mode to `reserved2`. Then restart DSH. Details: [docs/guides/DSH_SETUP.md](docs/guides/DSH_SETUP.md).

## macOS

SnowLuma has no macOS build, so use **NapCat**. Also note the DSH desktop build binds a **random port** on each launch, so the bridge must be started through `scripts/start-mac.mjs` (it probes the port and rewrites `dsh.baseUrl`) — plain `npm start` would reuse a stale port and get a 401.

Full walkthrough (NapCat installer, App Management/TCC permission, OneBot config, known degradations, rollback): **[docs/guides/MACOS_NAPCAT.md](docs/guides/MACOS_NAPCAT.md)**.

## Voice

Three independent paths — a pre-recorded library in `audio/`, on-the-fly `edge-tts` synthesis, and an optional
local **GPT-SoVITS** zero-shot voice clone (`ttsBackend`: `edge` / `gsv` / `auto`, GSV on port `9881`).
All fields, setup, reference-audio guidance and troubleshooting: **[docs/guides/VOICE.md](docs/guides/VOICE.md)**.

> AI voice output is **off by default** (`socialV2.voice.enabled` and `socialV2.tools.sendVoice`). Incoming voice
> messages still show as placeholder text (no speech-to-text).

## Security Notes

- `config.json` and `state/` are **never committed**; the repository only ships `config.example.json`.
- MCP send tools enforce whitelist checks and reject CQ-code injection; the AI can only send files from the voice library, never arbitrary paths, URLs or base64.
- Local paths, credentials, tokens and other sensitive patterns are filtered by the audit layer before anything is sent to QQ.
- Simulation sessions get **no local execution tools at all**: the preset's `qq-tool-restrict` row hides them at registration time and a runtime allowlist rejects anything outside the QQ MCP namespaces (`npm run scan:tool-names` re-checks that list against the installed DSH).
- The console generates a token when none is configured; account-dressing and friend-management tools are hard-restricted to the owner's private chat.
- Run `npm run privacy-scan` before publishing or forking — see [docs/guides/PRIVACY.md](docs/guides/PRIVACY.md).

## Repository Layout

```
qq-bridge/
  README.md / README.en.md / RULES.md   # the only docs at the root
  config.example.json   # sanitized config template (real config.json is not in repo)
  docs/
    README.md           # documentation index
    FOLDER_MAP.md       # folder layout and scripts/ naming conventions
    guides/             # DSH_SETUP / MACOS_NAPCAT / VOICE / TOKEN_USAGE_CONSOLE
                        # CONSOLE-UI-TESTING / SECURITY_BASELINE / DSH_020_ADAPTATION / PRIVACY
  audio/                # voice library (gitignored; only audio/README.md ships)
  dsh/agent-presets/    # qq-chat / qq-chat-v2 preset sources
  plugins/              # qq-agent-presets (bundle) + qq-mode-console (settings namespace)
  public/console.html   # local web console
  roles/                # persona cards
  assets/               # images (the intro video ships as a release asset)
  src/                  # bridge core and MCP servers
  scripts/              # install / test / ops scripts
  state/                # runtime data (not in repo)
```

> This repo does **not** contain `docs/design/`, `docs/research/`, `docs/audits/`, `docs/legacy/` or
> `docs/guides/PROJECT_GUIDE.md` — those are the author's local development/audit artifacts.
> The standalone voice GUI tool (`../voice-tool/`) is not part of this repo and its npm scripts have been removed;
> use `npm run send-voice` or the MCP tools `qq_send_voice` / `qq_say_voice` / `qq_sing_song`
> (implementation in `src/voice-core.js` and `src/send-voice-lib.js`).

## Testing

`npm run test:audit` runs isolated regression tests without production credentials, DSH, or QQ messages.

```bash
npm run self-test       # DSH-side link test, no QQ/SnowLuma required
npm run test-md
npm run test-wait
npm run test-vision
npm run test-forward
npm run test-slang
npm run test-stickers
npm run test-voice
npm run verify:adaptation   # DSH adaptation checks (needs a running DSH for the live part)
```

After upgrading, legacy QQ session mappings without permission metadata are recreated once. Mode or preset changes also retire the old mapping and recreate the session on the next message; DSH history is retained.

## Compliance

SnowLuma is an independent third-party project and is not affiliated with Tencent/QQ. This project is for learning and technical research only; please follow the relevant terms and the QQ User Agreement.

## Acknowledgements & Upstream

This project is a derivative of **[Derpyu520/qq-bridge](https://github.com/Derpyu520/qq-bridge)**, released under the
**MIT License**; the [LICENSE](LICENSE) at the repository root retains the original copyright notice and terms.

- Upstream: <https://github.com/Derpyu520/qq-bridge> (this edition is based on `v0.2.0-r4`, targeting DSH `0.2.0-rc.2`)
- Changes in this edition: **macOS / NapCat support** (no SnowLuma build for macOS), the **three voice paths**
  (library + edge-tts + local GPT-SoVITS clone), **QZone / friend-request / account-dressing tools**, **drawing**,
  the **persona-card system** and the "little whale / friends" persona set, plus **sanitization and documentation cleanup**
  for community release.

Upstream authors and contributors did the vast majority of the design and implementation; this edition only adds
incremental adaptations and release packaging.
