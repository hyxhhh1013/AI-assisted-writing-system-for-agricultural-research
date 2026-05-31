#!/usr/bin/env bash
# VPS：git 拉代码 → build → PM2 重启（不用 Docker 跑应用）
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/grainscript}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-cursor/code-quality-cleanup}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

cd "$DEPLOY_DIR"

echo "→ 停止 Docker 应用容器（若存在）"
docker compose -f "$COMPOSE_FILE" stop app 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" rm -f app 2>/dev/null || true

echo "→ 同步代码: origin/${DEPLOY_BRANCH}"
git fetch origin "$DEPLOY_BRANCH"
git checkout "$DEPLOY_BRANCH"
git reset --hard "origin/${DEPLOY_BRANCH}"

echo "→ 检查 DATABASE_URL（新代码需要 PostgreSQL）"
if grep -qE '^DATABASE_URL=file:' .env 2>/dev/null; then
  echo "  将 .env 中 SQLite 改为 PostgreSQL（127.0.0.1:5432）"
  sed -i 's|^DATABASE_URL=.*|DATABASE_URL=postgresql://grainscript:grainscript_dev_2024@127.0.0.1:5432/grainscript|' .env
fi

echo "→ 安装依赖"
npm ci --legacy-peer-deps

echo "→ Prisma"
npx prisma generate
npx prisma migrate deploy

echo "→ 构建 Next.js"
npm run build

echo "→ PM2 重启"
if command -v pm2 >/dev/null 2>&1; then
  pm2 startOrRestart ecosystem.config.cjs --update-env
  pm2 save
else
  echo "错误: 未安装 pm2" >&2
  exit 1
fi

echo "→ 状态"
pm2 status grainscript
curl -sf -o /dev/null http://127.0.0.1:3000 && echo "HTTP 3000 OK" || echo "警告: 3000 未响应"
