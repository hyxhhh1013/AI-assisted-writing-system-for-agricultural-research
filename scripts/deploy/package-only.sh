#!/usr/bin/env bash
# 仅打包（假定本地已 npm run build）。用法: bash scripts/deploy/package-only.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ ! -f .next/BUILD_ID ]]; then
  echo "缺少 .next/BUILD_ID，请先 npm run build" >&2
  exit 1
fi

echo "=== 打包（跳过 build）==="
rm -rf deploy-pkg deploy.tar.gz
mkdir -p deploy-pkg

tar -C .next/standalone --exclude=node_modules --exclude=papers --exclude=data -cf - . \
  | tar -C deploy-pkg -xf -

for d in papers node_modules data deploy-pkg; do
  rm -rf "deploy-pkg/$d"
done

for f in deploy.tar.gz package-lock.json tsconfig.tsbuildinfo .env; do
  rm -f "deploy-pkg/$f"
done

mkdir -p deploy-pkg/.next
cp -a .next/static deploy-pkg/.next/static

cp ecosystem.config.cjs deploy-pkg/
cp package.json deploy-pkg/
cp -a prisma deploy-pkg/
mkdir -p deploy-pkg/scripts
cp -a scripts/deploy deploy-pkg/scripts/

tar -czf deploy.tar.gz -C deploy-pkg .
SIZE_MB="$(du -m deploy.tar.gz | cut -f1)"
BUILD_ID="$(cat .next/BUILD_ID)"
COUNT="$(tar -tzf deploy.tar.gz | grep -c '\.next/BUILD_ID' || true)"
echo "BUILD_ID=${BUILD_ID}"
echo "tar BUILD_ID count=${COUNT}"
echo "deploy.tar.gz: ${SIZE_MB} MB"
if [[ "${COUNT}" -lt 1 ]]; then
  echo "ERROR: deploy.tar.gz 缺少 .next/BUILD_ID" >&2
  exit 1
fi
