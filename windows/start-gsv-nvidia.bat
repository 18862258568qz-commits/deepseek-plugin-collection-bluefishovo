@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."

rem ================================================================
rem  GPT-SoVITS local voice engine  --  NVIDIA GPU (CUDA)
rem
rem  Override with environment variables if your paths differ:
rem      set GSV_DIR=D:\GPT-SoVITS
rem      set GSV_PORT=9881
rem
rem  The bridge reads socialV2.voice.gsv.url (default http://127.0.0.1:9881),
rem  so keep GSV_PORT in sync with config.json.
rem ================================================================

if "%GSV_DIR%"=="" set "GSV_DIR=%USERPROFILE%\gpt-sovits"
if "%GSV_PORT%"=="" set "GSV_PORT=9881"
set "CFG_NAME=tts_infer_v2proplus_cuda.yaml"

if not exist "%GSV_DIR%\api_v2.py" (
  echo [gsv] GPT-SoVITS not found at: %GSV_DIR%
  echo [gsv] Download the official integrated package, or clone the repo, then:
  echo [gsv]     set GSV_DIR=D:\GPT-SoVITS
  echo [gsv] Full walkthrough: docs\guides\WINDOWS.md  ^(NVIDIA section^)
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
echo [gsv] config         : GPT_SoVITS\configs\%CFG_NAME%  ^(device: cuda^)
echo [gsv] endpoint       : http://127.0.0.1:%GSV_PORT%
echo [gsv] loading models on first start, this can take 30-60 seconds...
echo.

"%PY%" api_v2.py -a 127.0.0.1 -p %GSV_PORT% -c GPT_SoVITS/configs/%CFG_NAME%

echo.
echo [gsv] engine exited. Troubleshooting:
echo [gsv]   - no NVIDIA driver?      run: nvidia-smi
echo [gsv]   - CPU-only PyTorch?      see docs\guides\WINDOWS.md (NVIDIA section)
echo [gsv]   - CUDA out of memory?    set is_half: false in the config file
echo [gsv]   - no GPU at all?         use windows\start-gsv-amd.bat (CPU mode)
pause
