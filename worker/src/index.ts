import { buildRuntimeConfig, buildRuntimeSecrets, type EnvBindings } from "./config";
import { executeSignal } from "./execution";
import { syncOnchainPortfolio } from "./onchain";
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
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 24px; max-width: 960px; }
    code { background:#f6f6f6; padding: 2px 6px; border-radius: 6px; }
    a { color: #0b5fff; }
    .card { border:1px solid #eee; border-radius: 14px; padding: 16px; margin-top: 16px; }
    .row { display: flex; flex-wrap: wrap; gap: 16px; }
    .row .card { flex: 1 1 280px; }
    .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #65748b; margin-bottom: 4px; }
    .value { font-size: 24px; font-weight: 600; }
    .muted { color: #6b7280; font-size: 14px; }
    canvas { width: 100%; height: 240px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
    th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #65748b; }
    .pill { padding: 2px 8px; border-radius: 999px; font-size: 12px; background: #f3f4f6; display: inline-block; }
  </style>
</head>
<body>
  <h1>Base AutoBot Worker</h1>
  <p class="muted">Live wallet summary and execution history from the Worker API.</p>
  <div class="row">
    <div class="card">
      <div class="label">Total wallet value</div>
      <div class="value" id="wallet-total">--</div>
      <div class="muted" id="wallet-breakdown">--</div>
    </div>
    <div class="card">
      <div class="label">Connected wallet</div>
      <div class="value" id="wallet-address">--</div>
      <div class="muted" id="wallet-network">--</div>
    </div>
    <div class="card">
      <div class="label">Last run</div>
      <div class="value" id="last-run">--</div>
      <div class="muted" id="execution-mode">--</div>
    </div>
  </div>
  <div class="card">
    <h2>Wallet value over time</h2>
    <canvas id="wallet-chart" width="880" height="240"></canvas>
    <div class="muted" id="wallet-chart-note"></div>
  </div>
  <div class="card">
    <h2>Transactions</h2>
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Action</th>
          <th>Status</th>
          <th>Price</th>
          <th>Size (USD)</th>
          <th>Detail</th>
        </tr>
      </thead>
      <tbody id="transactions-body"></tbody>
    </table>
  </div>
  <div class="card">
    <h2>Useful endpoints</h2>
    <ul>
      <li><a href="/health">/health</a> — quick health check</li>
      <li><a href="/state">/state</a> — current bot state</li>
      <li><code>POST /pause</code> — pause bot (requires ADMIN_TOKEN if set)</li>
      <li><code>POST /resume</code> — resume bot (requires ADMIN_TOKEN if set)</li>
    </ul>
  </div>
  <script>
    const formatter = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
    const compact = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });

    function renderChart(history) {
      const canvas = document.getElementById("wallet-chart");
      const note = document.getElementById("wallet-chart-note");
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!history.length) {
        ctx.fillStyle = "#6b7280";
        ctx.font = "14px ui-sans-serif, system-ui";
        ctx.fillText("No history yet. Run the bot to capture wallet value points.", 12, 32);
        note.textContent = "";
        return;
      }

      const values = history.map((point) => point.valueUsd);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const padding = 32;
      const width = canvas.width - padding * 2;
      const height = canvas.height - padding * 2;
      const range = max - min || 1;
      ctx.strokeStyle = "#0b5fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      values.forEach((value, index) => {
        const x = padding + (index / (values.length - 1 || 1)) * width;
        const y = padding + height - ((value - min) / range) * height;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px ui-sans-serif, system-ui";
      ctx.fillText(formatter.format(max), padding, padding - 8);
      ctx.fillText(formatter.format(min), padding, canvas.height - 8);
      const latest = history[history.length - 1];
      note.textContent = latest ? \`Latest wallet value at \${new Date(latest.at).toLocaleString()}\` : "";
    }

    function renderTransactions(transactions) {
      const body = document.getElementById("transactions-body");
      body.innerHTML = "";
      if (!transactions.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.className = "muted";
        cell.textContent = "No transactions recorded yet.";
        row.appendChild(cell);
        body.appendChild(row);
        return;
      }
      transactions
        .slice()
        .reverse()
        .forEach((txn) => {
          const row = document.createElement("tr");
          row.innerHTML = \`
            <td>\${new Date(txn.executedAt).toLocaleString()}</td>
            <td><span class="pill">\${txn.action.toUpperCase()}</span></td>
            <td>\${txn.status}</td>
            <td>\${formatter.format(txn.price)}</td>
            <td>\${txn.tradeSizeUsd ? formatter.format(txn.tradeSizeUsd) : "--"}</td>
            <td>\${txn.detail || txn.reason || "--"}</td>
          \`;
          body.appendChild(row);
        });
    }

    async function loadData() {
      const [stateRes, configRes] = await Promise.all([fetch("/state"), fetch("/config")]);
      const state = await stateRes.json();
      const config = await configRes.json();
      const price = state.lastPrice || 0;
      const tokenTotal = Object.values(state.portfolio.tokenBalancesUsd || {}).reduce(
        (sum, value) => sum + (Number.isFinite(value) ? value : 0),
        0,
      );
      const assetValue = state.portfolio.asset * price;
      const total = state.portfolio.cashUsd + assetValue + tokenTotal;
      document.getElementById("wallet-total").textContent = formatter.format(total);
      document.getElementById("wallet-breakdown").textContent =
        \`Cash \${formatter.format(state.portfolio.cashUsd)} · Asset \${compact.format(state.portfolio.asset)} \${config.assetSymbol}\` +
        \` · Tokens \${formatter.format(tokenTotal)}\`;
      document.getElementById("wallet-address").textContent = config.walletAddress || "Not configured";
      document.getElementById("wallet-network").textContent = config.walletAddress
        ? \`Network: \${config.addressBook.network}\`
        : "Set WALLET_ADDRESS to display the connected wallet.";
      document.getElementById("last-run").textContent = state.lastRunAt
        ? new Date(state.lastRunAt).toLocaleString()
        : "Not run yet";
      document.getElementById("execution-mode").textContent = \`Mode: \${config.executionMode}\`;
      renderChart(state.walletHistory || []);
      renderTransactions(state.transactions || []);
    }

    loadData().catch((error) => {
      document.getElementById("wallet-total").textContent = "Error loading data";
      document.getElementById("wallet-breakdown").textContent = error?.message || String(error);
    });
  </script>
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
  const secrets = buildRuntimeSecrets(env);
  const pricePoint = await fetchMarketPoint(config);
  const hydratedState =
    config.executionMode === "onchain"
      ? await syncOnchainPortfolio(config, secrets, state)
      : state;
  const updatedHistory = updateMarketHistory(hydratedState, pricePoint);
  const { signal } = evaluateStrategy(pricePoint, updatedHistory);
  const { result, nextState } = await executeSignal(config, secrets, updatedHistory, signal);
  const withWalletHistory = updateWalletHistory(nextState, pricePoint.price, pricePoint.fetchedAt);

  return {
    ...withWalletHistory,
    lastRunAt: new Date().toISOString(),
    lastPrice: pricePoint.price,
    lastIndexPrice: pricePoint.indexPrice ?? hydratedState.lastIndexPrice,
    lastSignal: signal,
    lastExecution: result,
  };
}

async function maybeSyncPortfolio(
  env: EnvBindings,
  config: ReturnType<typeof buildRuntimeConfig>,
  state: BotState,
): Promise<BotState> {
  if (config.executionMode !== "onchain") return state;
  const secrets = buildRuntimeSecrets(env);
  return syncOnchainPortfolio(config, secrets, state);
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

const MAX_WALLET_HISTORY = 120;

function calculatePortfolioValue(state: BotState, price: number): number {
  const tokenTotal = Object.values(state.portfolio.tokenBalancesUsd ?? {}).reduce(
    (sum, value) => sum + value,
    0,
  );
  return state.portfolio.cashUsd + state.portfolio.asset * price + tokenTotal;
}

function updateWalletHistory(state: BotState, price: number, at: string): BotState {
  const next = [
    ...(state.walletHistory ?? []),
    { valueUsd: calculatePortfolioValue(state, price), at },
  ].slice(-MAX_WALLET_HISTORY);
  return {
    ...state,
    walletHistory: next,
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
      const synced = await maybeSyncPortfolio(env, config, state);
      return json(synced);
    }

    if (url.pathname === "/portfolio" && method === "GET") {
      const state = await loadState(env.KV, config);
      const synced = await maybeSyncPortfolio(env, config, state);
      return json(synced.portfolio);
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
