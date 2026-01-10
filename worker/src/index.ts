import { buildRuntimeConfig, type EnvBindings } from "./config";
import { executeSignal } from "./execution";
import { fetchMarketPoint } from "./market";
import { loadState, saveState } from "./state";
import { evaluateStrategy } from "./strategy";
import type { BotState } from "./types";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function htmlPage(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function renderLandingPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Base AutoBot Worker</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 24px; max-width: 760px; }
    code { background:#f6f6f6; padding: 2px 6px; border-radius: 6px; }
    a { color: #0b5fff; }
    .card { border:1px solid #eee; border-radius: 14px; padding: 16px; margin-top: 16px; }
  </style>
</head>
<body>
  <h1>Base AutoBot Worker</h1>
  <p>This Worker serves the API for the Base AutoBot. If you expected a dashboard UI, deploy the
  static dashboard in <code>apps/dashboard/</code> using Cloudflare Pages.</p>
  <div class="card">
    <h2>Useful endpoints</h2>
    <ul>
      <li><a href="/health">/health</a> — quick health check</li>
      <li><a href="/state">/state</a> — current bot state</li>
      <li><code>POST /pause</code> — pause bot (requires ADMIN_TOKEN if set)</li>
      <li><code>POST /resume</code> — resume bot (requires ADMIN_TOKEN if set)</li>
    </ul>
  </div>
</body>
</html>`;
}

async function requireAuth(req: Request, env: EnvBindings): Promise<boolean> {
  if (!env.ADMIN_TOKEN) return true;
  const header = req.headers.get("authorization") || req.headers.get("x-admin-token");
  if (!header) return false;
  if (header.startsWith("Bearer ")) return header.slice(7) === env.ADMIN_TOKEN;
  return header === env.ADMIN_TOKEN;
}

async function runOnce(env: EnvBindings, state: BotState): Promise<BotState> {
  const config = buildRuntimeConfig(env);
  const pricePoint = await fetchMarketPoint(config);
  const updatedHistory = updateMarketHistory(state, pricePoint);
  const { signal } = evaluateStrategy(pricePoint, updatedHistory);
  const { result, nextState } = await executeSignal(config, updatedHistory, signal);

  return {
    ...nextState,
    lastRunAt: new Date().toISOString(),
    lastPrice: pricePoint.price,
    lastIndexPrice: pricePoint.indexPrice ?? state.lastIndexPrice,
    lastSignal: signal,
    lastExecution: result,
  };
}

async function runOnceWithDiagnostics(
  env: EnvBindings,
  state: BotState,
): Promise<{ next: BotState; error?: string }> {
  try {
    return { next: await runOnce(env, state) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      next: {
        ...state,
        lastError: { message, at: new Date().toISOString() },
        errorCount: (state.errorCount ?? 0) + 1,
      },
      error: message,
    };
  }
}

function parseBody(req: Request): Promise<unknown> {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return Promise.resolve(null);
  }
  return req.json();
}

function ensureNumber(value: unknown, fallback: number, options?: { min?: number }): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (options?.min !== undefined && value < options.min) return fallback;
  return value;
}

function updateMarketHistory(state: BotState, point: { price: number; indexPrice?: number }): BotState {
  const lookback = Math.max(
    1,
    Math.floor(Math.max(state.params.volatilityLookback, state.params.forecastLookback)),
  );
  const history = [...state.priceHistory, point.price].slice(-lookback);
  const indexHistory = point.indexPrice
    ? [...state.indexHistory, point.indexPrice].slice(-lookback)
    : state.indexHistory;
  return {
    ...state,
    priceHistory: history,
    indexHistory,
  };
}

function applyConfigPatch(state: BotState, payload: Record<string, unknown> | null): BotState {
  if (!payload) return state;

  const tradeSizeUsd = ensureNumber(payload.tradeSizeUsd, state.params.tradeSizeUsd, { min: 0 });
  const minMovePct = ensureNumber(payload.minMovePct, state.params.minMovePct, { min: 0 });
  const minIntervalSec = ensureNumber(payload.minIntervalSec, state.params.minIntervalSec, { min: 0 });
  const maxPositionUsd = ensureNumber(payload.maxPositionUsd, state.params.maxPositionUsd, { min: 0 });
  const maxDrawdownPct = ensureNumber(payload.maxDrawdownPct, state.params.maxDrawdownPct, { min: 0 });
  const stopLossPct = ensureNumber(payload.stopLossPct, state.params.stopLossPct, { min: 0 });
  const takeProfitPct = ensureNumber(payload.takeProfitPct, state.params.takeProfitPct, { min: 0 });
  const volatilityLookback = ensureNumber(payload.volatilityLookback, state.params.volatilityLookback, { min: 1 });
  const maxTradesPerHour = ensureNumber(payload.maxTradesPerHour, state.params.maxTradesPerHour, { min: 0 });
  const indexMinMovePct = ensureNumber(payload.indexMinMovePct, state.params.indexMinMovePct, { min: 0 });
  const forecastLookback = ensureNumber(payload.forecastLookback, state.params.forecastLookback, { min: 2 });

  return {
    ...state,
    params: {
      tradeSizeUsd,
      minMovePct,
      minIntervalSec,
      maxPositionUsd,
      maxDrawdownPct,
      stopLossPct,
      takeProfitPct,
      volatilityLookback,
      maxTradesPerHour,
      indexMinMovePct,
      forecastLookback,
    },
  };
}

function sanitizeTokenValues(
  payload: Record<string, unknown> | undefined,
  current: Record<string, number>,
  options?: { min?: number; max?: number },
): Record<string, number> {
  if (!payload) return current;
  const next = { ...current };
  for (const [key, value] of Object.entries(payload)) {
    if (!(key in current)) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (options?.min !== undefined && value < options.min) continue;
    if (options?.max !== undefined && value > options.max) continue;
    next[key] = value;
  }
  return next;
}

function applyPortfolioPatch(
  state: BotState,
  payload: Record<string, unknown> | null,
): BotState {
  if (!payload) return state;

  const cashUsd = ensureNumber(payload.cashUsd, state.portfolio.cashUsd, { min: 0 });
  const asset = ensureNumber(payload.asset, state.portfolio.asset, { min: 0 });
  const tokenBalancesUsd = sanitizeTokenValues(
    payload.tokenBalancesUsd as Record<string, unknown> | undefined,
    state.portfolio.tokenBalancesUsd,
    { min: 0 },
  );
  const allocationTargets = sanitizeTokenValues(
    payload.allocationTargets as Record<string, unknown> | undefined,
    state.portfolio.allocationTargets,
    { min: 0, max: 1 },
  );

  return {
    ...state,
    portfolio: {
      cashUsd,
      asset,
      tokenBalancesUsd,
      allocationTargets,
    },
  };
}

export default {
  async fetch(req: Request, env: EnvBindings): Promise<Response> {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const config = buildRuntimeConfig(env);

    if (url.pathname === "/") {
      return htmlPage(renderLandingPage());
    }

    if (url.pathname === "/health") {
      return json({ ok: true, mode: config.executionMode, asset: config.assetSymbol });
    }

    if (url.pathname === "/config" && method === "GET") {
      return json(config);
    }

    if (url.pathname === "/state") {
      const state = await loadState(env.KV, config);
      return json(state);
    }

    if (url.pathname === "/portfolio" && method === "GET") {
      const state = await loadState(env.KV, config);
      return json(state.portfolio);
    }

    if (url.pathname === "/portfolio" && method === "POST") {
      if (!(await requireAuth(req, env))) return json({ error: "unauthorized" }, 401);
      const state = await loadState(env.KV, config);
      const payload = (await parseBody(req)) as Record<string, unknown> | null;
      const next = applyPortfolioPatch(state, payload);
      await saveState(env.KV, next);
      return json({ ok: true, portfolio: next.portfolio });
    }

    if (url.pathname === "/pause" && method === "POST") {
      if (!(await requireAuth(req, env))) return json({ error: "unauthorized" }, 401);
      const state = await loadState(env.KV, config);
      const next = { ...state, paused: true };
      await saveState(env.KV, next);
      return json({ ok: true, paused: true });
    }

    if (url.pathname === "/resume" && method === "POST") {
      if (!(await requireAuth(req, env))) return json({ error: "unauthorized" }, 401);
      const state = await loadState(env.KV, config);
      const next = { ...state, paused: false };
      await saveState(env.KV, next);
      return json({ ok: true, paused: false });
    }

    if (url.pathname === "/config" && method === "POST") {
      if (!(await requireAuth(req, env))) return json({ error: "unauthorized" }, 401);
      const state = await loadState(env.KV, config);
      const payload = (await parseBody(req)) as Record<string, unknown> | null;
      const next = applyConfigPatch(state, payload);
      await saveState(env.KV, next);
      return json({ ok: true, params: next.params });
    }

    if (url.pathname === "/run-once" && method === "POST") {
      if (!(await requireAuth(req, env))) return json({ error: "unauthorized" }, 401);
      const state = await loadState(env.KV, config);
      if (state.paused) return json({ ok: false, error: "paused" }, 409);
      const { next, error } = await runOnceWithDiagnostics(env, state);
      await saveState(env.KV, next);
      if (error) {
        return json({ ok: false, error, lastError: next.lastError }, 500);
      }
      return json({ ok: true, signal: next.lastSignal, execution: next.lastExecution });
    }

    return json({ error: "not_found" }, 404);
  },

  async scheduled(_event: ScheduledEvent, env: EnvBindings, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        const config = buildRuntimeConfig(env);
        const state = await loadState(env.KV, config);
        if (state.paused) return;
        const { next } = await runOnceWithDiagnostics(env, state);
        await saveState(env.KV, next);
      })(),
    );
  },
};
