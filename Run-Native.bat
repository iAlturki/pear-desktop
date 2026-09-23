@echo off
setlocal
title ytr-music (iALTURKi Native C++ Edition)

echo ========================================================
echo   ytr-music Native (iALTURKi Reconstructed Edition)
echo   Pure C++ Win32 ^| Ultra-Lightweight ^| Sub-1MB Footprint
echo ========================================================
echo.

cd /d "%~dp0"

:: Terminate any stale instances
taskkill /F /IM "YouTube Music.exe" >nul 2>&1
taskkill /F /IM "ytr-music-native.exe" >nul 2>&1

:: Check if native binary exists, compile if missing
if not exist "native\bin\YouTube Music.exe" (
    echo [*] Compiling native C++ client...
    call native\build.bat
)

echo [*] Launching ytr-music Native Edition...
start "" "native\bin\YouTube Music.exe"
echo [*] App running on your screen with extreme native speed!
echo.
