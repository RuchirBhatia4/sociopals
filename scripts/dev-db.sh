#!/usr/bin/env bash
# Start a private MySQL for local development on 127.0.0.1:3307, with its data in
# .mysql-data/ (git-ignored). Uses $MYSQLD if set, otherwise `mysqld` on PATH.
# Then: npx prisma db push
set -euo pipefail
cd "$(dirname "$0")/.."
MYSQLD="${MYSQLD:-$(command -v mysqld)}"
BIN="$(dirname "$MYSQLD")"
MSG="$(dirname "$(find "$BIN/../share" -name errmsg.sys -path '*english*' 2>/dev/null | head -1)" 2>/dev/null || true)"
EXTRA=(); [ -n "$MSG" ] && EXTRA+=(--lc-messages-dir="$(dirname "$MSG")")
mkdir -p .devdb
if [ ! -d .mysql-data ]; then
  "$MYSQLD" --initialize-insecure --datadir="$PWD/.mysql-data" --user="$(whoami)" "${EXTRA[@]}"
fi
if "$BIN/mysqladmin" -uroot -h127.0.0.1 -P3307 ping --silent 2>/dev/null; then echo "MySQL already running on 3307"; exit 0; fi
"$MYSQLD" --datadir="$PWD/.mysql-data" --port=3307 --bind-address=127.0.0.1 \
  --socket="$PWD/.devdb/mysql.sock" --pid-file="$PWD/.devdb/mysql.pid" --log-error="$PWD/.devdb/mysql.err" \
  --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci "${EXTRA[@]}" &
for _ in $(seq 1 30); do "$BIN/mysqladmin" -uroot -h127.0.0.1 -P3307 ping --silent 2>/dev/null && break; sleep 1; done
"$BIN/mysql" -uroot -h127.0.0.1 -P3307 -e "CREATE DATABASE IF NOT EXISTS sociopals CHARACTER SET utf8mb4"
echo "MySQL ready on 127.0.0.1:3307 (database: sociopals)"
