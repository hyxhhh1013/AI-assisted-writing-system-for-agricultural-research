# GrainScript 本地打包脚本（Windows 备用；日常请 git push main 触发 CI）
# 用法: powershell -File scripts/deploy/package.ps1
# 产出: deploy.tar.gz (上传到服务器后执行 scripts/deploy/apply.sh)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..\..

Write-Host "=== 1/4 构建 ===" -ForegroundColor Cyan
# Agent 开关：NEXT_PUBLIC_* 须在 build 时注入；优先读本地 .env
$agentBuildVars = @(
  "AGENT_ENABLED",
  "NEXT_PUBLIC_AGENT_ENABLED",
  "AGENT_WRITE_ENABLED",
  "NEXT_PUBLIC_AGENT_WRITE_ENABLED",
  "AGENT_WRITE_AUTO_FIX"
)
foreach ($key in $agentBuildVars) {
  if (-not (Get-Item "env:$key" -ErrorAction SilentlyContinue)) {
    $fromFile = $null
    if (Test-Path ".env") {
      $m = Select-String -Path ".env" -Pattern "^$key=(.+)$" | Select-Object -First 1
      if ($m) { $fromFile = $m.Matches.Groups[1].Value.Trim().Trim('"').Trim("'") }
    }
    if ($fromFile) {
      Set-Item -Path "env:$key" -Value $fromFile
    } elseif ($key -match "^(AGENT_ENABLED|NEXT_PUBLIC_AGENT_ENABLED|AGENT_WRITE_ENABLED|NEXT_PUBLIC_AGENT_WRITE_ENABLED)$") {
      Set-Item -Path "env:$key" -Value "1"
      Write-Host "  build: $key=1 (deploy default)" -ForegroundColor Yellow
    }
  }
}
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
$remoteCmd = "cd /home/ubuntu/grainscript && tar -xzf /home/ubuntu/deploy.tar.gz --exclude='.env' && npm install --production --legacy-peer-deps --ignore-scripts && npm install prisma@^5.22.0 --legacy-peer-deps --ignore-scripts && ./node_modules/.bin/prisma generate && ./node_modules/.bin/prisma db push --skip-generate --accept-data-loss && pm2 reload ecosystem.config.cjs --update-env && sleep 3 && curl -sf -o /dev/null http://127.0.0.1:3000 && echo DEPLOY_OK || echo DEPLOY_FAIL"
ssh -o StrictHostKeyChecking=no $server $remoteCmd

Write-Host "`n=== 完成 ===" -ForegroundColor Green
