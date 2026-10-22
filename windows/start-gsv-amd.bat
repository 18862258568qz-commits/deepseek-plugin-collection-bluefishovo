@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."

rem ================================================================
rem  GPT-SoVITS local voice engine  --  AMD GPU / no GPU (CPU mode)
rem
rem  Why CPU: GPT-SoVITS ships no official ROCm build for Windows
rem  consumer cards. This script therefore runs on CPU, which works
rem  everywhere but is slower (about 4-10s per short sentence on a
rem  modern desktop CPU).
rem
rem  Faster alternatives (see docs\guides\WINDOWS.md):
rem    * Linux + ROCm      -> real AMD GPU acceleration
rem    * community ZLUDA   -> CUDA calls translated to AMD; if it works,
rem                           set GSV_DEVICE=cuda and this script will use
rem                           the CUDA config instead
rem
rem  Voice is optional: without this engine the bridge falls back to
rem  edge-tts automatically, so nothing breaks.
rem ================================================================

if "%GSV_DIR%"=="" set "GSV_DIR=%USERPROFILE%\gpt-sovits"
if "%GSV_PORT%"=="" set "GSV_PORT=9881"
if "%GSV_DEVICE%"=="" set "GSV_DEVICE=cpu"

if "%GSV_DEVICE%"=="cuda" (
  set "CFG_NAME=tts_infer_v2proplus_cuda.yaml"
) else (
  set "CFG_NAME=tts_infer_v2proplus_cpu.yaml"
)

if not exist "%GSV_DIR%\api_v2.py" (
  echo [gsv] GPT-SoVITS not found at: %GSV_DIR%
  echo [gsv] Download the official integrated package, or clone the repo, then:
  echo [gsv]     set GSV_DIR=D:\GPT-SoVITS
  echo [gsv] Full walkthrough: docs\guides\WINDOWS.md  ^(AMD / CPU section^)
  pause
  exit /b 1
)

set "PY="
if exist "%GSV_DIR%\runtime\python.exe" set "PY=%GSV_DIR%\runtime\python.exe"
if not defined PY if exist "%GSV_DIR%\venv\Scripts\python.exe" set "PY=%GSV_DIR%\venv\Scripts\python.exe"
if not defined PY set "PY=python"

if not exist "%GSV_DIR%\GPT_SoVITS\configs\%CFG_NAME%" (
  copy /y "windows\gsv\%CFG_NAME%" "%GSV_DIR%\GPT_SoVITS\configs\%CFG_NAME%" >nul
  echo [gsv] installed config template: GPT_SoVITS\configs\%CFG_NAME%
)

echo [gsv] GPT-SoVITS dir : %GSV_DIR%
echo [gsv] python         : %PY%
echo [gsv] config         : GPT_SoVITS\configs\%CFG_NAME%  ^(device: %GSV_DEVICE%^)
echo [gsv] endpoint       : http://127.0.0.1:%GSV_PORT%
echo [gsv] note: CPU inference is slower but needs no GPU/driver setup.
echo [gsv] loading models on first start, this can take 30-60 seconds...
echo.

"%PY%" api_v2.py -a 127.0.0.1 -p %GSV_PORT% -c GPT_SoVITS/configs/%CFG_NAME%

echo.
echo [gsv] engine exited. Troubleshooting:
echo [gsv]   - Python too old?   GPT-SoVITS needs Python 3.10 (3.9-3.11 usually fine)
echo [gsv]   - missing modules?  pip install -r requirements.txt inside the GSV folder
echo [gsv]   - voice not needed? just skip this script, edge-tts is the fallback
pause
