#!/usr/bin/env node
// start-windows.mjs — Windows 启动器：探测 DSH 桌面版的随机端口 → 写回 config.json → 启动桥接。
//
// 为什么 Windows 也需要它：DSH 桌面版每次启动都用随机端口（`--port 0`），而
// `config.json` 里的 `dsh.baseUrl` 是写死的。桥接内部虽然有一套端口自愈，但那段代码
// 走的是 macOS 的 `pgrep + lsof`（见 src/bridge.js 的 rediscoverDshBaseUrl），
// 在 Windows 上拿不到端口 —— 所以 Windows 侧由本脚本用 `netstat -ano` + `tasklist`
// 把端口找出来，再交给桥接。
//
// 用法（在仓库根目录）：
//   node scripts/start-windows.mjs            # 探测端口 → 写回配置 → 启动桥接（前台）
//   node scripts/start-windows.mjs --check    # 只探测、只打印，不启动、不写配置
//
// 如果你用的是 DSH Web 版（端口固定 3080），不需要本脚本，直接 `npm start` 即可。
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');

const log = (msg) => console.log(`[start-windows] ${msg}`);

/** 只认「DSH 自己的 401 页面」：状态码 401 且正文含这句。 */
function probeDsh(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { if (body.length < 4096) body += c; });
      res.on('end', () => resolve(res.statusCode === 401 && body.includes('dsh web authentication required')));
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

/**
 * 解析 `netstat -ano -p TCP` 的输出，返回 [{ port, pid }]。
 *
 * 关键：只取 **LISTENING** 且**绑定在回环地址**的行。Windows 上 DSH 只监听 127.0.0.1，
 * 把它绑到 0.0.0.0 的进程（比如别的开发服务器）不该被误认成 DSH。
 */
export function parseNetstat(out) {
  const rows = [];
  for (const raw of String(out ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // 形如：  TCP    127.0.0.1:58413      0.0.0.0:0      LISTENING       12345
    const m = /^TCP\s+(127\.0\.0\.1|\[::1\]):(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i.exec(line);
    if (!m) continue;
    rows.push({ port: Number(m[2]), pid: Number(m[3]) });
  }
  return rows;
}

/** 解析 `tasklist /FI "PID eq N" /FO CSV /NH` 的一行，返回进程映像名（没有则 null）。 */
export function parseTasklist(out) {
  const line = String(out ?? '').split(/\r?\n/).map((s) => s.trim()).find(Boolean);
  if (!line) return null;
  const m = /^"([^"]+)"/.exec(line);
  return m ? m[1] : null;
}

/** 名字像不像 DSH：`DeepSeek Harness.exe` / `dsh.exe` / `DSH Desktop.exe` 等。 */
const looksLikeDsh = (name) => /deepseek\s*harness|(^|[^a-z])dsh([^a-z]|$)/i.test(String(name ?? ''));

function imageNameOf(pid) {
  try {
    const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
      encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
    return parseTasklist(out);
  } catch {
    return null;
  }
}

/** `netstat -ano -p TCP`，失败返回空串（例如极简系统没有 netstat）。 */
function netstatOutput() {
  try {
    return execFileSync('netstat', ['-ano', '-p', 'TCP'], {
      encoding: 'utf8', timeout: 8000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

async function discoverDshPorts() {
  const rows = parseNetstat(netstatOutput());
  if (!rows.length) return [];
  // 同一个 PID 的多个监听端口都试；进程名过滤放在前面，避免把无关服务也拿去 probe。
  const pidNames = new Map();
  for (const { pid } of rows) {
    if (!pidNames.has(pid)) pidNames.set(pid, imageNameOf(pid));
  }
  const candidates = [...new Set(rows
    .filter(({ pid }) => looksLikeDsh(pidNames.get(pid)))
    .map(({ port }) => port))];
  const alive = [];
  for (const port of candidates) {
    if (await probeDsh(port)) alive.push(port);
  }
  return alive;
}

async function reachable(url) {
  try {
    const u = new URL(url);
    return await probeDsh(Number(u.port) || 80);
  } catch {
    return false;
  }
}

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    log('找不到 config.json —— 先执行：copy config.example.json config.json');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8').replace(/^\uFEFF/, ''));
}

function writeBaseUrl(baseUrl) {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8').replace(/^\uFEFF/, '');
  const cfg = JSON.parse(raw);
  cfg.dsh = { ...(cfg.dsh ?? {}), baseUrl };
  const tmp = `${CONFIG_PATH}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, CONFIG_PATH);
}

async function main() {
  if (process.platform !== 'win32') {
    log(`本脚本是 Windows 专用（当前平台 ${process.platform}）。`);
    log('macOS 请用：node scripts/start-mac.mjs  /  双击 start-mac.command');
    process.exit(2);
  }

  const cfg = readConfig();
  const configured = cfg.dsh?.baseUrl || 'http://127.0.0.1:3080';
  log(`config.json 里的 dsh.baseUrl：${configured}`);

  if (await reachable(configured)) {
    log('这个地址可用，无需探测。');
  } else {
    log('连不上，开始探测 DSH 桌面版的实际端口（netstat + tasklist）…');
    const ports = await discoverDshPorts();
    if (!ports.length) {
      log('没找到正在运行的 DSH 桌面版。');
      log('  · 用 Web 版：确认 config.json 的 dsh.baseUrl 是 http://127.0.0.1:3080 并先启动 DSH');
      log('  · 用桌面版：先打开 DSH 桌面版，再重跑本脚本');
      process.exit(1);
    }
    const baseUrl = `http://127.0.0.1:${ports[0]}`;
    if (checkOnly) {
      log(`探测到可用端口：${baseUrl}（--check 模式，不写入、不启动）`);
      process.exit(0);
    }
    writeBaseUrl(baseUrl);
    log(`已把 dsh.baseUrl 更新为 ${baseUrl} 并写回 config.json`);
  }

  if (checkOnly) process.exit(0);

  log('启动桥接（Ctrl+C 停止）…');
  const child = spawn(process.execPath, [path.join(ROOT, 'src', 'bridge.js')], {
    stdio: 'inherit', cwd: ROOT,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

// 允许直接 `node scripts/start-windows.mjs`；被 import 时只导出解析函数（便于测试）。
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(`[start-windows] 失败：${error?.message ?? error}`);
    process.exit(1);
  });
}
