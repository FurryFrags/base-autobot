# Base AutoBot (Cloudflare-only infra)

**What this is:** a Cloudflare Workers + KV autonomous trading skeleton for **Base mainnet (chainId 8453)** that can quote and trade **ONLY** the allowlisted tokens:

- cbBTC (CBBTC)
- WETH (ETH on Base)
- LINK
- AAVE
- USDC

**What it's NOT (by default):**
- It does **not** auto-trade out of the box. The bot starts **PAUSED** and the example strategy never trades until you change it.

## Components

- `worker/` — Cloudflare Worker (cron-driven) + small JSON API
- `apps/dashboard/` — Cloudflare Pages static dashboard + optional Coinbase Wallet Extension connect

## Key contracts (Base)

- Base RPC (default): `https://mainnet.base.org`
- Uniswap V3 Deployments on Base: https://docs.uniswap.org/contracts/v3/reference/deployments/base-deployments

This template uses:
- **QuoterV2**: `0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a`
- **SwapRouter02**: `0x2626664c2603336E57B271c5C0b26F421741e481`

## Quick start (local)

1) `cd worker`
2) `npm i`
3) `npx wrangler dev`

See the full step-by-step deployment guide in **DEPLOYMENT.md**.
