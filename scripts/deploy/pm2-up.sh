#!/usr/bin/env bash
# GrainScript VPS 部署（git-pull 模式，用于 GitHub Actions / SSH 手动触发）
# 如需本地 build + 上传模式，用 package.ps1 + apply.sh
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/home/ubuntu/grainscript}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-cursor/code-quality-cleanup}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

cd "$DEPLOY_DIR"

echo "→ 停止 Docker 应用容器（若存在）"
docker stop grainscript 2>/dev/null || true
docker rm grainscript 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" stop app 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" rm -f app 2>/dev/null || true

echo "→ 同步代码: origin/${DEPLOY_BRANCH}"
git fetch origin "$DEPLOY_BRANCH"
git checkout "$DEPLOY_BRANCH"
git reset --hard "origin/${DEPLOY_BRANCH}"

echo "→ 检查 DATABASE_URL（确保指向 PostgreSQL 5432）"
if grep -qE '^DATABASE_URL=file:' .env 2>/dev/null; then
  echo "  将 .env 中 SQLite 改为 PostgreSQL（127.0.0.1:5432）"
  sed -i 's|^DATABASE_URL=.*|DATABASE_URL=postgresql://grainscript:grainscript_dev_2024@127.0.0.1:5432/grainscript|' .env
elif grep -q 'localhost:5433' .env 2>/dev/null; then
  echo "  修正端口 5433 → 5432"
  sed -i 's|localhost:5433|localhost:5432|g' .env
fi

echo "→ 安装依赖"
if ! npm ci --legacy-peer-deps; then
  echo "  npm ci 失败，清理 node_modules 后重试"
  rm -rf node_modules
  npm ci --legacy-peer-deps
fi

echo "→ Prisma"
npx prisma generate
if ! npx prisma migrate deploy 2>/tmp/prisma-migrate.err; then
  if grep -q P3005 /tmp/prisma-migrate.err; then
    echo "  数据库已有表，baseline 迁移记录"
    npx prisma migrate resolve --applied 20260503154515_init_db
    npx prisma migrate resolve --applied 20260530_sqlite_to_postgresql
    npx prisma migrate deploy
  else
    cat /tmp/prisma-migrate.err >&2
    exit 1
  fi
fi

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
