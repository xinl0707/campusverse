@echo off
setlocal enabledelayedexpansion

REM Schedule Analyzer System - Auto Start Script

REM Get current directory
cd /d "%~dp0"

REM Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js not found!
    echo Please install from https://nodejs.org
    pause
    exit /b 1
)

REM Check package.json
if not exist "package.json" (
    echo package.json not found!
    pause
    exit /b 1
)

REM Create .env if missing
if not exist ".env" (
    echo MIMO_API_KEY=your_api_key_here>.env
    echo PORT=3000>>.env
    echo.#Important:Replace with API Key>>.env
    echo.#Get key from project docs>>.env
)

REM Install deps if needed
if not exist "node_modules" call npm install

REM Start server in background and open browser
start http://localhost:3000/tools/
node server.js
