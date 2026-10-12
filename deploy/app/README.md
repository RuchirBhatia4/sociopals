# Deploying Sociopals

Sociopals needs a server that **stays running**: live chat (Socket.io), reminders and
"send later" run inside one long-lived Node process. Vercel and similar serverless hosts
can't do that, so this guide puts everything on one small server:

```
Internet → Caddy (HTTPS, automatic certificates) → Sociopals (Next.js + Socket.io) → MySQL
```

**Cost:** a DigitalOcean 2 GB droplet ($12/month), paid by the **$200 GitHub Student Pack
credit**, so $0 for about a year. Your address will be `https://sociopals.ruchirbhatia.com`
(a free subdomain of the domain you already own).

---

## 1. Create the server
1. DigitalOcean → **Create → Droplets**: **Ubuntu 24.04**, **Basic, Regular, $12/mo (2 GB / 1 CPU)**,
   region **San Francisco**, Authentication: **SSH key** (paste `~/.ssh/id_ed25519.pub`).
2. Note the droplet's **IPv4 address**.
3. Billing → set a **$1 billing alert**, so you'd know right away if anything is ever charged.

## 2. Point your subdomain at it
Your domain's DNS is at Vercel (where you bought it): Vercel → **Domains → ruchirbhatia.com →
DNS Records → Add**:

| Type | Name | Value |
|---|---|---|
| A | `sociopals` | your droplet's IP |

Your portfolio at ruchirbhatia.com isn't affected.

## 3. Switch Clerk (sign-in) to production
Your current Clerk keys are a *development* instance. They show a "development mode" banner and
are meant for testing.

1. Clerk dashboard → your app → **Create production instance** (it can copy your settings).
2. Domain: `sociopals.ruchirbhatia.com`. Clerk lists some **CNAME records**. Add each one in
   Vercel DNS like step 2, then click **Verify** in Clerk.
3. If you use **Sign in with Google**: production needs your own Google OAuth client.
   Clerk's "Google" settings page walks you through it (free, about 5 minutes).
4. Copy the production keys (`pk_live_…`, `sk_live_…`) for step 5.

## 4. Put the code on the server
Push your latest code from your Mac first:
```bash
git push origin phase-1
```
Then on the server:
```bash
ssh root@<DROPLET-IP>
git clone -b phase-1 https://github.com/RuchirBhatia4/sociopals.git /opt/sociopals
cd /opt/sociopals && sudo bash deploy/app/setup.sh
```
`setup.sh` installs Docker, adds swap memory for building, opens only ports 22/80/443, and
creates `deploy/app/.env`. Database passwords and the encryption key are generated for you.

## 5. Fill in the settings
```bash
nano /opt/sociopals/deploy/app/.env
```
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`: the **production** keys from step 3
- `UPLOADTHING_*`, `LIVEKIT_*`, `NEXT_PUBLIC_LIVEKIT_URL`: copy from your local `~/sociopals/.env`
- Leave the generated `MYSQL_*` and `ENCRYPTION_KEY` as they are.
- Optional: `ANTHROPIC_API_KEY` (AI catch-up), GitHub OAuth (step 7), code runner.

## 6. Start it
```bash
cd /opt/sociopals && docker compose -f deploy/app/docker-compose.yml up -d --build
```
The first build takes about 5–10 minutes. Then open **https://sociopals.ruchirbhatia.com** and sign up.
Your local data doesn't move: it's a fresh, empty database.

Check on it:
```bash
docker compose -f deploy/app/docker-compose.yml ps
docker compose -f deploy/app/docker-compose.yml logs -f app
```

## 7. Optional extras
- **GitHub in project mode:** GitHub → Settings → Developer settings → **New OAuth App** with
  Homepage `https://sociopals.ruchirbhatia.com` and callback
  `https://sociopals.ruchirbhatia.com/api/github/callback`. Put its ID/secret in `.env` and
  restart (below). Repo activity webhooks work automatically now that the site is public.
- **Code runner** (C, C++, Java, Go, Rust…): see `deploy/code-runner/README.md`. Run it on its own
  droplet, because it needs the Docker sandbox and its own HTTPS port.

## Updating after you change the code
On your Mac: commit and `git push`. Then on the server:
```bash
cd /opt/sociopals && git pull && docker compose -f deploy/app/docker-compose.yml up -d --build
```
Database tables update themselves when the app starts.

## Restart, stop, backups
```bash
docker compose -f deploy/app/docker-compose.yml restart app     # after editing .env
docker compose -f deploy/app/docker-compose.yml down            # stop (data is kept)
ls /opt/sociopals-backups                                        # nightly DB backups, 14 days
```

## When the credit runs out (about 12 months)
DigitalOcean starts charging the card on file. Before then, either move to Azure for Students
($100/year, no card) or Oracle Always Free, or **destroy** the droplet. A powered-off droplet is
still billed. Take a backup first: `sudo /etc/cron.daily/sociopals-backup`, then copy the newest
file from `/opt/sociopals-backups` to your Mac with `scp`.
