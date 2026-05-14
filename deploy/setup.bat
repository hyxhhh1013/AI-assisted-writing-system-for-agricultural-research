@echo off
setlocal enabledelayedexpansion
set "SD=%~dp0"
set "AD=%SD%app"
if not exist "%AD%\server.js" set "AD=%SD%grainscript-deploy\app"
if not exist "%AD%\server.js" (
    echo [ERROR] Cannot find app\server.js
    pause
    exit /b 1
)
echo   ========================================
echo     GrainScript - First Time Setup
echo   ========================================
echo.
echo [1/3] Check Node.js...
where node >/dev/null 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found!
    echo Install: https://nodejs.org/
    pause
    exit /b 1
)
node -v
echo [2/3] Check Python...
where python >/dev/null 2>&1
if %errorlevel% equ 0 (python --version 2>&1 && pip install matplotlib numpy --quiet 2>&1) else (echo Python not found - chart feature disabled)
echo [3/3] Config API Keys...
echo.
set /p DK="DeepSeek API Key (required): "
if "!DK!"=="" (echo [ERROR] API Key required! && pause && exit /b 1)
set /p JW="JWT Secret (press Enter for random): "
if "!JW!"=="" set JW=grainscript2026
set /p ZK="Zhipu API Key (optional): "
:: Write env.bat for start.bat to load
echo set DEEPSEEK_API_KEY=!DK!> "%AD%\env.bat"
echo set JWT_SECRET=!JW!>> "%AD%\env.bat"
echo set ZHIPU_API_KEY=!ZK!>> "%AD%\env.bat"
echo set DATABASE_URL=file:%AD%\prisma\dev.db>> "%AD%\env.bat"
echo.
echo   Setup complete!
echo   Double-click start.bat to launch.
echo.
pause
exit /b 0
