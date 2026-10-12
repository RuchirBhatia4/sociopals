#!/usr/bin/env bash
# One-time setup on a fresh Ubuntu 22.04/24.04 server (Oracle Cloud Arm or x86, DigitalOcean, Azure…).
#   curl -fsSL <this file> | sudo bash -s -- <your-hostname>
# or copy this folder to the server and run:  sudo ./setup.sh <your-hostname>
# <your-hostname>: a domain pointing at the server, or <public-ip>.sslip.io (free, no signup).
set -euo pipefail
HOSTNAME_ARG="${1:-}"
if [ -z "$HOSTNAME_ARG" ]; then echo "Usage: sudo ./setup.sh <hostname, e.g. 129.146.10.20.sslip.io>"; exit 1; fi
cd "$(dirname "$0")"

echo "==> Packages"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https iptables-persistent

echo "==> Node.js 22"
if ! node -v 2>/dev/null | grep -q '^v2[2-9]'; then curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs; fi

echo "==> Docker"
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; fi
systemctl enable --now docker

echo "==> Caddy (HTTPS in front of the runner, certificates are automatic)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi
sed "s/{{HOST}}/$HOSTNAME_ARG/" Caddyfile > /etc/caddy/Caddyfile
systemctl restart caddy

echo "==> Open ports 80/443 (Oracle's Ubuntu images block them by default)"
iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
netfilter-persistent save || true

echo "==> The runner service"
id coderunner >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin coderunner
usermod -aG docker coderunner
install -d -o coderunner /opt/code-runner
install -o coderunner -m 644 server.mjs /opt/code-runner/server.mjs
if [ ! -f /etc/code-runner.env ]; then
  echo "RUNNER_TOKEN=$(openssl rand -hex 32)" > /etc/code-runner.env
  echo "MAX_PARALLEL=2" >> /etc/code-runner.env
  chmod 600 /etc/code-runner.env
fi
install -m 644 code-runner.service /etc/systemd/system/code-runner.service
systemctl daemon-reload
systemctl enable --now code-runner
systemctl restart code-runner

echo "==> Downloading the language images (a few GB, takes a while once)"
for img in gcc:14 eclipse-temurin:21-jdk golang:1.23 rust:1-slim ruby:3.3-slim php:8.3-cli bash:5 python:3.12-slim node:22-slim; do
  docker pull -q "$img"
done

echo "==> Clean up old containers/images weekly"
echo "0 4 * * 0 root docker container prune -f >/dev/null 2>&1" > /etc/cron.d/code-runner-cleanup

TOKEN=$(grep RUNNER_TOKEN /etc/code-runner.env | cut -d= -f2)
echo
echo "Done. Put these in Sociopals' .env (and on Vercel):"
echo "  CODE_RUNNER_URL=https://$HOSTNAME_ARG"
echo "  CODE_RUNNER_TOKEN=$TOKEN"
echo
echo "Test:  curl -s -H \"Authorization: Bearer $TOKEN\" https://$HOSTNAME_ARG/languages"
