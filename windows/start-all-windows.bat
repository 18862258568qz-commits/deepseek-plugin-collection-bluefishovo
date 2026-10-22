@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."

rem ================================================================
rem  One-click start for Windows
rem   1) SnowLuma  (QQ gateway, OneBot v11)
rem   2) GPT-SoVITS voice engine  (optional, only if GSV_AUTOSTART=1)
rem   3) qq-bridge (this repo)
rem
rem  Optional environment variables:
rem    SNOWLUMA_HOME  folder that contains launcher.bat
rem                   default: %USERPROFILE%\SnowLuma
rem    GSV_DIR        GPT-SoVITS folder (needed only for GSV_AUTOSTART)
rem    GSV_AUTOSTART  set to 1 to launch the voice engine as well
rem
rem  If you use DSH Desktop (random port each launch) instead of DSH Web,
rem  run:  node scripts\start-windows.mjs   instead of this file.
rem ================================================================

if "%SNOWLUMA_HOME%"=="" set "SNOWLUMA_HOME=%USERPROFILE%\SnowLuma"

echo [start-all] checking SnowLuma...
if exist "%SNOWLUMA_HOME%\launcher.bat" (
  echo [start-all] launching SnowLuma from %SNOWLUMA_HOME%
  start "" "%SNOWLUMA_HOME%\launcher.bat"
  echo [start-all] waiting for the OneBot HTTP API on 127.0.0.1:3000 ...
  set "READY="
  for /l %%i in (1,1,30) do (
    if not defined READY (
      curl -s -m 1 http://127.0.0.1:3000/get_login_info 2>nul | findstr /c:"\"status\":\"ok\"" >nul && set "READY=1"
      if not defined READY timeout /t 1 /nobreak >nul
    )
  )
  if defined READY (
    echo [start-all] OneBot API is ready.
  ) else (
    echo [start-all] WARNING: OneBot API not ready after 30s.
    echo [start-all]          Finish the SnowLuma setup in its WebUI, then check again.
    echo [start-all]          The bridge will keep retrying in the background.
  )
) else (
  echo [start-all] SnowLuma not found at: %SNOWLUMA_HOME%
  echo [start-all] Start your own gateway first ^(OneBot WS 3001 / HTTP 3000^),
  echo [start-all] or set SNOWLUMA_HOME to the folder containing launcher.bat.
)

if not "%GSV_AUTOSTART%"=="1" goto :bridge
if not exist "%GSV_DIR%\api_v2.py" (
  echo [start-all] GSV_AUTOSTART=1 but GPT-SoVITS not found at "%GSV_DIR%"
  echo [start-all] skipping the voice engine; edge-tts is used as fallback.
) else (
  echo [start-all] launching GPT-SoVITS voice engine in a new window...
  start "GPT-SoVITS" cmd /c "windows\start-gsv-nvidia.bat"
)

:bridge
echo.
echo [start-all] starting qq-bridge ^(Ctrl+C to stop^)...
echo [start-all] console: http://127.0.0.1:3100
echo.
call start.bat
