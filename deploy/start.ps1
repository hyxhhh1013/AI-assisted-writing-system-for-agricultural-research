$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = Join-Path $ScriptDir "app"

if (-not (Test-Path (Join-Path $AppDir "server.js"))) {
    Write-Host "[ERROR] Cannot find app\server.js. Run setup.bat first!"
    Pause
    exit 1
}

if (-not (Test-Path (Join-Path $AppDir ".env"))) {
    Write-Host "[WARNING] .env not found. Running setup..."
    & (Join-Path $ScriptDir "setup.ps1")
    if (-not (Test-Path (Join-Path $AppDir ".env"))) {
        Pause
        exit 1
    }
}

Push-Location $AppDir
Write-Host "========================================"
Write-Host "  GrainScript Server"
Write-Host "  http://localhost:3000"
Write-Host "  Press Ctrl+C to stop"
Write-Host "========================================"
Start-Process "http://localhost:3000"
node server.js
Pop-Location
Pause
