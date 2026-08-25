@echo off
chcp 65001 > nul
title HomeSpark GeMo 一括自動起動ランチャー

echo ========================================================
echo   HomeSpark GeMo - 専属秘書GeMo (完全自動起動)
echo ========================================================
echo.
echo 必要なすべてのシステム（バックエンド / TTS / アプリ）を自動起動しています...
echo.

set ROOT_DIR=%~dp0
set BACKEND_DIR=%ROOT_DIR%lab_sales_spark_backend
set FRONTEND_DIR=%ROOT_DIR%lab_sales_spark_frontend
set VENV_PYTHON=%BACKEND_DIR%\.venv\Scripts\python.exe

:: 1. Check & Start Backend Server (Port 8080)
netstat -ano | findstr :8080 > nul
if %errorlevel% neq 0 (
    echo [1/3] FastAPI バックエンドサーバーを起動中 (Port 8080)...
    start /min "HomeSpark_Backend" cmd /c "cd /d %BACKEND_DIR% && %VENV_PYTHON% -m uvicorn server:app --host 127.0.0.1 --port 8080"
) else (
    echo [1/3] FastAPI バックエンドサーバーは既に稼働中です (Port 8080)。
)

:: 2. Check & Start Local TTS Engine (Port 8008)
netstat -ano | findstr :8008 > nul
if %errorlevel% neq 0 (
    echo [2/3] ローカル音声合成エンジン (Irodori-TTS) を起動中 (Port 8008)...
    start /min "HomeSpark_TTS" cmd /c "cd /d %BACKEND_DIR%\Irodori-TTS-Lite && %VENV_PYTHON% app_voice.py"
) else (
    echo [2/3] ローカル音声合成エンジンは既に稼働中です (Port 8008)。
)

:: 3. Start Frontend & Electron Desktop App
echo [3/3] デスクトップアプリを起動中...
echo.
echo GeMoが立ち上がります。このウィンドウは最小化しておいて大丈夫です♪
echo.

cd /d %FRONTEND_DIR%
npm run dev:electron
