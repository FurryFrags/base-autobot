import { getTokenMap, assertAllowlist } from "./config";
import { loadState, saveState } from "./state";
import { runStrategyOnce } from "./strategy";
import type { EnvBindings } from "./worker_env";
import { buildRuntimeEnv } from "./worker_env";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function requireAuth(req: Request, env: EnvBindings): Promise<boolean> {
  // Optional: add a shared secret header if you want admin-only endpoints.
  // This template leaves it open so you can wire your own auth model.
  return true;
}

export default {
  async fetch(req: Request, env: EnvBindings): Promise<Response> {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();

    if (url.pathname === "/health") return json({ ok: true });

    if (url.pathname === "/state") {
      const st = await loadState(env.KV);
      return json(st);
    }

    if (url.pathname === "/pause" && method === "POST") {
      if (!(await requireAuth(req, env))) return json({ error: "unauthorized" }, 401);
      const st = await loadState(env.KV);
      st.paused = true;
      await saveState(env.KV, st);
      return json({ ok: true, paused: true });
    }

    if (url.pathname === "/resume" && method === "POST") {
      if (!(await requireAuth(req, env))) return json({ error: "unauthorized" }, 401);
      const st = await loadState(env.KV);
      st.paused = false;
      await saveState(env.KV, st);
      return json({ ok: true, paused: false });
    }

    if (url.pathname === "/run-once" && method === "POST") {
      if (!(await requireAuth(req, env))) return json({ error: "unauthorized" }, 401);

      const tokenMap = getTokenMap();
      assertAllowlist(tokenMap);

      const runtime = buildRuntimeEnv(env);
      const st = await loadState(env.KV);
      if (st.paused) return json({ ok: false, error: "paused" }, 409);

      const action = await runStrategyOnce(runtime, tokenMap, st);
      st.lastRunAt = new Date().toISOString();
      st.lastResult = action;
      await saveState(env.KV, st);

      return json({ ok: true, action });
    }

    return json({ error: "not_found" }, 404);
  },

  async scheduled(_event: ScheduledEvent, env: EnvBindings, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      const tokenMap = getTokenMap();
      assertAllowlist(tokenMap);

      const runtime = buildRuntimeEnv(env);
      const st = await loadState(env.KV);
      if (st.paused) return;

      const action = await runStrategyOnce(runtime, tokenMap, st);
      st.lastRunAt = new Date().toISOString();
      st.lastResult = action;
      await saveState(env.KV, st);
    })());
  },
};
