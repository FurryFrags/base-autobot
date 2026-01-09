import { buildRuntimeConfig, type EnvBindings } from "./config";
import { executeSignal } from "./execution";
import { fetchPrice } from "./market";
import { loadState, saveState } from "./state";
import { evaluateStrategy } from "./strategy";
import type { BotState } from "./types";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
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
  const pricePoint = await fetchPrice(config);
  const { signal } = evaluateStrategy(pricePoint, state);
  const { result, nextState } = await executeSignal(config, state, signal);

  return {
    ...nextState,
    lastRunAt: new Date().toISOString(),
    lastPrice: pricePoint.price,
    lastSignal: signal,
    lastExecution: result,
  };
}

function parseBody(req: Request): Promise<unknown> {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return Promise.resolve(null);
  }
  return req.json();
}

function applyConfigPatch(state: BotState, payload: Record<string, unknown> | null): BotState {
  if (!payload) return state;

  const tradeSizeUsd = typeof payload.tradeSizeUsd === "number" ? payload.tradeSizeUsd : state.params.tradeSizeUsd;
  const minMovePct = typeof payload.minMovePct === "number" ? payload.minMovePct : state.params.minMovePct;
  const minIntervalSec =
    typeof payload.minIntervalSec === "number" ? payload.minIntervalSec : state.params.minIntervalSec;

  return {
    ...state,
    params: {
      tradeSizeUsd,
      minMovePct,
      minIntervalSec,
    },
  };
}

export default {
  async fetch(req: Request, env: EnvBindings): Promise<Response> {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const config = buildRuntimeConfig(env);

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
      const next = await runOnce(env, state);
      await saveState(env.KV, next);
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
        const next = await runOnce(env, state);
        await saveState(env.KV, next);
      })(),
    );
  },
};
