#!/usr/bin/env bash
# Nightly database backup (keeps 14 days). Install:  sudo cp deploy/app/backup-db.sh /etc/cron.daily/sociopals-backup
set -euo pipefail
mkdir -p /opt/sociopals-backups
MYSQL_ROOT_PASSWORD=$(grep '^MYSQL_ROOT_PASSWORD=' /opt/sociopals/deploy/app/.env | cut -d= -f2-)
docker compose -f /opt/sociopals/deploy/app/docker-compose.yml exec -T db \
  mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction sociopals | gzip > "/opt/sociopals-backups/sociopals-$(date +%F).sql.gz"
find /opt/sociopals-backups -name '*.sql.gz' -mtime +14 -delete
