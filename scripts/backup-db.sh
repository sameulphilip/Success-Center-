#!/usr/bin/env bash
# Daily Postgres backup for Success Center (docker compose prod)
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE="docker compose -f docker-compose.prod.yml"
BACKUP_DIR="${BACKUP_DIR:-/opt/center-erp/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%F_%H%M)"
FILE="${BACKUP_DIR}/center_erp_${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date -Is)] Dumping database -> $FILE"
$COMPOSE exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-center}" "${POSTGRES_DB:-center_erp}" \
  | gzip -c > "$FILE"

find "$BACKUP_DIR" -name 'center_erp_*.sql.gz' -type f -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true

echo "[$(date -Is)] Backup OK ($(du -h "$FILE" | awk '{print $1}'))"
ls -lh "$BACKUP_DIR" | tail -n 8
