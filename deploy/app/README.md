# Deploying Sociopals on your own server (Oracle Always Free, or any Ubuntu server)

The simplest option is Heroku with your student credit: see **deploy/heroku/README.md**.
Use this guide if you'd rather run everything on one server you control, for example
Oracle Cloud's **Always Free** plan ($0 with no end date, 2 Arm CPUs / 12 GB), which is also
big enough to run the code runner alongside.

```
Internet → Caddy (HTTPS, automatic certificates) → Sociopals (Next.js + Socket.io) → Postgres
```

Your address will be `https://sociopals.ruchirbhatia.com`.

---

## 1. Create the server (Oracle Always Free)
1. Sign up at **oracle.com/cloud/free**. Oracle checks a card to confirm who you are (a temporary
   hold, not a charge). Pick a US West or US East home region; it can't be changed later.
2. Compute → Instances → **Create instance**: image **Ubuntu 24.04**, shape **Ampere
   VM.Standard.A1.Flex** with **2 OCPUs / 12 GB** (marked "Always Free"), your SSH key
   (`~/.ssh/id_ed25519.pub`), boot volume 50 GB.
3. Instance → Subnet → Default Security List → **Add Ingress Rules**: source `0.0.0.0/0`, TCP
   ports `80` and `443`.
4. **Billing → Upgrade to Pay As You Go** and **Budgets → $1 alert**. You still pay $0 within the
   free limits, but Oracle won't stop the server for being "idle".

(Any other Ubuntu 24.04 server with 2 GB+ memory works the same way: Azure for Students, etc.)

## 2. Point your subdomain at it
In **Vercel → Domains → ruchirbhatia.com → DNS Records**, add an **A** record named `sociopals`
with the server's public IP. Your portfolio isn't affected.

## 3. Switch Clerk (sign-in) to production
1. Clerk dashboard → your app → **Create production instance**.
2. Domain `sociopals.ruchirbhatia.com`; add the **CNAME records** Clerk lists in Vercel DNS, then **Verify**.
3. Using **Sign in with Google**? Production needs your own Google OAuth client (Clerk walks you through it).
4. Copy the production keys (`pk_live_…`, `sk_live_…`).

## 4. Put the code on the server
```bash
ssh ubuntu@<SERVER-IP>
sudo git clone https://github.com/RuchirBhatia4/sociopals.git /opt/sociopals
cd /opt/sociopals && sudo bash deploy/app/setup.sh
```
`setup.sh` installs Docker, adds swap, opens only ports 22/80/443 (including Oracle's built-in
firewall), and creates `deploy/app/.env` with a generated database password and encryption key.

## 5. Fill in the settings
```bash
sudo nano /opt/sociopals/deploy/app/.env
```
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`: the **production** keys from step 3
- `UPLOADTHING_*`, `LIVEKIT_*`, `NEXT_PUBLIC_LIVEKIT_URL`: copy from your local `~/sociopals/.env`
- Leave the generated `POSTGRES_PASSWORD` and `ENCRYPTION_KEY` as they are.
- Optional: `ANTHROPIC_API_KEY`, GitHub OAuth (step 7), code runner.

## 6. Start it
```bash
cd /opt/sociopals && sudo docker compose -f deploy/app/docker-compose.yml up -d --build
```
The first build takes about 5–10 minutes. Then open **https://sociopals.ruchirbhatia.com** and sign up.
It starts with an empty database.

Check on it:
```bash
sudo docker compose -f deploy/app/docker-compose.yml ps
sudo docker compose -f deploy/app/docker-compose.yml logs -f app
```

## 7. Optional extras
- **GitHub in project mode:** GitHub → Settings → Developer settings → **New OAuth App** with
  Homepage `https://sociopals.ruchirbhatia.com` and callback
  `https://sociopals.ruchirbhatia.com/api/github/callback`. Put its ID/secret in `.env` and restart.
- **Code runner** (C, C++, Java, Go, Rust…): see `deploy/code-runner/README.md`. On Oracle's 12 GB
  server it fits on a second free instance, or on this one if you give it its own hostname.

## Updating after you change the code
On your Mac: commit and `git push`. Then on the server:
```bash
cd /opt/sociopals && sudo git pull && sudo docker compose -f deploy/app/docker-compose.yml up -d --build
```
New database migrations are applied automatically when the app starts.

## Restart, stop, backups
```bash
sudo docker compose -f deploy/app/docker-compose.yml restart app     # after editing .env
sudo docker compose -f deploy/app/docker-compose.yml down            # stop (data is kept)
ls /opt/sociopals-backups                                             # nightly DB backups, 14 days
```
