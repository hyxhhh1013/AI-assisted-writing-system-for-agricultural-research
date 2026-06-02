#!/usr/bin/env bash
# GrainScript 服务器端部署脚本（上传包模式）
# 用法: bash scripts/deploy/apply.sh
# 前提: deploy.tar.gz 已上传到 /home/ubuntu/
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/grainscript}"
TAR_FILE="${TAR_FILE:-/home/ubuntu/deploy.tar.gz}"

echo "→ 解压到 ${APP_DIR}"
cd "$APP_DIR"
tar -xzf "$TAR_FILE"

echo "→ 安装依赖"
npm install --production --legacy-peer-deps --ignore-scripts

echo "→ Prisma Generate（生成 Debian 引擎）"
npx prisma generate

echo "→ Prisma DB Push"
npx prisma db push --skip-generate

echo "→ PM2 零停机重启"
pm2 reload ecosystem.config.cjs --update-env

sleep 3

echo "→ 状态"
pm2 status grainscript

echo "→ HTTP 检查"
if curl -sf -o /dev/null http://127.0.0.1:3000; then
  echo "DEPLOY OK — http://127.0.0.1:3000"
else
  echo "WARN: HTTP 3000 未响应，检查日志: pm2 logs grainscript --lines 20"
  exit 1
fi
