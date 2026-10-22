#!/usr/bin/env node
// macOS 启动器：先找到「正在运行」的 DSH 桌面版 Web 服务端口，再把 config.json 的
// dsh.baseUrl 改对，最后启动桥接。
//
// 为什么需要这一步：DSH 桌面版（Electron）启动桌面 profile 时固定传
//   --host 127.0.0.1 --port 0
// 即端口由操作系统随机分配，每次重启 DSH 都会变（见 app.asar 里
// dsh-desktop-host/lib/index.js 的 args）。而桥接既是靠 dsh.baseUrl 连 DSH，又是用
// ~/.dsh/.credentials.yaml 的签名密钥「离线铸造」带 authority 的会话 Cookie ——
// authority 对不上就会 401。所以启动桥接前必须把当前端口写回 config.json。
//
// 用法：
//   node scripts/start-mac.mjs          # 探测端口 → 写 config.json → 前台启动桥接
//   node scripts/start-mac.mjs --check  # 只探测并打印，不改配置、不启动
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CONFIG = path.join(REPO_ROOT, 'config.json');

function log(msg) {
  console.log(`[start-mac] ${msg}`);
}

function dshDesktopPids() {
  const out = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' });
  const pids = [];
  for (const line of out.split('\n')) {
    if (!/dsh-desktop-host\/lib\/index\.js/.test(line)) continue;
    if (/Helper/.test(line)) continue;
    const m = /^\s*(\d+)\s/.exec(line);
    if (m) pids.push(Number(m[1]));
  }
  return pids;
}

function listeningPorts(pid) {
  let out;
  try {
    out = execFileSync('lsof', ['-nP', '-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN', '-Fn'], { encoding: 'utf8' });
  } catch {
    return [];
  }
  const ports = [];
  for (const line of out.split('\n')) {
    const m = /^n127\.0\.0\.1:(\d+)$/.exec(line.trim());
    if (m) ports.push(Number(m[1]));
  }
  return [...new Set(ports)];
}

function probeDshWeb(port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { if (body.length < 4096) body += chunk; });
      res.on('end', () => resolve(res.statusCode === 401 && body.includes('dsh web authentication required')));
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

async function findDshPort() {
  const pids = dshDesktopPids();
  if (pids.length === 0) {
    throw new Error('没有找到正在运行的 DSH 桌面版进程（DeepSeek Harness）。请先打开 DSH 桌面版。');
  }
  for (const pid of pids) {
    for (const port of listeningPorts(pid)) {
      if (await probeDshWeb(port)) return { pid, port };
    }
  }
  throw new Error(`找到了 DSH 进程（PID ${pids.join(', ')}），但没有探测到 Web 服务端口（/ 返回 dsh web authentication required）。`);
}

function updateConfig(port) {
  const original = fs.readFileSync(CONFIG, 'utf8');
  const cfg = JSON.parse(original);
  cfg.dsh = cfg.dsh ?? {};
  cfg.dsh.baseUrl = `http://127.0.0.1:${port}`;
  const next = `${JSON.stringify(cfg, null, 2)}\n`;
  if (next !== original) {
    fs.writeFileSync(CONFIG, next, 'utf8');
    log(`config.json dsh.baseUrl 已更新为 http://127.0.0.1:${port}`);
  } else {
    log(`config.json dsh.baseUrl 已是 http://127.0.0.1:${port}`);
  }
}

const { pid, port } = await findDshPort();
log(`DSH 桌面版：PID ${pid}，Web 服务 http://127.0.0.1:${port}`);

if (process.argv.includes('--check')) {
  log('--check：只探测，不修改配置、不启动桥接');
  process.exit(0);
}

updateConfig(port);

log('启动 qq-bridge ...');
const child = spawn(process.execPath, [path.join(REPO_ROOT, 'src', 'bridge.js')], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code, signal) => {
  log(`桥接退出（code=${code ?? 'null'}${signal ? `, signal=${signal}` : ''}）`);
  process.exit(code ?? 0);
});
