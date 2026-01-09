# Base AutoBot (Cloudflare Workers)

**What this is:** a Cloudflare Worker + KV trading signal engine that fetches a price feed, generates buy/sell/hold signals, and either simulates trades (paper mode) or forwards signals to your own execution webhook.

**What it's NOT (by default):**
- It does **not** custody funds or trade on-chain directly.
- It starts **PAUSED** and only runs when you resume it.

## Components

- `worker/` — Cloudflare Worker (cron-driven) + JSON API
- `apps/dashboard/` — Cloudflare Pages static dashboard

## Quick start (local)

1) `cd worker`
2) `npm i`
3) `npx wrangler dev`

See the full step-by-step deployment guide in **DEPLOYMENT.md**.
