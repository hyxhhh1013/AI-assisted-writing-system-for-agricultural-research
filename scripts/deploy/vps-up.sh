#!/usr/bin/env bash
# 在 VPS 上拉取最新镜像并重启（GitHub Actions 或手动 SSH 均可调用）
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/grainscript}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

cd "$DEPLOY_DIR"

if [[ -z "${GRAINSCRIPT_IMAGE:-}" ]]; then
  echo "错误: 请设置 GRAINSCRIPT_IMAGE，例如 ghcr.io/OWNER/grainscript:latest" >&2
  exit 1
fi

if [[ -n "${GHCR_TOKEN:-}" && -n "${GHCR_USER:-}" ]]; then
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
fi

echo "→ 拉取镜像: $GRAINSCRIPT_IMAGE"
docker compose -f "$COMPOSE_FILE" pull app

echo "→ 启动/更新容器"
docker compose -f "$COMPOSE_FILE" up -d

echo "→ 当前状态"
docker compose -f "$COMPOSE_FILE" ps
