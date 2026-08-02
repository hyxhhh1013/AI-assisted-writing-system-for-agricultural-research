#!/usr/bin/env bash
# 在 VPS .env 中启用 Agent（部署包不覆盖 .env，需单独执行）
set -euo pipefail
APP_DIR="${APP_DIR:-/home/ubuntu/grainscript}"
cd "$APP_DIR"

upsert_env() {
  local key="$1"
  local val="$2"
  if grep -q "^${key}=" .env 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" .env
  else
    echo "${key}=${val}" >> .env
  fi
}

upsert_env AGENT_ENABLED 1
upsert_env NEXT_PUBLIC_AGENT_ENABLED 1
upsert_env AGENT_WRITE_ENABLED 1
upsert_env NEXT_PUBLIC_AGENT_WRITE_ENABLED 1
upsert_env AGENT_WRITE_AUTO_FIX 1

echo "=== Agent env on server ==="
grep -E '^(AGENT_|NEXT_PUBLIC_AGENT_)' .env
