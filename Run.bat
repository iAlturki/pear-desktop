@echo off
setlocal
title ytr-music (iALTURKi Edition)

echo ===================================================
echo   ytr-music (iALTURKi Reconstructed Edition)
echo   100%% Ad-Free ^| Super Performance ^| Smooth Audio
echo ===================================================
echo.

:: Kill previous running electron instances for this repo to ensure new code loads
echo [*] Terminating stale app instances...
taskkill /F /IM electron.exe >nul 2>&1

:: Move to project directory
cd /d "%~dp0"

:: Check for node_modules
if not exist "node_modules" (
    echo [*] Installing dependencies with pnpm...
    call pnpm.cmd install
)

:: Check if dist exists, build if missing
if not exist "dist\main\index.js" (
    echo [*] Building application bundles...
    call pnpm.cmd build
)

echo [*] Starting ytr-music (iALTURKi Edition)...
if exist "node_modules\electron\dist\electron.exe" (
    start "" "node_modules\electron\dist\electron.exe" .
) else (
    call pnpm.cmd start
)
echo [*] App launched successfully on your screen!

