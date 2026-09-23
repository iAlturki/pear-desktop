@echo off
setlocal
title ytr-music (iALTURKi Edition)

echo ===================================================
echo   ytr-music (iALTURKi Reconstructed Edition)
echo   100%% Ad-Free ^| Super Performance ^| Smooth Audio
echo ===================================================
echo.

:: Kill previous running app instances for this repo to ensure new code loads
echo [*] Terminating stale app instances...
taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /IM "ytr-music.exe" >nul 2>&1
taskkill /F /IM "YouTube Music.exe" >nul 2>&1
taskkill /F /IM "ytr-music-native.exe" >nul 2>&1

:: Move to project directory
cd /d "%~dp0"

echo [*] Starting ytr-music (iALTURKi Edition)...
if exist "native\bin\ytr-music.exe" (
    start "" "native\bin\ytr-music.exe"
) else if exist "pack\win-unpacked\ytr-music.exe" (
    start "" "pack\win-unpacked\ytr-music.exe"
) else if exist "pack\win-unpacked\YouTube Music.exe" (
    start "" "pack\win-unpacked\YouTube Music.exe"
) else if exist "node_modules\electron\dist\electron.exe" (
    start "" "node_modules\electron\dist\electron.exe" .
) else (
    call pnpm.cmd start
)
echo [*] App launched successfully on your screen!


