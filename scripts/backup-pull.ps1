# GrainScript backup pull - latest backup from server
# Usage: powershell -File scripts/backup-pull.ps1
# Pulls: database.sql, .env, papers.tar.gz from today's server backup

$ErrorActionPreference = "Stop"
$server = "ubuntu@159.75.106.21"
$backupRoot = "D:\grainscript-backups"

$today = Get-Date -Format "yyyy-MM-dd"
$localDir = "$backupRoot\$today"
New-Item -ItemType Directory -Force $localDir | Out-Null

Write-Host "=== GrainScript Backup Pull $today ===" -ForegroundColor Cyan

# 1. Trigger server backup
Write-Host "[1/3] Trigger server backup..." -ForegroundColor Yellow
ssh -o StrictHostKeyChecking=no $server "bash /home/ubuntu/backups/backup.sh"
Write-Host "      Done" -ForegroundColor Green

# 2. Pull small files
Write-Host "[2/3] Pull database.sql + .env" -ForegroundColor Yellow
scp -o StrictHostKeyChecking=no "${server}:/home/ubuntu/backups/grainscript_${today}/database.sql" "$localDir\"
scp -o StrictHostKeyChecking=no "${server}:/home/ubuntu/backups/grainscript_${today}/.env" "$localDir\"
Write-Host "      Done" -ForegroundColor Green

# 3. Pull papers (full tar.gz from backup, 2.4G)
Write-Host "[3/3] Pull papers.tar.gz (2.4G, may take a few minutes)..." -ForegroundColor Yellow
scp -o StrictHostKeyChecking=no "${server}:/home/ubuntu/backups/grainscript_${today}/papers.tar.gz" "$localDir\"
Write-Host "      Done" -ForegroundColor Green

# Show result
$size = (Get-ChildItem $localDir -Recurse -File | Measure-Object Length -Sum).Sum / 1GB
Write-Host "`nBackup: $localDir ($([math]::Round($size, 1)) GB)" -ForegroundColor Green
Write-Host "Files: database.sql, .env, papers.tar.gz"