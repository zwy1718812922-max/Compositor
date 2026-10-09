@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if exist "windows\dist\win-unpacked\Compositor 中文版.exe" (
  start "" "windows\dist\win-unpacked\Compositor 中文版.exe"
  exit /b
)
if exist "windows\dist\Compositor-ZH-0.4.0-x64-Portable.exe" (
  start "" "windows\dist\Compositor-ZH-0.4.0-x64-Portable.exe"
  exit /b
)
echo 未找到打包后的程序。请在 windows 目录运行 npm ci 和 npm start。
pause
