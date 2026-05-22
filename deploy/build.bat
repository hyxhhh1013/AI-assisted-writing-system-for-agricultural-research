@echo off
chcp 65001 >nul

echo ============================================
echo  禾书耕文 (GrainScript) - 部署包构建
echo ============================================
echo.

cd /d "%~dp0.."

if not exist ".next\standalone\server.js" (
    echo [错误] 未找到 .next\standalone\server.js
    echo 请先运行: npm run build
    pause
    exit /b 1
)

echo 正在打包，请稍候...
powershell -ExecutionPolicy Bypass -File "%~dp0build.ps1"
pause
