# Deploying Sociopals on Heroku (recommended)

Heroku runs the app as one always-on process, which live chat (Socket.io), reminders and
"send later" need, and it manages the Postgres database, HTTPS and backups for you.
Deploying is a `git push`.

**Cost:** the GitHub Student Developer Pack gives **about $13/month of Heroku credit for 24 months**.
This setup uses roughly $12/month of it, so it's **$0 for two years**. Check current prices on
heroku.com/pricing when you sign up:

| Piece | Plan | About |
|---|---|---|
| App | **Basic** dyno (doesn't sleep) | $7/mo |
| Database | **Heroku Postgres Essential-0** (1 GB) | $5/mo |

Your address will be `https://sociopals.ruchirbhatia.com`.

---

## 1. Claim the student credit
1. Go to **heroku.com/github-students** and follow the steps with your verified GitHub account.
2. Heroku may ask for a payment card to verify your account; the credit covers the charges.
3. In Heroku → **Account → Billing**, check the credit shows. Tip: also turn on usage alerts.

## 2. Install the Heroku command line (once, on your Mac)
```bash
brew tap heroku/brew && brew install heroku
```
```bash
heroku login
```

## 3. Create the app and database
From the `sociopals` folder:
```bash
heroku create sociopals-ruchir
```
```bash
heroku addons:create heroku-postgresql:essential-0
```
```bash
heroku ps:type web=basic
```
(`heroku ps:type` can only run after the first deploy in step 6; if it complains, run it then.)
Heroku sets `DATABASE_URL` for you. Don't set it yourself.

## 4. Switch Clerk (sign-in) to production
1. Clerk dashboard → your app → **Create production instance** (it can copy your settings).
2. Domain: `sociopals.ruchirbhatia.com`. Clerk lists some **CNAME records**. Add each in
   **Vercel → Domains → ruchirbhatia.com → DNS Records**, then click **Verify** in Clerk.
3. If you use **Sign in with Google**, production needs your own Google OAuth client.
   Clerk's Google settings page walks you through it.

## 5. Settings
Set these once (values from Clerk production, and the rest from your local `~/sociopals/.env`):
```bash
heroku config:set \
  NEXT_PUBLIC_SITE_URL=https://sociopals.ruchirbhatia.com \
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_... \
  CLERK_SECRET_KEY=sk_live_... \
  NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in \
  NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up \
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/ \
  NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/ \
  UPLOADTHING_SECRET=... \
  UPLOADTHING_APP_ID=... \
  LIVEKIT_API_KEY=... \
  LIVEKIT_API_SECRET=... \
  NEXT_PUBLIC_LIVEKIT_URL=wss://...
```
And a **new** encryption key for production (it protects saved GitHub tokens and AI keys):
```bash
heroku config:set ENCRYPTION_KEY="$(openssl rand -base64 32)"
```
Optional, any time later: `ANTHROPIC_API_KEY` (AI catch-up), `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
(step 8), `CODE_RUNNER_URL` / `CODE_RUNNER_TOKEN` (deploy/code-runner).

## 6. Deploy
```bash
git push heroku main
```
Heroku installs, builds (`prisma generate && next build`), then runs the **release** step from the
`Procfile`, which applies database migrations, and starts the app. Watch it with:
```bash
heroku logs --tail
```
Open it with `heroku open` (on the herokuapp.com address until step 7).

## 7. Your own address with HTTPS
```bash
heroku domains:add sociopals.ruchirbhatia.com
```
It prints a **DNS target** (something like `xyz.herokudns.com`). In Vercel DNS add:

| Type | Name | Value |
|---|---|---|
| CNAME | `sociopals` | the DNS target |

Then turn on free automatic certificates:
```bash
heroku certs:auto:enable
```
After a few minutes, open **https://sociopals.ruchirbhatia.com** and sign up. It starts with an
empty database (your local test data stays on your Mac).

## 8. Optional: GitHub in project mode
GitHub → Settings → Developer settings → **New OAuth App**: Homepage
`https://sociopals.ruchirbhatia.com`, callback `https://sociopals.ruchirbhatia.com/api/github/callback`.
Then `heroku config:set GITHUB_CLIENT_ID=... GITHUB_CLIENT_SECRET=...`. Repo activity webhooks work
automatically now that the site is public.

---

## Updating
Commit on your Mac, then:
```bash
git push origin main && git push heroku main
```
New database changes are applied automatically by the release step.

## Good to know
- **Backups:** `heroku pg:backups:capture` takes one now; `heroku pg:backups:schedule --at '04:00 America/Los_Angeles'` makes them nightly.
- **Memory:** Basic dynos have 512 MB. If logs show `R14 (Memory quota exceeded)`, tell me and we'll trim it before considering a bigger dyno.
- **30-second limit:** Heroku ends any single web request after 30 s. Chat, uploads and project-channel AI answers are fine (the AI answer streams separately). The AI chat inside a *task* panel waits for the whole answer, so a very long answer could be cut off; tell me if you see that and I'll make it stream too.
- **Code runner** (C, C++, Java, Go, Rust…): Heroku can't run its Docker sandbox. Put it on Oracle Always Free
  later (deploy/code-runner/README.md). Python and JavaScript still run in the browser.
- **After 24 months:** the credit ends and Heroku starts charging. Before then, move to your own server
  (`deploy/app/README.md`) or scale down.
