#!/usr/bin/env bash
# Turbopack 把 serverExternalPackages 改写成 @scope/name-<hash>，npm 不会生成该目录。
# 必须在 prisma generate / npm install 之后运行。被 apply.sh 调用。
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
cd "$APP_DIR"

echo "→ Turbopack hashed external 符号链接"
HASHED_MODS="$(
  grep -rhoE '@[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+-[a-f0-9]{8,}' .next/server --include='*.js' 2>/dev/null \
    | sort -u || true
)"
if [ -z "$HASHED_MODS" ]; then
  echo "→ 构建产物中未命中 hashed external，跳过"
  exit 0
fi

while IFS= read -r mod; do
  [ -n "$mod" ] || continue
  scope="${mod%%/*}"
  name_hash="${mod#*/}"
  name="$(printf '%s' "$name_hash" | sed -E 's/-[a-f0-9]{8,}$//')"
  mkdir -p "node_modules/$scope"
  if [ "$scope/$name" = "@prisma/client" ]; then
    if [ ! -d node_modules/.prisma/client ]; then
      echo "→ 缺少 node_modules/.prisma/client，无法链接 $mod" >&2
      exit 1
    fi
    ln -sfn "../.prisma/client" "node_modules/$scope/$name_hash"
    echo "→ 已链接 $mod → .prisma/client"
  else
    if [ ! -d "node_modules/$scope/$name" ]; then
      echo "→ 缺少 node_modules/$scope/$name，尝试安装…"
      npm install "$scope/$name" --legacy-peer-deps --no-save
    fi
    if [ ! -d "node_modules/$scope/$name" ]; then
      echo "→ 无法链接 $mod（包不存在）" >&2
      exit 1
    fi
    ln -sfn "$name" "node_modules/$scope/$name_hash"
    echo "→ 已链接 $mod → $scope/$name"
  fi
done <<< "$HASHED_MODS"
