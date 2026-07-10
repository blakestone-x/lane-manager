@echo off
REM Lane Manager launcher for Windows.
REM Double-click this to launch, or copy a shortcut to your desktop.
REM No API key needed: lanes authenticate through your Claude Code login.

setlocal

REM Move to the repo root (parent of scripts/)
cd /d "%~dp0.."

REM Build if dist missing
if not exist "dist\index.js" (
  echo Building...
  call npm install --silent
  call npm run build --silent
)

REM Launch
node dist\index.js %*

REM Keep window open on error
if errorlevel 1 pause
