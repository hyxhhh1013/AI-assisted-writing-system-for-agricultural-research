@echo off
set "SD=%~dp0"
set "AD=%SD%app"
if not exist "%AD%\server.js" set "AD=%SD%grainscript-deploy\app"
if not exist "%AD%\server.js" (
    echo [ERROR] Cannot find app\server.js
    pause
    exit /b 1
)
:: Load env vars from setup
if exist "%AD%\env.bat" call "%AD%\env.bat"
:: Ensure DATABASE_URL uses absolute path (fallback)
if "%DATABASE_URL%"=="" set DATABASE_URL=file:%AD%\prisma\dev.db
echo   GrainScript - http://localhost:3000
echo   Press Ctrl+C to stop
start http://localhost:3000
cd /d "%AD%"
node server.js
pause
