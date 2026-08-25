@echo off
chcp 65001 > nul
title HomeSpark GeMo 一括終了

echo ========================================================
echo   HomeSpark GeMo - 全プロセス一括終了
echo ========================================================
echo.
echo 実行中のすべての HomeSpark 関連プロセスを終了しています...
echo.

:: Kill processes using ports 8080, 8008, 3000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8008') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /f /pid %%a >nul 2>&1

:: Kill Electron & Node processes if any
taskkill /f /im HomeSpark.exe >nul 2>&1
taskkill /f /im electron.exe >nul 2>&1

echo.
echo すべてのプロセスを安全に終了しました！
timeout /t 3 > nul
