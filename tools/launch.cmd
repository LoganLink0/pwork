@echo off
rem ============================================================
rem PWORK launcher - start local dev server and open browser
rem Port 5273 is PWORK's dedicated port (FUPAN uses 5173/5174).
rem Works both as repo file (tools\launch.cmd) and inside the
rem IExpress-packaged PWORK-Launcher.exe (temp extract dir).
rem ============================================================
setlocal
set PORT=5273
set APPDIR=%~dp0app
if not exist "%APPDIR%\package.json" set APPDIR=E:\AIPROJECT-GLM\PWORK\app

rem already running? just open the browser
netstat -ano | findstr /C:":%PORT% " | findstr /C:"LISTENING" >nul 2>&1
if not errorlevel 1 goto open

start "PWORK dev" /min cmd /c "cd /d ""%APPDIR%"" && npx vite --port %PORT% --strictPort"

set /a TRIES=0
:wait
ping -n 2 127.0.0.1 >nul
curl -s -o nul http://127.0.0.1:%PORT%/
if not errorlevel 1 goto open
set /a TRIES+=1
if %TRIES% lss 30 goto wait

echo PWORK dev server failed to start (port %PORT%).
echo Check that node_modules exists: cd /d "%APPDIR%" ^&^& npm install
pause
exit /b 1

:open
start "" "http://127.0.0.1:%PORT%"
exit /b 0
