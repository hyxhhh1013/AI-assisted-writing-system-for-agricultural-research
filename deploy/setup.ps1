$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = Join-Path $ScriptDir "app"

if (-not (Test-Path (Join-Path $AppDir "server.js"))) {
    Write-Host "[ERROR] Cannot find app\server.js. Make sure the zip was extracted correctly!"
    Pause
    exit 1
}

Write-Host "========================================"
Write-Host "  GrainScript - Setup"
Write-Host "========================================"
Write-Host ""

Write-Host "[1/3] Checking Node.js..."
$nodePath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodePath) {
    Write-Host "[ERROR] Node.js not found! Please install Node.js 18+ first:"
    Write-Host "  https://nodejs.org/zh-cn/download/"
    Pause
    exit 1
}
node -v
Write-Host ""

Write-Host "[2/3] Checking Python (optional, for charts)..."
$pythonPath = Get-Command python -ErrorAction SilentlyContinue
if ($pythonPath) {
    python --version 2>&1
    Write-Host "  Python found - chart features available"
    Write-Host "  (If charts don't work, run: pip install matplotlib numpy)"
} else {
    Write-Host "  Python not found - chart features disabled"
    Write-Host "  (Install Python 3.9+ and run: pip install matplotlib numpy)"
}
Write-Host ""

Write-Host "[3/3] Configuration..."
Write-Host "  NOTE: No login required. Auth is disabled for lab testing."
Write-Host ""
$DK = Read-Host "DeepSeek API Key (required)"
if (-not $DK) {
    Write-Host "[ERROR] DeepSeek API Key is required!"
    Pause
    exit 1
}
$ZK = Read-Host "Zhipu API Key (optional, press Enter to skip)"

$envContent = @"
DEEPSEEK_API_KEY=$DK
JWT_SECRET=grainscript2026
DATABASE_URL=file:./prisma/dev.db
PYTHON_CMD=python
"@
if ($ZK) {
    $envContent += "`nZHIPU_API_KEY=$ZK"
}
$envContent | Out-File (Join-Path $AppDir ".env") -Encoding UTF8

Write-Host ""
Write-Host "========================================"
Write-Host "  Setup complete!"
Write-Host "  Double-click start.bat to launch."
Write-Host "  http://localhost:3000"
Write-Host "========================================"
Pause
