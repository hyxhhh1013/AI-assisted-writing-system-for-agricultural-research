# GrainScript 本地打包脚本（Windows 备用；日常请 git push main 触发 CI）
# 用法: powershell -File scripts/deploy/package.ps1
# 产出: deploy.tar.gz (上传到服务器后执行 scripts/deploy/apply.sh)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..\..

Write-Host "=== 1/4 构建 ===" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

Write-Host "=== 2/4 打包 ===" -ForegroundColor Cyan

# 清理旧产物
Remove-Item -Recurse -Force deploy-pkg -ErrorAction SilentlyContinue
Remove-Item deploy.tar.gz -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force deploy-pkg | Out-Null

# 核心：standalone 输出
Copy-Item -Recurse ".next\standalone\*" deploy-pkg/ -ErrorAction SilentlyContinue

# 移除服务器已有 / 不需要的目录
$skipDirs = @("papers", "node_modules", "data", "deploy-pkg")
foreach ($d in $skipDirs) {
    Remove-Item -Recurse -Force "deploy-pkg\$d" -ErrorAction SilentlyContinue
}

# 移除不需要的大文件 + 服务器敏感文件（防止覆盖服务器 .env）
$skipFiles = @("deploy.tar.gz", "package-lock.json", "tsconfig.tsbuildinfo", ".env")
foreach ($f in $skipFiles) {
    Remove-Item "deploy-pkg\$f" -ErrorAction SilentlyContinue
}

# ⚠️ 关键：.next/static 不在 standalone 里，必须单独复制
New-Item -ItemType Directory -Force "deploy-pkg\.next" | Out-Null
Copy-Item -Recurse ".next\static" "deploy-pkg\.next\static"

# standalone 未包含的部署与 DB 文件
$extraCopy = @(
    @{ Src = "ecosystem.config.cjs"; Dest = "deploy-pkg\ecosystem.config.cjs" },
    @{ Src = "package.json"; Dest = "deploy-pkg\package.json" },
    @{ Src = "prisma"; Dest = "deploy-pkg\prisma" },
    @{ Src = "scripts\deploy"; Dest = "deploy-pkg\scripts\deploy" }
)
foreach ($item in $extraCopy) {
    if (Test-Path $item.Src) {
        Copy-Item -Recurse -Force $item.Src $item.Dest
    }
}

Write-Host "=== 3/4 压缩 ===" -ForegroundColor Cyan
tar -czf deploy.tar.gz -C deploy-pkg .
$sizeMB = [math]::Round((Get-Item deploy.tar.gz).Length / 1MB, 1)
Write-Host "deploy.tar.gz: $sizeMB MB" -ForegroundColor Green

Write-Host "=== 4/4 上传 + 部署 ===" -ForegroundColor Cyan
$server = "ubuntu@159.75.106.21"
$remotePath = "/home/ubuntu/deploy.tar.gz"
$appDir = "/home/ubuntu/grainscript"

Write-Host "上传到 $server ..."
scp -o StrictHostKeyChecking=no deploy.tar.gz ${server}:${remotePath}
if ($LASTEXITCODE -ne 0) { throw "SCP failed" }

Write-Host "服务器部署..."
ssh -o StrictHostKeyChecking=no $server @"
cd $appDir
tar -xzf $remotePath
npm install --production --legacy-peer-deps --ignore-scripts
npx prisma generate
npx prisma db push --skip-generate
bash scripts/deploy/preflight.sh
pm2 reload ecosystem.config.cjs --update-env
sleep 2
curl -sf -o /dev/null http://127.0.0.1:3000 && echo 'DEPLOY OK' || echo 'WARN: HTTP check failed'
"@

Write-Host "`n=== 完成 ===" -ForegroundColor Green
