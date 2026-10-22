# ================================================================
#  check-env.ps1 -- Windows environment check for qq-bridge
#
#  Run it from the repo root:
#      powershell -ExecutionPolicy Bypass -File windows\check-env.ps1
#
#  It only READS: no install, no download, no config change.
# ================================================================

$ErrorActionPreference = 'SilentlyContinue'
$ok = 0; $warn = 0

function Test-Item([string]$name, [bool]$pass, [string]$detail) {
    if ($pass) {
        Write-Host ("[OK]   " + $name + "  " + $detail) -ForegroundColor Green
        $script:ok++
    } else {
        Write-Host ("[!!]   " + $name + "  " + $detail) -ForegroundColor Yellow
        $script:warn++
    }
}

Write-Host ""
Write-Host "=== 1. Runtime prerequisites ===" -ForegroundColor Cyan

$node = (Get-Command node -ErrorAction SilentlyContinue)
if ($node) {
    $nv = (& node -v) 2>$null
    $major = 0
    if ($nv -match 'v(\d+)') { $major = [int]$Matches[1] }
    Test-Item "Node.js" ($major -ge 22) ("found " + $nv + "  (need >= 22.13)")
} else {
    Test-Item "Node.js" $false "not found -- install Node.js 22 LTS from nodejs.org"
}

$npm = (Get-Command npm -ErrorAction SilentlyContinue)
Test-Item "npm" ([bool]$npm) $(if ($npm) { "found" } else { "not found" })

$py = (Get-Command python -ErrorAction SilentlyContinue)
if (-not $py) { $py = (Get-Command py -ErrorAction SilentlyContinue) }
if ($py) {
    $pv = (& python --version 2>&1)
    Test-Item "Python (voice)" $true ("found " + $pv + "  (only needed for edge-tts / GPT-SoVITS)")
    $edge = (& python -c "import edge_tts; print('yes')" 2>$null)
    Test-Item "edge-tts module" ($edge -eq 'yes') $(if ($edge -eq 'yes') { "installed" } else { "missing -- pip install edge-tts  (optional)" })
} else {
    Test-Item "Python (voice)" $false "not found -- voice needs Python + edge-tts (optional)"
}

$ff = (Get-Command ffmpeg -ErrorAction SilentlyContinue)
Test-Item "ffmpeg (voice)" ([bool]$ff) $(if ($ff) { "found" } else { "not found -- needed for voice volume/pitch (optional)" })

Write-Host ""
Write-Host "=== 2. GPU (for the local GPT-SoVITS engine) ===" -ForegroundColor Cyan
$nv = (Get-Command nvidia-smi -ErrorAction SilentlyContinue)
if ($nv) {
    $gpuName = (& nvidia-smi --query-gpu=name --format=csv,noheader 2>$null | Select-Object -First 1)
    Test-Item "NVIDIA GPU" $true ("found: " + $gpuName + "  -> use windows\start-gsv-nvidia.bat")
} else {
    $vc = Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name
    Write-Host ("[--]   no nvidia-smi. Video adapters: " + ($vc -join ' | ')) -ForegroundColor Gray
    if (($vc -join ' ') -match 'AMD|Radeon') {
        Test-Item "AMD GPU" $false "AMD detected -> windows\start-gsv-amd.bat (CPU mode; ROCm has no official Windows build)"
    } else {
        Test-Item "GPU" $false "no GPU detected -> windows\start-gsv-amd.bat (CPU mode) or use edge-tts"
    }
}

Write-Host ""
Write-Host "=== 3. Services and ports ===" -ForegroundColor Cyan

function Test-Port([int]$port) {
    $res = Test-NetConnection -ComputerName 127.0.0.1 -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue
    return [bool]$res
}

Test-Item "OneBot HTTP 3000 (SnowLuma)" (Test-Port 3000) $(if (Test-Port 3000) { "listening" } else { "not listening -- start SnowLuma" })
Test-Item "OneBot WS   3001 (SnowLuma)" (Test-Port 3001) $(if (Test-Port 3001) { "listening" } else { "not listening -- enable WebSocket in SnowLuma" })
Test-Item "DSH Web     3080" (Test-Port 3080) $(if (Test-Port 3080) { "listening" } else { "not listening -- start DSH, or set dsh.baseUrl in config.json" })
Test-Item "qq-bridge console 3100" (Test-Port 3100) $(if (Test-Port 3100) { "listening -- bridge already running" } else { "not listening -- start the bridge" })
Test-Item "GPT-SoVITS 9881" (Test-Port 9881) $(if (Test-Port 9881) { "listening" } else { "not listening -- optional, edge-tts is the fallback" })

Write-Host ""
Write-Host "=== 4. This repo ===" -ForegroundColor Cyan
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Test-Item "config.json" (Test-Path (Join-Path $root 'config.json')) $(if (Test-Path (Join-Path $root 'config.json')) { "present" } else { "missing -- copy config.example.json to config.json" })
Test-Item "node_modules" (Test-Path (Join-Path $root 'node_modules')) $(if (Test-Path (Join-Path $root 'node_modules')) { "installed" } else { "missing -- run: npm install" })
$cfgPath = Join-Path $root 'config.json'
if (Test-Path $cfgPath) {
    try {
        $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
        $wl = ($cfg.allow.private.Count + $cfg.allow.groups.Count)
        Test-Item "whitelist" ($wl -gt 0) $(if ($wl -gt 0) { "configured ($wl entries)" } else { "EMPTY -- the bridge will ignore every message (fail-closed by design)" })
        Test-Item "ownerQQ" ([bool]$cfg.ownerQQ) $(if ($cfg.ownerQQ) { "set" } else { "not set -- owner-only tools stay disabled" })
        Test-Item "dsn baseUrl" $true ($cfg.dsh.baseUrl)
    } catch {
        Test-Item "config.json" $false "cannot parse -- check the JSON syntax"
    }
}

Write-Host ""
Write-Host ("Summary: " + $ok + " ok, " + $warn + " to look at") -ForegroundColor Cyan
Write-Host "Install walkthrough: docs\guides\WINDOWS.md" -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter to close"
