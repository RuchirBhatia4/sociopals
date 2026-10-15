#!/usr/bin/env bash
# Nightly database backup (keeps 14 days). Install:  sudo cp deploy/app/backup-db.sh /etc/cron.daily/sociopals-backup
set -euo pipefail
mkdir -p /opt/sociopals-backups
docker compose -f /opt/sociopals/deploy/app/docker-compose.yml exec -T db \
  pg_dump -U sociopals --clean --if-exists sociopals | gzip > "/opt/sociopals-backups/sociopals-$(date +%F).sql.gz"
find /opt/sociopals-backups -name '*.sql.gz' -mtime +14 -delete
