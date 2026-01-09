# Step-by-step deployment (GitHub + Cloudflare ONLY)

This guide deploys:
- a **Cloudflare Worker** (autonomous bot engine) using **GitHub Actions**
- a **Cloudflare Pages** site (dashboard) using **Cloudflare Pages Git integration**

> The Worker runs on a schedule (Cron Trigger). It starts **PAUSED** by default.

---

## 0) Prereqs

- A Cloudflare account with Workers & Pages enabled.
- A GitHub repo (you will push this project).
- Node.js 18+ locally (only for optional local tests; deployment itself is GitHub Actions + Cloudflare).

---

## 1) Create the GitHub repo

1. Create a new GitHub repo, e.g. `base-autobot`.
2. Upload the contents of this folder to the repo root.
3. Ensure default branch is `main`.

---

## 2) Create Cloudflare KV namespace

In Cloudflare Dashboard:

1. Go to **Workers & Pages → KV**.
2. Create a namespace named e.g. `BASE_AUTOBOT_KV`.
3. Copy the **Namespace ID** (you will paste it into `worker/wrangler.toml`).

> KV is used to store bot state (pause flag, params, last run results).

---

## 3) Create a Cloudflare API token for GitHub Actions

Cloudflare docs recommend deploying Workers via the official GitHub Action / wrangler-action.

1. Cloudflare Dashboard → **My Profile → API Tokens**.
2. Create token with permissions sufficient to deploy Workers and manage KV bindings.

A minimal practical set (varies by account setup) is typically:
- **Account → Workers Scripts → Edit**
- **Account → Workers KV Storage → Edit**
- **Account → Account Settings → Read** (sometimes needed)
- If you deploy to a specific zone/route, add the needed Zone permissions (this template does not require routes).

Copy the token value.

---

## 4) Add GitHub Actions secrets

In your GitHub repo:

**Settings → Secrets and variables → Actions → New repository secret**

Add:

- `CLOUDFLARE_API_TOKEN` = the token you created
- `CLOUDFLARE_ACCOUNT_ID` = your Cloudflare account ID
- `BOT_PRIVATE_KEY` = EVM private key used by the Worker to sign trades on Base
  - fund this address with small ETH on Base for gas

> The private key is stored as a **Worker Secret** at deploy time.

---

## 5) Configure the Worker

Edit `worker/wrangler.toml`:

1. Set `name` to something globally unique (Workers names are global per account).
2. Paste your KV namespace id into:
   ```
   kv_namespaces = [
     { binding = "KV", id = "PASTE_KV_ID_HERE" }
   ]
   ```
3. Optionally change the cron schedule:
   - default: every 5 minutes: `*/5 * * * *`

---

## 6) Set required Worker secrets

Before deploying, set the required secret in your Cloudflare account:

```bash
cd worker
wrangler secret put BOT_PRIVATE_KEY
```

---

## 7) First deploy (Worker)

Wrangler must run against the Worker config in `worker/`.

### Option A: Cloudflare “Deploy from Git”

Set the build command to one of:

- `cd worker && npx wrangler deploy`
- `npx wrangler deploy --config worker/wrangler.toml`

### Option B: CI workflow (GitHub Actions or similar)

Ensure the workflow runs Wrangler from `worker/`, or pass the config explicitly:

- set the working directory to `worker/` and run `npx wrangler deploy`
- or run `npx wrangler deploy --config worker/wrangler.toml`

Then deploy and confirm the Worker exists:

1. Push to `main` (or trigger the workflow).
2. Confirm the deploy succeeds.
3. In Cloudflare Dashboard → Workers & Pages → Workers:
   - open your Worker
   - note the public URL (e.g. `https://baseautobot.<your-subdomain>.workers.dev`)

### Confirm the API works

Open:

- `https://<worker-url>/health`
- `https://<worker-url>/state`

Expected:
- `/health` returns `{ "ok": true }`
- `/state` shows `paused: true`

---

## 8) Create & deploy the Dashboard (Pages)

This dashboard is static HTML/JS in `apps/dashboard/` (no build step).

### Option A (recommended): Pages Git integration

1. Cloudflare Dashboard → **Workers & Pages → Pages → Create**
2. Choose **Connect to Git**
3. Select your GitHub repo
4. Set:
   - **Root directory**: `apps/dashboard`
   - **Build command**: *(leave empty)*
   - **Build output directory**: *(leave empty)*

Deploy.

### Configure the dashboard to point at your Worker

In Cloudflare Pages:
- **Settings → Environment variables**
- Add:
  - `WORKER_BASE_URL` = `https://<worker-url>`

Then redeploy.

---

## 9) Unpause + run safely

The bot is paused by default. To unpause:

- Dashboard: click **Resume**
- Or call:
  - `POST https://<worker-url>/resume`

**Important:** the included strategy never trades until you change it.
See `worker/src/strategy.ts`.

---

## 10) Making it trade

Open `worker/src/strategy.ts` and implement your decision logic.

The helper in `worker/src/uniswap.ts` supports:
- quoting with `QuoterV2`
- swapping with `SwapRouter02` via `exactInputSingle`

Recommended bring-up steps:

1. Run in **quote-only** mode first (`execute: false`)
2. Enable approvals with tiny amounts
3. Enable execution with tiny amounts
4. Add guards:
   - max trades per day
   - max slippage bps
   - minimum liquidity checks (your call)

---

## 11) Coinbase Wallet Extension usage

The Worker is autonomous and signs with `BOT_PRIVATE_KEY`.

Coinbase Wallet Extension is used for:
- funding the bot address
- viewing balances
- emergency withdrawals
- manual control via the dashboard “Connect Wallet” button (optional)

---

## 12) Updating secrets safely

To rotate the bot key:

1. Put the Worker in paused mode:
   - `POST /pause`
2. Update GitHub secret `BOT_PRIVATE_KEY`
3. Push any commit (or re-run workflow) to redeploy
4. Fund the new address if needed
5. Resume

---

## Troubleshooting

### Cron not running?
- Cron triggers run in UTC and may not fire immediately after deploy.
- Confirm Cron is configured in `worker/wrangler.toml` and visible in the Worker settings.

### “Missing token address”
- Only the allowlisted tokens are included. If you edit allowlist, you must provide valid addresses.

### Quote succeeds, swap fails
Common causes:
- insufficient allowance
- insufficient balance
- wrong pool fee tier
- slippage too tight
- token has transfer fees / special behavior

---
