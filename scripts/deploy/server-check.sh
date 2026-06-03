#!/usr/bin/env bash
set -euo pipefail
APP="${APP:-/home/ubuntu/grainscript}"
cd "$APP"

echo "=== ENV KEYS ==="
awk -F= '/^[A-Z_]+=/ {print $1}' .env 2>/dev/null | sort || true

echo "=== ENV PRESENCE (set/not) ==="
for k in DEEPSEEK_API_KEY ZHIPU_API_KEY JWT_SECRET RAG_EMBEDDING_API_KEY RAG_EMBEDDING_API_BASE RAG_EMBEDDING_MODEL PYTHON_CMD; do
  if grep -q "^${k}=" .env 2>/dev/null && [ -n "$(grep "^${k}=" .env | cut -d= -f2- | tr -d ' \r')" ]; then
    echo "$k: set"
  else
    echo "$k: MISSING or empty"
  fi
done

echo "=== PRISMA MIGRATE ==="
npx prisma migrate status 2>&1 | tail -15 || true

echo "=== PROJECT COLUMN ==="
PGPASSWORD="${PGPASSWORD:-grainscript_dev_2024}" psql -h 127.0.0.1 -U grainscript -d grainscript -t -A -c \
  "SELECT column_name FROM information_schema.columns WHERE table_name='Project' AND column_name='expandedOutlineSections';" 2>&1 || echo "psql failed"

echo "=== FAILED MIGRATION LOG (head) ==="
PGPASSWORD="${PGPASSWORD:-grainscript_dev_2024}" psql -h 127.0.0.1 -U grainscript -d grainscript -t -A -c \
  "SELECT substring(logs from 1 for 600) FROM _prisma_migrations WHERE migration_name='20260602140000_add_expanded_outline_sections';" 2>&1 || true

echo "=== PYTHON ==="
python3 --version
python3 -c 'import matplotlib; print("matplotlib OK")' 2>&1 || echo "matplotlib FAIL"
python3 -c 'import numpy, pandas; print("numpy/pandas OK")' 2>&1 || echo "numpy/pandas FAIL"

echo "=== PLAYWRIGHT (node) ==="
node -e "try{require('playwright');console.log('playwright module OK')}catch(e){console.log('playwright module FAIL:',e.message)}" 2>&1

echo "=== PM2 RESTARTS ==="
pm2 jlist 2>/dev/null | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const j=JSON.parse(d);
  j.filter(p=>p.name==='grainscript').forEach(p=>{
    console.log('id',p.pm_id,'restarts',p.pm2_env.restart_time,'mem',Math.round((p.monit?.memory||0)/1024/1024),'MB');
  });
});" 2>&1 || pm2 status

echo "=== PM2 ERRORS (last 40 lines) ==="
tail -40 /home/ubuntu/.pm2/logs/grainscript-error-0.log 2>/dev/null || echo "no error log"

echo "=== KNOWLEDGE DB SAMPLE ==="
PGPASSWORD="${PGPASSWORD:-grainscript_dev_2024}" psql -h 127.0.0.1 -U grainscript -d grainscript -t -A -c \
  "SELECT COUNT(*), SUM(CASE WHEN \"chunkCount\"=0 THEN 1 ELSE 0 END) FROM \"KnowledgeFile\";" 2>&1 || true

echo "=== DONE ==="
