#!/usr/bin/env bash
# GrainScript 生产备份
# 用法: bash /home/ubuntu/backups/backup.sh
# cron: 0 3 * * * bash /home/ubuntu/backups/backup.sh >> /home/ubuntu/backups/backup.log 2>&1
#
# 策略:
#   - 每日: .env + 数据库 SQL（gzip）→ backups/daily/YYYY-MM-DD/
#   - 周日: 文献 papers/ 整包 → backups/papers/YYYY-MM-DD.tar.gz
#   - 保留: 日备 14 天；文献周备 3 份（约 21 天）
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/grainscript}"
BACKUP_ROOT="${BACKUP_ROOT:-/home/ubuntu/backups}"
KEEP_DAILY_DAYS="${KEEP_DAILY_DAYS:-14}"
KEEP_PAPERS_COUNT="${KEEP_PAPERS_COUNT:-3}"

DATE=$(date +%Y-%m-%d)
DOW=$(date +%u) # 1=Mon … 7=Sun
DAILY_DIR="${BACKUP_ROOT}/daily/${DATE}"
PAPERS_DIR="${BACKUP_ROOT}/papers"

mkdir -p "$DAILY_DIR" "$PAPERS_DIR"

env_val() {
  local key="$1"
  grep -E "^${key}=" "${APP_DIR}/.env" 2>/dev/null \
    | head -1 \
    | cut -d= -f2- \
    | tr -d '\r' \
    | sed 's/^["'\'']//;s/["'\'']$//'
}

parse_database_url() {
  # postgresql://user:pass@host:port/db
  local url="$1"
  local rest
  rest="${url#*://}"
  DB_USER="${rest%%:*}"
  rest="${rest#*:}"
  DB_PASS="${rest%%@*}"
  rest="${rest#*@}"
  DB_HOST="${rest%%:*}"
  rest="${rest#*:}"
  DB_PORT="${rest%%/*}"
  DB_NAME="${rest#*/}"
  DB_NAME="${DB_NAME%%\?*}"
}

echo "=== GrainScript backup ${DATE} ==="

# --- 1) .env ---
echo "=== 1/4 备份 .env ==="
if [[ ! -f "${APP_DIR}/.env" ]]; then
  echo "FAIL: ${APP_DIR}/.env 不存在" >&2
  exit 1
fi
cp "${APP_DIR}/.env" "${DAILY_DIR}/.env"
echo "  OK"

# --- 2) database ---
echo "=== 2/4 备份数据库 ==="
DATABASE_URL="$(env_val DATABASE_URL)"
if [[ -z "$DATABASE_URL" ]]; then
  echo "FAIL: DATABASE_URL 未设置" >&2
  exit 1
fi
parse_database_url "$DATABASE_URL"

# Docker 映射到宿主机时常是 localhost；URL 里若是容器名则回退 localhost
if [[ "$DB_HOST" != "localhost" && "$DB_HOST" != "127.0.0.1" ]]; then
  if ! getent hosts "$DB_HOST" >/dev/null 2>&1; then
    echo "  WARN: 主机 ${DB_HOST} 不可达，改用 127.0.0.1"
    DB_HOST="127.0.0.1"
  fi
fi

PGPASSWORD="$DB_PASS" pg_dump \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --no-owner --no-acl \
  | gzip -c > "${DAILY_DIR}/database.sql.gz"

echo "  $(du -h "${DAILY_DIR}/database.sql.gz" | cut -f1)"

# --- 3) papers（周日，或 FORCE_PAPERS=1）---
echo "=== 3/4 备份文献 PDF ==="
if [[ "$DOW" == "7" || "${FORCE_PAPERS:-0}" == "1" ]]; then
  PAPERS_TAR="${PAPERS_DIR}/${DATE}.tar.gz"
  tar -czf "$PAPERS_TAR" -C "$APP_DIR" papers/
  echo "  周备完成: $(du -h "$PAPERS_TAR" | cut -f1)"
else
  echo "  跳过（非周日；下次周日做周备。紧急补做: FORCE_PAPERS=1）"
fi

# --- 4) 清理 ---
echo "=== 4/4 清理旧备份 ==="

# 日备按天
find "${BACKUP_ROOT}/daily" -mindepth 1 -maxdepth 1 -type d -mtime "+${KEEP_DAILY_DAYS}" -exec rm -rf {} \; 2>/dev/null || true
echo "  日备保留 ${KEEP_DAILY_DAYS} 天"

# 文献周备保留最近 N 份
ls -1t "${PAPERS_DIR}"/*.tar.gz 2>/dev/null \
  | tail -n +"$((KEEP_PAPERS_COUNT + 1))" \
  | while read -r f; do
      rm -f "$f"
      echo "  删除旧文献包: $(basename "$f")"
    done || true
echo "  文献周备保留 ${KEEP_PAPERS_COUNT} 份"

# 兼容清理：旧版扁平目录 grainscript_YYYY-MM-DD（含每日 7G papers）
# 若尚无周备，先把最新一份 papers.tar.gz 迁到 papers/
if compgen -G "${BACKUP_ROOT}/grainscript_*" >/dev/null; then
  if [[ -z "$(ls -A "${PAPERS_DIR}"/*.tar.gz 2>/dev/null || true)" ]]; then
    LATEST_PAPERS=$(ls -1dt "${BACKUP_ROOT}"/grainscript_*/papers.tar.gz 2>/dev/null | head -1 || true)
    if [[ -n "${LATEST_PAPERS}" && -f "${LATEST_PAPERS}" ]]; then
      MIG_DATE=$(basename "$(dirname "$LATEST_PAPERS")" | sed 's/^grainscript_//')
      echo "  迁移旧文献包 → papers/${MIG_DATE}.tar.gz"
      mv "$LATEST_PAPERS" "${PAPERS_DIR}/${MIG_DATE}.tar.gz"
    fi
  fi
  echo "  清理旧版扁平备份目录 grainscript_* …"
  rm -rf "${BACKUP_ROOT}"/grainscript_*
fi

echo ""
echo "✓ 日备完成: ${DAILY_DIR}"
du -sh "$DAILY_DIR"
echo "✓ 备份根目录:"
du -sh "$BACKUP_ROOT"
