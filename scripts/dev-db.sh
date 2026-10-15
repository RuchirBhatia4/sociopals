#!/usr/bin/env bash
# Start a private Postgres for local development on 127.0.0.1:5433, with its data in
# .pgdata/ (git-ignored). Needs Postgres 16 (brew install postgresql@16).
# Then: npx prisma migrate dev
set -euo pipefail
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8   # Postgres refuses to start on macOS without a valid locale
cd "$(dirname "$0")/.."
mkdir -p .devdb
if [ ! -d .pgdata ]; then
  initdb -D .pgdata -U postgres --auth=trust --encoding=UTF8 --locale=C >/dev/null
fi
if pg_ctl -D .pgdata status >/dev/null 2>&1; then echo "Postgres already running on 5433"; exit 0; fi
pg_ctl -D .pgdata -l .devdb/postgres.log -o "-p 5433 -k $PWD/.devdb -c listen_addresses=127.0.0.1" -w start >/dev/null
createdb -h 127.0.0.1 -p 5433 -U postgres sociopals 2>/dev/null || true
echo "Postgres running on 127.0.0.1:5433 (database: sociopals)"
