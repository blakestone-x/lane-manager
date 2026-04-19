@echo off
REM Lane Manager launcher for Windows.
REM Double-click this to launch, or copy a shortcut to your desktop.

setlocal

REM Move to the repo root (parent of scripts/)
cd /d "%~dp0.."

REM Ensure API key is set
if "%ANTHROPIC_API_KEY%"=="" (
  echo ERROR: ANTHROPIC_API_KEY is not set.
  echo Set it in System Environment Variables, or create a .env.bat next to this file:
  echo     @echo off
  echo     set ANTHROPIC_API_KEY=sk-ant-...
  if exist ".env.bat" call .env.bat
)

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
