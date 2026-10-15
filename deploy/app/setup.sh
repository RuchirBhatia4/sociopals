#!/usr/bin/env bash
# First-time setup of a fresh Ubuntu 24.04 server for Sociopals.
#   sudo bash deploy/app/setup.sh        (from the cloned repo at /opt/sociopals)
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Docker"
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; fi
systemctl enable --now docker

echo "==> 2 GB swap (building the app needs extra memory on small servers)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Firewall: SSH, HTTP, HTTPS only"
if iptables -S INPUT 2>/dev/null | grep -q "REJECT"; then
  # Oracle's Ubuntu images block everything but SSH with iptables rules; open 80/443 above them
  apt-get install -y iptables-persistent >/dev/null 2>&1 || true
  for port in 80 443; do
    iptables -C INPUT -p tcp --dport $port -j ACCEPT 2>/dev/null || iptables -I INPUT 6 -m state --state NEW -p tcp --dport $port -j ACCEPT
  done
  netfilter-persistent save >/dev/null 2>&1 || true
elif command -v ufw >/dev/null; then
  ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
fi

echo "==> Settings file"
if [ ! -f .env ]; then
  cp env.example .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
  sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$(openssl rand -base64 32)|" .env
  chmod 600 .env
  echo
  echo "Created deploy/app/.env with a database password and an encryption key."
  echo "Now fill in the rest:  nano $(pwd)/.env"
  echo "Then start everything:  cd /opt/sociopals && docker compose -f deploy/app/docker-compose.yml up -d --build"
else
  echo "deploy/app/.env already exists; leaving it alone."
fi

echo "==> Nightly database backups (kept 14 days in /opt/sociopals-backups)"
cp backup-db.sh /etc/cron.daily/sociopals-backup && chmod +x /etc/cron.daily/sociopals-backup
