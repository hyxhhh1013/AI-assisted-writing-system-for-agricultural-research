#!/usr/bin/env bash
# 在腾讯云 VPS 上执行一次（可用网页 VNC / 密码 SSH 登录后粘贴运行）
# 用途：安装 Docker、克隆仓库、准备 .env、写入 deploy 公钥
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/grainscript}"
REPO_URL="${REPO_URL:-https://github.com/hyxhhh1013/AI-assisted-writing-system-for-agricultural-research.git}"
DEPLOY_PUBKEY="${DEPLOY_PUBKEY:-}"

echo "==> 安装 Docker（若已安装会跳过）"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
sudo usermod -aG docker "$USER" || true

echo "==> 准备目录 $DEPLOY_DIR"
sudo mkdir -p "$DEPLOY_DIR"
sudo chown "$USER:$USER" "$DEPLOY_DIR"

if [[ ! -d "$DEPLOY_DIR/.git" ]]; then
  git clone "$REPO_URL" "$DEPLOY_DIR"
else
  cd "$DEPLOY_DIR"
  git fetch origin main
  git checkout main
  git pull --ff-only origin main || true
fi

cd "$DEPLOY_DIR"
chmod +x scripts/deploy/vps-up.sh 2>/dev/null || true

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "已创建 .env，请编辑 JWT_SECRET 和 DEEPSEEK_API_KEY： nano .env"
fi

if [[ -n "$DEPLOY_PUBKEY" ]]; then
  echo "==> 写入 GitHub Actions 部署公钥"
  mkdir -p ~/.ssh
  chmod 700 ~/.ssh
  touch ~/.ssh/authorized_keys
  chmod 600 ~/.ssh/authorized_keys
  if ! grep -qF "$DEPLOY_PUBKEY" ~/.ssh/authorized_keys 2>/dev/null; then
    echo "$DEPLOY_PUBKEY" >> ~/.ssh/authorized_keys
  fi
fi

echo ""
echo "完成。下一步："
echo "  1. nano $DEPLOY_DIR/.env"
echo "  2. 在 GitHub 配置 Secrets: DEPLOY_SSH_KEY（及 DEPLOY_HOST/USER/PATH）"
echo "  3. push 到 main 触发 Actions，或手动："
echo "     bash $DEPLOY_DIR/scripts/deploy/vps-up.sh"
