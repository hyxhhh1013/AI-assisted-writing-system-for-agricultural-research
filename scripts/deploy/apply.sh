#!/usr/bin/env bash
# GrainScript 服务器端部署脚本（上传包模式）
# 用法: bash scripts/deploy/apply.sh
# 前提: deploy.tar.gz 已上传到 /home/ubuntu/
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/grainscript}"
TAR_FILE="${TAR_FILE:-/home/ubuntu/deploy.tar.gz}"

echo "→ 解压到 ${APP_DIR}（不覆盖 .env）"
cd "$APP_DIR"
# 清理旧构建产物：.next/standalone/node_modules 含 symlink/哈希目录，
# 不删会在 tar 解包时报 "Cannot open: File exists"
echo "→ 清理旧 .next"
rm -rf .next
# 排除 .env —— 服务器配置永远不被部署包覆盖
tar -xzf "$TAR_FILE" --exclude='.env' 2>/dev/null || tar -xzf "$TAR_FILE"

echo "→ 安装依赖"
npm install --production --legacy-peer-deps --ignore-scripts

echo "→ 安装 Prisma CLI（devDependency，production install 会跳过）"
npm install prisma@^5.22.0 --legacy-peer-deps --ignore-scripts

echo "→ Prisma Generate（生成 Debian 引擎）"
./node_modules/.bin/prisma generate

echo "→ Prisma DB Push"
./node_modules/.bin/prisma db push --skip-generate

echo "→ Turbopack Prisma 客户端 hash 符号链接"
# Turbopack 把 @prisma/client external 成 @prisma/client-<hash>，prisma generate 不生成该模块
# → 符号链接指向生成的 .prisma/client，否则 standalone 启动报 "Cannot find module '@prisma/client-<hash>'"
PRISMA_HASH="$(grep -hoE '@prisma/client-[a-f0-9]+' .next/server/chunks/*.js 2>/dev/null | sort -u | head -1 | cut -d/ -f2)"
if [ -n "$PRISMA_HASH" ]; then
  if [ ! -e "node_modules/@prisma/$PRISMA_HASH" ]; then
    ln -sfn "../.prisma/client" "node_modules/@prisma/$PRISMA_HASH"
    echo "→ 已创建 node_modules/@prisma/$PRISMA_HASH → .prisma/client"
  else
    echo "→ $PRISMA_HASH 已存在，跳过"
  fi
else
  echo "→ 构建产物中未命中 @prisma/client-<hash>，跳过"
fi

echo "→ 部署前自检"
chmod +x scripts/deploy/preflight.sh 2>/dev/null || true
bash scripts/deploy/preflight.sh

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
