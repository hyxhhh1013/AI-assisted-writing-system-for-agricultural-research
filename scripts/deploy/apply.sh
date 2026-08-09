#!/usr/bin/env bash
# GrainScript 服务器端部署脚本（上传包模式）
# 用法: bash scripts/deploy/apply.sh
# 前提: deploy.tar.gz 已上传到 /home/ubuntu/
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/grainscript}"
TAR_FILE="${TAR_FILE:-/home/ubuntu/deploy.tar.gz}"

# ── Phase 1：只解压，然后 exec 新包里的 apply.sh ──────────────────────────
# 否则 nohup 启动的是「旧目录里的旧脚本」，会漏掉新加的 canvas 等链接步骤
# （2026-08-09 Agent 500：只链了 prisma，未链 @napi-rs/canvas-<hash>）。
if [ "${GRAINSCRIPT_APPLY_PHASE:-}" != "post" ]; then
  echo "→ 解压到 ${APP_DIR}（不覆盖 .env）"
  cd "$APP_DIR"
  echo "→ 清理旧 .next"
  rm -rf .next
  tar -xzf "$TAR_FILE" --exclude='.env' 2>/dev/null || tar -xzf "$TAR_FILE"
  chmod +x scripts/deploy/apply.sh scripts/deploy/link-hashed-externals.sh scripts/deploy/preflight.sh 2>/dev/null || true
  echo "→ 解压完成，切换到新包内 apply.sh"
  exec env GRAINSCRIPT_APPLY_PHASE=post APP_DIR="$APP_DIR" TAR_FILE="$TAR_FILE" \
    bash "$APP_DIR/scripts/deploy/apply.sh"
fi

# ── Phase 2：安装 / 迁移 / 链接 / 重启（始终跑刚解压的脚本）──────────────
cd "$APP_DIR"

echo "→ 安装依赖"
npm install --production --legacy-peer-deps --ignore-scripts

echo "→ 安装 Prisma CLI（devDependency，production install 会跳过）"
npm install prisma@^5.22.0 --legacy-peer-deps --ignore-scripts

echo "→ Prisma Generate（生成 Debian 引擎）"
./node_modules/.bin/prisma generate

echo "→ Prisma DB Push"
./node_modules/.bin/prisma db push --skip-generate

chmod +x scripts/deploy/link-hashed-externals.sh 2>/dev/null || true
bash scripts/deploy/link-hashed-externals.sh

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
