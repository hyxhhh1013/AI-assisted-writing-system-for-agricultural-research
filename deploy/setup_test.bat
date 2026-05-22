@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title GrainScript Setup

set "AD=%~dp0app"
if not exist "%AD%\package.json" (
    echo [ERROR] Cannot find app\package.json
    pause
    exit /b 1
)

echo   ========================================
echo     GrainScript - First Time Setup
echo   ========================================
echo.

echo [1/5] Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found! Please install Node.js 18+ first:
    echo   https://nodejs.org/zh-cn/download/
    pause
    exit /b 1
)
node -v
echo.

echo [2/5] Installing dependencies (首次需联网, 2-5 min)...
echo   使用国内镜像源 npmmirror.com
cd /d "%AD%"
call npm install --registry=https://registry.npmmirror.com
if %errorlevel% neq 0 (
    echo [WARN] Mirror failed, retrying with default registry...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed! Check network.
        pause
        exit /b 1
    )
)
echo.

echo [3/5] Setting up database...
call npx prisma generate
if %errorlevel% neq 0 (
    echo [ERROR] Prisma generate failed!
    pause
    exit /b 1
)
echo.

echo [4/5] Checking Python (optional, for charts)...
where python >nul 2>&1
if %errorlevel% equ 0 (
    python --version 2>&1
    pip install matplotlib numpy --quiet -i https://pypi.tuna.tsinghua.edu.cn/simple 2>&1
    echo   Python OK - chart features enabled
) else (
    echo   Python not found - chart features disabled
)
echo.

echo [5/5] Configuration...
echo   NOTE: No login required. Auth is disabled for lab testing.
echo.
set /p DK="DeepSeek API Key (required): "
if "!DK!"=="" (
    echo [ERROR] DeepSeek API Key is required!
    pause
    exit /b 1
)
set /p ZK="Zhipu API Key (optional, press Enter to skip): "

echo DEEPSEEK_API_KEY=!DK!> "%AD%\.env"
echo JWT_SECRET=grainscript2026>> "%AD%\.env"
echo DATABASE_URL=file:./prisma/dev.db>> "%AD%\.env"
if not "!ZK!"=="" echo ZHIPU_API_KEY=!ZK!>> "%AD%\.env"
echo PYTHON_CMD=python>> "%AD%\.env"

echo.
echo   ========================================
echo     Setup complete!
echo     Double-click start.bat to launch.
echo     Visit: http://localhost:3000
echo   ========================================
pause
exit /b 0

