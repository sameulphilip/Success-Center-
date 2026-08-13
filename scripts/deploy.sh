#!/usr/bin/env bash
# Deploy Success Center on a VPS (Docker Compose production).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.prod.yml)

if [[ ! -f .env ]]; then
  echo "→ Creating .env from .env.production.example"
  cp .env.production.example .env
  echo "✎ Edit .env now (JWT_SECRET, POSTGRES_PASSWORD, DATABASE_URL, NEXT_PUBLIC_API_URL)"
  echo "  then re-run: bash scripts/deploy.sh"
  exit 1
fi

echo "→ Building & starting stack..."
"${COMPOSE[@]}" up -d --build

echo "→ Waiting for API..."
sleep 5
"${COMPOSE[@]}" ps

echo ""
echo "Done."
echo "  Web:  http://$(hostname -I 2>/dev/null | awk '{print $1}'):${WEB_PORT:-3000}"
echo "  API:  http://$(hostname -I 2>/dev/null | awk '{print $1}'):${API_PORT:-3001}/api"
echo "  DB:   see DATABASE_URL / POSTGRES_* in .env"
echo ""
echo "Optional seed:  ${COMPOSE[*]} exec api pnpm prisma:seed"
