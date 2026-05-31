#!/usr/bin/env bash
# 在 VPS 上 git pull 后本地 build 并重启（零镜像仓库费用）
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/grainscript}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

cd "$DEPLOY_DIR"

# 若 3000 被旧版 next-server 占用，先释放端口以便 Docker 绑定
if command -v ss >/dev/null 2>&1 && ss -tlnp 2>/dev/null | grep -q ':3000'; then
  if ! docker ps --format '{{.Ports}}' 2>/dev/null | grep -q '3000'; then
    echo "→ 停止占用 3000 端口的旧进程"
    fuser -k 3000/tcp 2>/dev/null || true
    sleep 2
  fi
fi

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

echo "→ 本地构建 app 镜像（首次约 15～30 分钟，后续有缓存会快很多）"
docker compose -f "$COMPOSE_FILE" build app

echo "→ 启动/更新容器"
docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" up -d

echo "→ 当前状态"
docker compose -f "$COMPOSE_FILE" ps
