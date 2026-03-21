@echo off
setlocal EnableDelayedExpansion
title Localfy
cd /d "%~dp0"

REM Check that npm install has been run
if not exist "node_modules" (
    echo.
    echo   node_modules not found — running setup first...
    echo.
    call setup.bat
    if %errorlevel% neq 0 exit /b 1
)

echo.
echo   Starting Localfy...
echo   (A browser window will open briefly for Spotify login on first launch)
echo.

npm run dev

REM If npm run dev exits with an error, pause so user can see it
if %errorlevel% neq 0 (
    echo.
    echo   Localfy exited with an error (code %errorlevel%).
    echo   Check the output above for details.
    echo.
    pause
)
