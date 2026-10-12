# Sociopals code runner

Runs C, C++, Java, Go, Rust, Ruby, PHP, Shell, TypeScript (and Python/JavaScript) snippets
from chat messages. Python and JavaScript already run in the browser; this server adds
everything else.

Each run happens in a throwaway Docker container built from the official language image:
no network, read-only image, 512 MB–1 GB memory, 1 CPU, 128 processes, no Linux
capabilities, runs as `nobody`, killed after 15–30 s, output capped at 64 KB.
Sociopals only lets signed-in people run code, 8 runs a minute and 150 a day each.

It works on Arm (Oracle's free servers) and on normal x86 servers (DigitalOcean, Azure…).

---

## Option A: Oracle Cloud Always Free ($0/month)

### 1. Create the account
1. Sign up at <https://www.oracle.com/cloud/free/>. Oracle checks a credit card (or a
   credit-style debit card) to confirm who you are. They place a temporary hold that your
   bank releases in a few days, and there's no charge. Prepaid or virtual cards aren't accepted.
2. Pick your **home region** carefully, because you can't change it later. A US West or US
   East region is closest to USC. If a region says "out of capacity" for Arm servers, try
   again later or pick a different availability domain.

### 2. Create the server
Compute → Instances → **Create instance**:
- **Image:** Canonical Ubuntu 24.04 (the aarch64 build is chosen for you with the Arm shape)
- **Shape:** Ampere → `VM.Standard.A1.Flex`, **2 OCPUs, 12 GB memory** (the Always Free limit)
- **Networking:** keep the defaults, and make sure "Assign a public IPv4 address" is on
- **SSH keys:** upload your public key (`~/.ssh/id_ed25519.pub`; create one with `ssh-keygen -t ed25519` if you don't have one)
- **Boot volume:** 50 GB (the language images use about 6 GB)

Look for the **Always Free-eligible** label before you click Create.

### 3. Open the web ports
Instance → Subnet → Default Security List → **Add Ingress Rules**:
- Source `0.0.0.0/0`, TCP, destination port `80`
- Source `0.0.0.0/0`, TCP, destination port `443`

(`setup.sh` also opens them in the server's own firewall, which Oracle's Ubuntu image blocks by default.)

### 4. Install everything (about 10 minutes)
From your Mac, in the `sociopals` folder:

```bash
scp -r deploy/code-runner ubuntu@<PUBLIC-IP>:~/
ssh ubuntu@<PUBLIC-IP>
cd code-runner && sudo ./setup.sh <PUBLIC-IP>.sslip.io
```

`<PUBLIC-IP>.sslip.io` is a free hostname that points at your server (no signup), so Caddy
can get a real HTTPS certificate automatically. If you have a domain, use a subdomain like
`run.yourdomain.com` (an A record pointing at the IP) instead.

At the end it prints two lines. Put them in Sociopals' `.env` locally, and later in your
hosting provider's environment variables:

```
CODE_RUNNER_URL=https://<PUBLIC-IP>.sslip.io
CODE_RUNNER_TOKEN=<long random token>
```

Restart Sociopals, and **Run** buttons appear on C++/Java/Go/Rust/… code blocks.

### 5. Keep it from being shut down (important)
Oracle stops Always Free servers it considers idle (very low CPU, network and memory over
7 days), and a code runner is idle most of the time. To avoid this:
1. **Billing → Upgrade to Pay As You Go.** You still pay $0 while you stay within the
   Always Free resources, and idle servers on paid accounts aren't reclaimed.
2. **Billing → Budgets → Create budget** of **$1** with an email alert, so any mistake (like
   choosing a non-free server size) is caught immediately.

### Optional: even stronger isolation (gVisor)
gVisor puts each run behind its own user-space kernel. Recommended if strangers can join your servers.

```bash
curl -fsSL https://gvisor.dev/archive.key | sudo gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" | sudo tee /etc/apt/sources.list.d/gvisor.list
sudo apt-get update && sudo apt-get install -y runsc
sudo runsc install && sudo systemctl reload docker
echo "SANDBOX_RUNTIME=runsc" | sudo tee -a /etc/code-runner.env
sudo systemctl restart code-runner
```

---

## Option B: student credits (also $0 for you)
`setup.sh` works the same on these (they're normal x86 Ubuntu servers):

| Provider | What students get | Server to pick | Lasts about |
|---|---|---|---|
| **DigitalOcean** via the GitHub Student Developer Pack | $200 credit for 12 months | Basic Droplet, 2 GB / 1 CPU ($12/mo) | the full 12 months |
| **Azure for Students** (sign in with your USC email; no card) | $100 credit a year, renewable while you're a student | B1ms, 2 GB (about $15/mo) | about 6 months a year |

Open ports 80 and 443 in the provider's firewall, then follow step 4 above.

---

## Day-to-day
- **Is it up?** `curl https://<host>/health`
- **Logs:** `sudo journalctl -u code-runner -f`
- **Update** after changing `server.mjs`: copy the folder again and re-run `sudo ./setup.sh <host>` (your token is kept).
- **New token:** edit `/etc/code-runner.env`, run `sudo systemctl restart code-runner`, and update Sociopals' `.env`.
- **More parallel runs:** raise `MAX_PARALLEL` in `/etc/code-runner.env` (2 is safe for 2 OCPUs).

## Local testing (never on a server)
`RUNNER_UNSAFE_LOCAL=1 RUNNER_TOKEN=<24+ chars> node server.mjs` runs code with the tools
installed on your computer, **without any sandbox**, and only listens on 127.0.0.1. Use it
only to test, and stop it afterwards.
