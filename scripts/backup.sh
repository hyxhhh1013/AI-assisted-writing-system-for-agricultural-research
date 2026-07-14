#!/usr/bin/env bash
# GrainScript 备份脚本
# 用法: bash /home/ubuntu/backups/backup.sh
# 产出: /home/ubuntu/backups/grainscript_YYYY-MM-DD/
set -euo pipefail

DATE=$(date +%Y-%m-%d)
BACKUP_DIR="/home/ubuntu/backups/grainscript_${DATE}"
KEEP_DAYS=5  # 保留最近 N 天的备份（磁盘有限，不宜过大）

mkdir -p "$BACKUP_DIR"

echo "=== 1/4 备份 .env ==="
cp /home/ubuntu/grainscript/.env "$BACKUP_DIR/.env"

echo "=== 2/4 备份数据库 ==="
PGPASSWORD=grainscript_dev_2024 pg_dump \
  -h localhost -p 5432 -U grainscript -d grainscript \
  --no-owner --no-acl \
  > "$BACKUP_DIR/database.sql"
echo "  $(wc -c < "$BACKUP_DIR/database.sql") bytes"

echo "=== 3/4 备份文献 PDF ==="
tar -czf "$BACKUP_DIR/papers.tar.gz" \
  -C /home/ubuntu/grainscript papers/ 2>/dev/null
echo "  $(du -h "$BACKUP_DIR/papers.tar.gz" | cut -f1)"

echo "=== 4/4 清理旧备份 ==="
find /home/ubuntu/backups -maxdepth 1 -type d -name "grainscript_*" -mtime +${KEEP_DAYS} -exec rm -rf {} \; 2>/dev/null
echo "  保留最近 ${KEEP_DAYS} 天"

echo ""
echo "✓ 备份完成: $BACKUP_DIR"
du -sh "$BACKUP_DIR"
