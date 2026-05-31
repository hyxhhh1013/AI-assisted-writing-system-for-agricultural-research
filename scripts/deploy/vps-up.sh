#!/usr/bin/env bash
# 在 VPS 上拉取最新镜像并重启（GitHub Actions 或手动 SSH 均可调用）
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/grainscript}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
TCR_REGISTRY="${TCR_REGISTRY:-ccr.ccs.tencentyun.com}"

cd "$DEPLOY_DIR"

if [[ -z "${GRAINSCRIPT_IMAGE:-}" ]]; then
  echo "错误: 请设置 GRAINSCRIPT_IMAGE，例如 ccr.ccs.tencentyun.com/命名空间/grainscript:latest" >&2
  exit 1
fi

if [[ -n "${TCR_PASSWORD:-}" && -n "${TCR_USERNAME:-}" ]]; then
  echo "$TCR_PASSWORD" | docker login "$TCR_REGISTRY" -u "$TCR_USERNAME" --password-stdin
fi

# 若 3000 被旧版 next-server 占用，先释放端口以便 Docker 绑定
if command -v ss >/dev/null 2>&1 && ss -tlnp 2>/dev/null | grep -q ':3000'; then
  if ! docker ps --format '{{.Ports}}' 2>/dev/null | grep -q '3000'; then
    echo "→ 停止占用 3000 端口的旧进程"
    fuser -k 3000/tcp 2>/dev/null || true
    sleep 2
  fi
fi

echo "→ 拉取镜像: $GRAINSCRIPT_IMAGE"
docker compose -f "$COMPOSE_FILE" pull app

echo "→ 启动/更新容器"
docker compose -f "$COMPOSE_FILE" up -d

echo "→ 当前状态"
docker compose -f "$COMPOSE_FILE" ps
