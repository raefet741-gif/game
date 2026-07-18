@echo off
REM ============================================================
REM   SPILL - one-click launcher (Windows)
REM   Double-click this file to start the game server.
REM ============================================================
title SPILL - Truth or Dare
cd /d "%~dp0"

REM --- Check that Node.js is installed ---
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [X] Node.js was not found on this PC.
  echo       Install it from https://nodejs.org  then run this file again.
  echo.
  pause
  exit /b 1
)

REM --- Install dependencies the first time only ---
if not exist "node_modules" (
  echo.
  echo   Installing dependencies for the first time... please wait.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   [X] npm install failed. Check your internet connection and try again.
    echo.
    pause
    exit /b 1
  )
)

REM --- Open the game in the default browser (server prints the Wi-Fi link too) ---
start "" "http://localhost:3000"

REM --- Start the server (this window stays open while the game runs) ---
echo.
echo   Starting SPILL... keep this window open while you play.
echo   Close this window to stop the game.
echo.
node server/index.js

pause
