import type { BotState, ExecutionResult, RuntimeConfig, Signal } from "./types";
import { nowIso } from "./utils";

function canTrade(state: BotState): { ok: boolean; reason?: string } {
  if (!state.lastTradeAt) return { ok: true };
  const last = Date.parse(state.lastTradeAt);
  if (!Number.isFinite(last)) return { ok: true };
  const elapsed = (Date.now() - last) / 1000;
  if (elapsed < state.params.minIntervalSec) {
    return { ok: false, reason: `Cooldown ${state.params.minIntervalSec}s not met` };
  }
  return { ok: true };
}

export async function executeSignal(
  config: RuntimeConfig,
  state: BotState,
  signal: Signal,
): Promise<{ result: ExecutionResult; nextState: BotState }> {
  if (signal.action === "hold") {
    return {
      result: {
        status: "skipped",
        mode: config.executionMode,
        detail: "Hold signal",
        executedAt: nowIso(),
      },
      nextState: state,
    };
  }

  const tradeOk = canTrade(state);
  if (!tradeOk.ok) {
    return {
      result: {
        status: "skipped",
        mode: config.executionMode,
        detail: tradeOk.reason,
        executedAt: nowIso(),
      },
      nextState: state,
    };
  }

  if (config.executionMode === "disabled") {
    return {
      result: {
        status: "skipped",
        mode: config.executionMode,
        detail: "Execution disabled",
        executedAt: nowIso(),
      },
      nextState: state,
    };
  }

  if (config.executionMode === "webhook") {
    if (!config.webhookUrl) {
      return {
        result: {
          status: "failed",
          mode: config.executionMode,
          detail: "WEBHOOK_URL is not set",
          executedAt: nowIso(),
        },
        nextState: state,
      };
    }

    const payload = {
      action: signal.action,
      asset: config.assetSymbol,
      price: signal.price,
      tradeSizeUsd: state.params.tradeSizeUsd,
      generatedAt: signal.generatedAt,
      reason: signal.reason,
    };

    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.webhookAuthToken ? { authorization: `Bearer ${config.webhookAuthToken}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        result: {
          status: "failed",
          mode: config.executionMode,
          detail: `Webhook error (${response.status})`,
          executedAt: nowIso(),
        },
        nextState: state,
      };
    }

    return {
      result: {
        status: "submitted",
        mode: config.executionMode,
        detail: "Webhook accepted",
        executedAt: nowIso(),
        tradeSizeUsd: state.params.tradeSizeUsd,
      },
      nextState: {
        ...state,
        lastTradeAt: nowIso(),
      },
    };
  }

  const tradeSizeUsd = state.params.tradeSizeUsd;
  if (tradeSizeUsd <= 0) {
    return {
      result: {
        status: "failed",
        mode: config.executionMode,
        detail: "Trade size must be positive",
        executedAt: nowIso(),
      },
      nextState: state,
    };
  }

  const price = signal.price;
  const assetDelta = tradeSizeUsd / price;

  if (signal.action === "buy") {
    if (state.portfolio.cashUsd < tradeSizeUsd) {
      return {
        result: {
          status: "skipped",
          mode: config.executionMode,
          detail: "Insufficient cash",
          executedAt: nowIso(),
        },
        nextState: state,
      };
    }

    const nextState: BotState = {
      ...state,
      lastTradeAt: nowIso(),
      portfolio: {
        cashUsd: state.portfolio.cashUsd - tradeSizeUsd,
        asset: state.portfolio.asset + assetDelta,
      },
    };

    return {
      result: {
        status: "filled",
        mode: config.executionMode,
        detail: "Paper buy executed",
        executedAt: nowIso(),
        tradeSizeUsd,
        assetDelta,
        cashDelta: -tradeSizeUsd,
      },
      nextState,
    };
  }

  const maxAssetToSell = Math.min(state.portfolio.asset, assetDelta);
  if (maxAssetToSell <= 0) {
    return {
      result: {
        status: "skipped",
        mode: config.executionMode,
        detail: "No asset balance to sell",
        executedAt: nowIso(),
      },
      nextState: state,
    };
  }

  const cashDelta = maxAssetToSell * price;

  const nextState: BotState = {
    ...state,
    lastTradeAt: nowIso(),
    portfolio: {
      cashUsd: state.portfolio.cashUsd + cashDelta,
      asset: state.portfolio.asset - maxAssetToSell,
    },
  };

  return {
    result: {
      status: "filled",
      mode: config.executionMode,
      detail: "Paper sell executed",
      executedAt: nowIso(),
      tradeSizeUsd: cashDelta,
      assetDelta: -maxAssetToSell,
      cashDelta,
    },
    nextState,
  };
}
