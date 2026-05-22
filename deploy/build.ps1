$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\.."

$OUT = "deploy\grainscript-deploy"
$APPDIR = "$OUT\app"

Write-Host "========================================"
Write-Host "  GrainScript Deployment Builder"
Write-Host "========================================"
Write-Host ""

# 1. Build
Write-Host "[1/4] Building Next.js project (standalone mode)..."
npm run build 2>&1 | Select-Object -Last 5
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Build failed!"
    exit 1
}

# 2. Clean
Write-Host "[2/4] Cleaning output directory..."
if (Test-Path $OUT) { Remove-Item -Recurse -Force $OUT }
New-Item -ItemType Directory -Force -Path $APPDIR | Out-Null

# 3. Copy only runtime files from standalone
Write-Host "[3/4] Copying runtime files..."

$sourceRoot = ".next\standalone"

# Only copy what's needed at runtime
$includeDirs = @(
    ".next",           # compiled JS/CSS
    "node_modules",    # production deps (tree-shaken)
    "prisma",          # schema + database
    "data",            # RAG indexes
    "public",          # static assets
    "scripts"          # chart generation scripts
)

foreach ($dir in $includeDirs) {
    $srcPath = Join-Path $sourceRoot $dir
    if (Test-Path $srcPath) {
        Copy-Item -Recurse -Force $srcPath (Join-Path $APPDIR $dir)
        Write-Host "  Copied: $dir"
    } else {
        Write-Host "  Skipped (not found): $dir"
    }
}

# Copy server.js entry point
Copy-Item -Force (Join-Path $sourceRoot "server.js") $APPDIR
Write-Host "  Copied: server.js"

# Copy package.json (needed for module resolution)
Copy-Item -Force (Join-Path $sourceRoot "package.json") $APPDIR

# 4. Copy scripts
Write-Host "[4/4] Packaging..."
Copy-Item -Force "$PSScriptRoot\setup.bat" "$OUT\"
Copy-Item -Force "$PSScriptRoot\setup.ps1" "$OUT\"
Copy-Item -Force "$PSScriptRoot\start.bat" "$OUT\"
Copy-Item -Force "$PSScriptRoot\start.ps1" "$OUT\"
Copy-Item -Force "$PSScriptRoot\使用说明.txt" "$OUT\"

# Create zip
$zipPath = "deploy\grainscript-deploy.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path $OUT -DestinationPath $zipPath -Force

$zipSize = (Get-Item $zipPath).Length / 1MB
Write-Host ""
Write-Host "============================================"
Write-Host "  Build complete!"
Write-Host "  Package: deploy\grainscript-deploy.zip ($([math]::Round($zipSize, 1)) MB)"
Write-Host ""
Write-Host "  Lab deployment (no network needed):"
Write-Host "  1. Install Node.js 18+"
Write-Host "  2. Extract zip, double-click setup.bat"
Write-Host "  3. Enter DeepSeek API Key"
Write-Host "  4. Double-click start.bat"
Write-Host "============================================"
