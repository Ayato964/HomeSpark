@echo off
chcp 65001 > nul
title HomeSpark GeMo 起動ランチャー

echo ========================================================
echo   HomeSpark GeMo - 専属秘書GeMo (デスクトップアプリ)
echo ========================================================
echo.
echo 秘書GeMoと各種サーバーを起動しています...
echo.

cd /d "%~dp0\lab_sales_spark_frontend"
npm run dev:electron
