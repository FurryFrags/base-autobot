# Step-by-step deployment (GitHub + Cloudflare ONLY)

This guide deploys:
- a **Cloudflare Worker** (trading signal engine) using **GitHub Actions** or Deploy from Git
- a **Cloudflare Pages** site (dashboard) using **Cloudflare Pages Git integration**

> The Worker runs on a schedule (Cron Trigger) and starts **PAUSED** by default.

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

> KV stores bot state (pause flag, params, last run results).

---

## 3) Create a Cloudflare API token for GitHub Actions

Cloudflare docs recommend deploying Workers via the official GitHub Action / wrangler-action.

1. Cloudflare Dashboard → **My Profile → API Tokens**.
2. Create token with permissions sufficient to deploy Workers and manage KV bindings.

A minimal practical set (varies by account setup) is typically:
- **Account → Workers Scripts → Edit**
- **Account → Workers KV Storage → Edit**
- **Account → Account Settings → Read** (sometimes needed)

Copy the token value.

---

## 4) Add GitHub Actions secrets

In your GitHub repo:

**Settings → Secrets and variables → Actions → New repository secret**

Add:

- `CLOUDFLARE_API_TOKEN` = the token you created
- `CLOUDFLARE_ACCOUNT_ID` = your Cloudflare account ID

(Optional) Add:
- `ADMIN_TOKEN` = shared secret for `/pause`, `/resume`, `/config`, `/run-once`

> `ADMIN_TOKEN` is stored as a **Worker Secret** at deploy time.

---

## 5) Configure the Worker

Edit `wrangler.toml` (repo root). If you deploy from `worker/`, keep `worker/wrangler.toml` in sync with the same values.

1. Set `name` to something globally unique (Workers names are global per account).
2. Paste your KV **Namespace ID** into:
   ```
   kv_namespaces = [
     { binding = "KV", id = "PASTE_KV_ID_HERE" }
   ]
   ```
   Here’s the most beginner-friendly way to get it from the Cloudflare dashboard:
   1. Open **Cloudflare Dashboard**.
   2. Click **Workers & Pages** in the left sidebar.
   3. Click **KV**.
   4. Click **Create a namespace**.
   5. Name it `BASE_AUTOBOT_KV`, then click **Add**.
   6. In the KV list, click the new namespace to view details.
   7. Copy the **Namespace ID** (a long hex string).
   8. Paste that value into `id = "PASTE_KV_ID_HERE"` above.

   Alternatively, you can create it from the CLI (if you have Wrangler set up):
   ```
   npx wrangler kv:namespace create BASE_AUTOBOT_KV
   ```
   Copy the `id` value from the command output.
3. Optionally change the cron schedule:
   - default: every 5 minutes: `*/5 * * * *`
4. Configure the market feed and execution mode via `[vars]`.

---

## 6) Set optional Worker secrets

If you want admin auth, set the secret in your Cloudflare account:

```bash
cd worker
wrangler secret put ADMIN_TOKEN
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

---

## 10) Hook up real execution (optional)

Set the Worker execution mode to `webhook` and configure the URL:

- `EXECUTION_MODE = "webhook"`
- `WEBHOOK_URL = "https://your-executor.example.com/trade"`
- `WEBHOOK_AUTH_TOKEN = "<optional bearer token>"`

The webhook receives JSON payloads describing the action and trade size. Implement your own executor to sign and submit trades.

---

## Troubleshooting

### Cron not running?
- Cron triggers run in UTC and may not fire immediately after deploy.
- Confirm Cron is configured in `worker/wrangler.toml` and visible in the Worker settings.

### “Invalid price from feed”
- Confirm your `PRICE_FEED_URL` and `PRICE_FIELD` are correct.
- Ensure the feed returns a numeric price.

---
