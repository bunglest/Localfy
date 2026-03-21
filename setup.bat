@echo off
setlocal EnableDelayedExpansion
title Localfy Setup
cd /d "%~dp0"

echo.
echo   LOCALFY — Setup
echo   ===============================
echo.

REM ── Check Node.js ─────────────────────────────────────────────────────────
echo [1/3] Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo   ERROR: Node.js was not found on your system.
    echo.
    echo   Please download and install Node.js LTS from:
    echo   https://nodejs.org
    echo.
    echo   After installing, close this window and run setup.bat again.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>^&1') do set NODEVER=%%v
echo   OK  Node.js %NODEVER%

REM ── Check npm ─────────────────────────────────────────────────────────────
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo   ERROR: npm not found. Please reinstall Node.js.
    pause
    exit /b 1
)
echo   OK  npm found

echo.
echo [2/3] Installing packages (first time may take 1-2 minutes)...
echo.

call npm install 2>&1
if %errorlevel% neq 0 (
    echo.
    echo   ERROR: npm install failed!
    echo.
    echo   Common fixes:
    echo     - Check your internet connection
    echo     - Try running as Administrator
    echo     - Delete the node_modules folder if it exists, then try again
    echo.
    pause
    exit /b 1
)

echo.
echo   OK  Packages installed

REM ── Check yt-dlp ──────────────────────────────────────────────────────────
echo.
echo [3/3] Checking yt-dlp...
where yt-dlp >nul 2>&1
if %errorlevel% neq 0 (
    echo   NOTICE: yt-dlp not found in PATH.
    echo.
    echo   yt-dlp is required to download songs.
    echo   Install it with:   winget install yt-dlp
    echo   Or download from:  https://github.com/yt-dlp/yt-dlp/releases
    echo.
    echo   After installing yt-dlp, you can still launch Localfy —
    echo   the Downloads page will warn you until yt-dlp is found.
    echo.
) else (
    for /f "tokens=*" %%v in ('yt-dlp --version 2^>^&1') do set YTVER=%%v
    echo   OK  yt-dlp %YTVER%
)

echo.
echo   =========================================
echo    Setup complete!
echo.
echo    To launch Localfy:  double-click start.bat
echo    Or run:             npm run dev
echo.
echo    Before first launch, get a Spotify Client ID:
echo      1. https://developer.spotify.com/dashboard
echo      2. Create an app (any name)
echo      3. Add redirect URI: http://localhost:8888/callback
echo      4. Copy Client ID — paste it when Localfy opens
echo   =========================================
echo.
pause
