@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules call npm ci
if errorlevel 1 exit /b 1
call npm run build
if errorlevel 1 exit /b 1
set HOST=0.0.0.0
echo Open http://127.0.0.1:4173/ on this laptop.
echo Press Ctrl+C in this window to stop DoorRelay.
call npm start
