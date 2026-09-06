#!/usr/bin/env bash
# GrainScript 部署包构建（CI / Linux 本地）
# 用法: bash scripts/deploy/package.sh
# 产出: deploy.tar.gz（由 GitHub Actions 上传后执行 apply.sh）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "=== 1/3 构建 ==="
npm run build

echo "=== 2/3 打包 ==="
rm -rf deploy-pkg deploy.tar.gz
mkdir -p deploy-pkg

# 高效打包：tar 管道复制 standalone 并排除 node_modules（~692M），
# 避免「先 cp 后 rm」复制大目录卡死（坑见 docs/DEPLOY.md §四#3）
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
# 生产可直接 node 跑的摘要补建脚本（CommonJS，不依赖 tsx）
cp scripts/rebuild-external-abstracts.cjs deploy-pkg/scripts/ 2>/dev/null || true
# 知识库索引：API spawn `node scripts/index-pdfs.mjs`，不会进 standalone file trace
cp scripts/index-pdfs.mjs deploy-pkg/scripts/
cp scripts/doc-type-registry.mjs deploy-pkg/scripts/
cp scripts/sync-knowledge-metadata-to-prisma.mjs deploy-pkg/scripts/
cp -a scripts/lib deploy-pkg/scripts/
cp -a scripts/extractors deploy-pkg/scripts/

echo "=== 3/3 压缩 ==="
tar -czf deploy.tar.gz -C deploy-pkg .
SIZE_MB="$(du -m deploy.tar.gz | cut -f1)"
echo "deploy.tar.gz: ${SIZE_MB} MB"
