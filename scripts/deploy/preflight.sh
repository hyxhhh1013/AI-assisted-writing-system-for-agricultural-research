#!/usr/bin/env bash
# 部署前自检：DB、.env、文献目录、RAG 索引、关键 API Key
# 用法: APP_DIR=/home/ubuntu/grainscript bash scripts/deploy/preflight.sh
# 退出码 0=通过，非 0=应修复后再 pm2 reload
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/grainscript}"
cd "$APP_DIR"

FAIL=0
warn() { echo "WARN: $*"; }
fail() { echo "FAIL: $*"; FAIL=1; }
ok() { echo "OK:   $*"; }

echo "=== GrainScript deploy preflight ==="
echo "APP_DIR=$APP_DIR"
echo ""

# --- .env ---
if [[ ! -f .env ]]; then
  fail ".env 不存在。请: cp .env.example .env 并填写生产配置（勿从本机复制 SQLite / db: 主机名）"
else
  ok ".env 存在"
fi

env_val() {
  local key="$1"
  if [[ -f .env ]]; then
    grep -E "^${key}=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//'
  fi
}

DATABASE_URL="$(env_val DATABASE_URL)"
JWT_SECRET="$(env_val JWT_SECRET)"
DEEPSEEK_API_KEY="$(env_val DEEPSEEK_API_KEY)"
RAG_ARTICLES_DIR="$(env_val RAG_ARTICLES_DIR)"

if [[ -z "$DATABASE_URL" ]]; then
  fail "DATABASE_URL 未设置"
elif [[ "$DATABASE_URL" == file:* ]]; then
  fail "DATABASE_URL 为 SQLite（$DATABASE_URL）。VPS PM2 方案应使用 postgresql://...@127.0.0.1:5432/..."
elif [[ "$DATABASE_URL" == *"@db:"* ]]; then
  fail "DATABASE_URL 含 @db: — 仅 Docker Compose 内有效。PM2 在宿主机运行时应为 @127.0.0.1: 或 @localhost:"
elif [[ "$DATABASE_URL" == postgresql://* ]]; then
  ok "DATABASE_URL 为 PostgreSQL"
else
  warn "DATABASE_URL 格式非常见: ${DATABASE_URL:0:40}..."
fi

if [[ -z "$JWT_SECRET" || "$JWT_SECRET" == "your_jwt_secret_here" ]]; then
  fail "JWT_SECRET 未设置或仍为模板值"
else
  ok "JWT_SECRET 已设置"
fi

if [[ -z "$DEEPSEEK_API_KEY" || "$DEEPSEEK_API_KEY" == sk-xxxxxxxx* || "$DEEPSEEK_API_KEY" == *your_* ]]; then
  fail "DEEPSEEK_API_KEY 未设置或仍为占位符（扩写会失败）"
else
  ok "DEEPSEEK_API_KEY 已设置"
fi

# --- 应用入口 ---
if [[ ! -f server.js ]]; then
  fail "server.js 不存在（是否已在 $APP_DIR 解压 standalone 包？）"
else
  ok "server.js 存在"
fi

# --- PostgreSQL Docker ---
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^grainscript-db$'; then
  ok "Docker 容器 grainscript-db 运行中"
else
  fail "grainscript-db 未运行。请: docker start grainscript-db 或 docker compose up -d db"
fi

if [[ -n "$DATABASE_URL" && "$DATABASE_URL" == postgresql://* ]]; then
  if PGPASSWORD="${PGPASSWORD:-grainscript_dev_2024}" psql -h 127.0.0.1 -p 5432 -U grainscript -d grainscript -t -A -c "SELECT 1" >/dev/null 2>&1; then
    ok "psql SELECT 1 成功（127.0.0.1:5432）"
  else
    fail "无法连接 PostgreSQL（127.0.0.1:5432）。检查 Docker 端口映射与 DATABASE_URL 密码"
  fi
fi

# --- 文献 PDF ---
if [[ -n "$RAG_ARTICLES_DIR" ]]; then
  ARTICLES_PATH="$RAG_ARTICLES_DIR"
  if [[ "$ARTICLES_PATH" != /* ]]; then
    ARTICLES_PATH="$APP_DIR/$ARTICLES_PATH"
  fi
else
  ARTICLES_PATH="$APP_DIR/papers"
fi

if [[ -d "$ARTICLES_PATH" ]]; then
  PDF_COUNT="$(find "$ARTICLES_PATH" -maxdepth 3 -name '*.pdf' 2>/dev/null | wc -l | tr -d ' ')"
  ok "文献目录存在: $ARTICLES_PATH（约 ${PDF_COUNT} 个 PDF）"
  if [[ "${PDF_COUNT:-0}" -eq 0 ]]; then
    warn "文献目录下未发现 PDF，知识库可能为空"
  fi
else
  fail "文献目录不存在: $ARTICLES_PATH（请 scp/rsync papers 或设置 RAG_ARTICLES_DIR 绝对路径）"
fi

# --- RAG 索引 ---
INDEX_COUNT=0
if compgen -G "data/index_*.json" >/dev/null 2>&1; then
  INDEX_COUNT=$(ls -1 data/index_*.json 2>/dev/null | wc -l | tr -d ' ')
fi
if [[ "${INDEX_COUNT:-0}" -gt 0 ]]; then
  ok "RAG 索引: data/index_*.json × ${INDEX_COUNT}"
else
  fail "未找到 data/index_*.json（部署包不含 data/，需单独同步或服务器上 npm run index-docs）"
fi

# --- Python（图表 / 表格 / XRD）---
PYTHON_CMD_VAL="$(env_val PYTHON_CMD)"
PYTHON_CMD_VAL="${PYTHON_CMD_VAL:-python3}"
if [[ "$PYTHON_CMD_VAL" == "python" ]] && [[ "$(uname -s 2>/dev/null)" != MINGW* ]]; then
  warn "PYTHON_CMD=python（Linux 上通常应改为 python3）"
  PYTHON_CMD_VAL="python3"
fi
if command -v "$PYTHON_CMD_VAL" >/dev/null 2>&1; then
  PY_VER="$("$PYTHON_CMD_VAL" --version 2>&1 | head -1)"
  ok "Python: $PY_VER (PYTHON_CMD=$PYTHON_CMD_VAL)"
else
  fail "找不到 Python: $PYTHON_CMD_VAL。请: sudo apt install -y python3 python3-pip && pip3 install matplotlib numpy pandas scipy && .env 中 PYTHON_CMD=python3"
fi

if curl -sf -o /dev/null --max-time 3 http://127.0.0.1:3000 2>/dev/null; then
  ok "HTTP :3000 可访问（应用已在运行）"
else
  warn "HTTP :3000 未响应（首次部署或未启动时正常；pm2 reload 后再测）"
fi

echo ""
if [[ "$FAIL" -ne 0 ]]; then
  echo "PREFLIGHT FAILED — 请修复上述 FAIL 项后再执行 pm2 reload"
  exit 1
fi
echo "PREFLIGHT PASSED"
exit 0
