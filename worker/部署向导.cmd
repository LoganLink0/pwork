@echo off
rem ASCII-only launcher: all logic lives in scripts\deploy-wizard.mjs (UTF-8 safe)
chcp 65001 >nul
title PWORK Cloud Deploy Wizard
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo [X] Node.js not found. Please install Node.js 20+ from https://nodejs.org/
  pause
  exit /b 1
)
node scripts\deploy-wizard.mjs %*
pause
