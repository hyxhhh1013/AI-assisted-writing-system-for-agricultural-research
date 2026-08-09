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

echo "→ Turbopack hashed external 符号链接"
# serverExternalPackages（@prisma/client、@napi-rs/canvas）会被 Turbopack 改写成
# @scope/name-<hash>，npm 不会生成该目录 → 必须符号链接到真实包，否则 Agent/PDF 等路由 500。
# 用 -r/--include，避免 chunks/*.js glob 参数过长或未命中导致静默跳过。
HASHED_MODS="$(
  grep -rhoE '@[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+-[a-f0-9]{8,}' .next/server --include='*.js' 2>/dev/null \
    | sort -u || true
)"
if [ -z "$HASHED_MODS" ]; then
  echo "→ 构建产物中未命中 hashed external，跳过"
else
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
