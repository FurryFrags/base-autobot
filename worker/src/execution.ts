import type { BotState, ExecutionResult, RuntimeConfig, Signal, TransactionRecord } from "./types";
import { nowIso, resolveTokenKey } from "./utils";

const MAX_TRANSACTIONS = 200;

function recordTransaction(state: BotState, signal: Signal, result: ExecutionResult): BotState {
  if (signal.action === "hold") return state;
  if (result.status === "skipped") return state;
  const record: TransactionRecord = {
    action: signal.action,
    status: result.status,
    mode: result.mode,
    price: signal.price,
    executedAt: result.executedAt,
    tradeSizeUsd: result.tradeSizeUsd,
    assetDelta: result.assetDelta,
    cashDelta: result.cashDelta,
    detail: result.detail,
    reason: signal.reason,
  };
  const history = [...(state.transactions ?? []), record].slice(-MAX_TRANSACTIONS);
  return { ...state, transactions: history };
}

function finalizeResult(
  state: BotState,
  signal: Signal,
  result: ExecutionResult,
): { result: ExecutionResult; nextState: BotState } {
  return { result, nextState: recordTransaction(state, signal, result) };
}

function canTrade(state: BotState): { ok: boolean; reason?: string } {
  if (!state.lastTradeAt) return { ok: true };
  const last = Date.parse(state.lastTradeAt);
  if (!Number.isFinite(last)) return { ok: true };
  const elapsed = (Date.now() - last) / 1000;
  const maxTradesInterval =
    state.params.maxTradesPerHour > 0 ? 3600 / state.params.maxTradesPerHour : 0;
  const effectiveMinInterval = Math.max(state.params.minIntervalSec, maxTradesInterval);
  if (elapsed < effectiveMinInterval) {
    return { ok: false, reason: `Cooldown ${effectiveMinInterval}s not met` };
  }
  return { ok: true };
}

export async function executeSignal(
  config: RuntimeConfig,
  state: BotState,
  signal: Signal,
): Promise<{ result: ExecutionResult; nextState: BotState }> {
  const assetTokenKey = resolveTokenKey(config.assetSymbol, config.addressBook.tokens);
  const allocationTarget =
    assetTokenKey && state.portfolio.allocationTargets
      ? state.portfolio.allocationTargets[assetTokenKey]
      : undefined;
  const totalPortfolioUsd =
    state.portfolio.cashUsd +
    state.portfolio.asset * signal.price +
    Object.values(state.portfolio.tokenBalancesUsd ?? {}).reduce((sum, value) => sum + value, 0);

  if (signal.action === "hold") {
    return finalizeResult(state, signal, {
      status: "skipped",
      mode: config.executionMode,
      detail: "Hold signal",
      executedAt: nowIso(),
    });
  }

  const tradeOk = canTrade(state);
  if (!tradeOk.ok) {
    return finalizeResult(state, signal, {
      status: "skipped",
      mode: config.executionMode,
      detail: tradeOk.reason,
      executedAt: nowIso(),
    });
  }

  if (config.executionMode === "disabled") {
    return finalizeResult(state, signal, {
      status: "skipped",
      mode: config.executionMode,
      detail: "Execution disabled",
      executedAt: nowIso(),
    });
  }

  if (config.executionMode === "webhook") {
    if (!config.webhookUrl) {
      return finalizeResult(state, signal, {
        status: "failed",
        mode: config.executionMode,
        detail: "WEBHOOK_URL is not set",
        executedAt: nowIso(),
      });
    }

    const exposureUsd = state.portfolio.asset * signal.price;
    const projectedExposureUsd = exposureUsd + state.params.tradeSizeUsd;
    const allocationLimitUsd =
      allocationTarget && allocationTarget > 0 ? totalPortfolioUsd * allocationTarget : undefined;
    const payload = {
      action: signal.action,
      asset: config.assetSymbol,
      price: signal.price,
      tradeSizeUsd: state.params.tradeSizeUsd,
      generatedAt: signal.generatedAt,
      reason: signal.reason,
      exposureUsd,
      projectedExposureUsd,
      allocationLimitUsd,
      riskParams: {
        maxPositionUsd: state.params.maxPositionUsd,
        maxDrawdownPct: state.params.maxDrawdownPct,
        stopLossPct: state.params.stopLossPct,
        takeProfitPct: state.params.takeProfitPct,
        volatilityLookback: state.params.volatilityLookback,
        maxTradesPerHour: state.params.maxTradesPerHour,
        indexMinMovePct: state.params.indexMinMovePct,
        forecastLookback: state.params.forecastLookback,
      },
      portfolio: {
        cashUsd: state.portfolio.cashUsd,
        assetBalance: state.portfolio.asset,
        tokenBalancesUsd: state.portfolio.tokenBalancesUsd,
        allocationTargets: state.portfolio.allocationTargets,
        totalValueUsd: totalPortfolioUsd,
      },
      chain: {
        chainId: config.addressBook.chainId,
        network: config.addressBook.network,
        routers: config.addressBook.routers,
        tokens: config.addressBook.tokens,
      },
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
      return finalizeResult(state, signal, {
        status: "failed",
        mode: config.executionMode,
        detail: `Webhook error (${response.status})`,
        executedAt: nowIso(),
      });
    }

    return finalizeResult(
      {
        ...state,
        lastTradeAt: nowIso(),
      },
      signal,
      {
        status: "submitted",
        mode: config.executionMode,
        detail: "Webhook accepted",
        executedAt: nowIso(),
        tradeSizeUsd: state.params.tradeSizeUsd,
      },
    );
  }

  const tradeSizeUsd = state.params.tradeSizeUsd;
  if (tradeSizeUsd <= 0) {
    return finalizeResult(state, signal, {
      status: "failed",
      mode: config.executionMode,
      detail: "Trade size must be positive",
      executedAt: nowIso(),
    });
  }

  const price = signal.price;
  const assetDelta = tradeSizeUsd / price;

  if (signal.action === "buy") {
    if (allocationTarget && allocationTarget > 0) {
      const projectedExposure = state.portfolio.asset * price + tradeSizeUsd;
      const allocationLimit = totalPortfolioUsd * allocationTarget;
      if (projectedExposure > allocationLimit) {
        return finalizeResult(state, signal, {
          status: "skipped",
          mode: config.executionMode,
          detail: "Allocation limit reached",
          executedAt: nowIso(),
        });
      }
    }

    if (state.portfolio.cashUsd < tradeSizeUsd) {
      return finalizeResult(state, signal, {
        status: "skipped",
        mode: config.executionMode,
        detail: "Insufficient cash",
        executedAt: nowIso(),
      });
    }

    const nextAsset = state.portfolio.asset + assetDelta;
    const nextAvgEntryPrice =
      nextAsset > 0
        ? ((state.portfolio.asset * (state.avgEntryPrice ?? price)) + tradeSizeUsd) / nextAsset
        : undefined;
    const nextState: BotState = {
      ...state,
      lastTradeAt: nowIso(),
      avgEntryPrice: nextAvgEntryPrice,
      portfolio: {
        cashUsd: state.portfolio.cashUsd - tradeSizeUsd,
        asset: nextAsset,
        tokenBalancesUsd: state.portfolio.tokenBalancesUsd,
        allocationTargets: state.portfolio.allocationTargets,
      },
    };

    return finalizeResult(nextState, signal, {
      status: "filled",
      mode: config.executionMode,
      detail: "Paper buy executed",
      executedAt: nowIso(),
      tradeSizeUsd,
      assetDelta,
      cashDelta: -tradeSizeUsd,
    });
  }

  const maxAssetToSell = Math.min(state.portfolio.asset, assetDelta);
  if (maxAssetToSell <= 0) {
    return finalizeResult(state, signal, {
      status: "skipped",
      mode: config.executionMode,
      detail: "No asset balance to sell",
      executedAt: nowIso(),
    });
  }

  const cashDelta = maxAssetToSell * price;

  const remainingAsset = state.portfolio.asset - maxAssetToSell;
  const nextState: BotState = {
    ...state,
    lastTradeAt: nowIso(),
    avgEntryPrice: remainingAsset > 0 ? state.avgEntryPrice : undefined,
    portfolio: {
      cashUsd: state.portfolio.cashUsd + cashDelta,
      asset: remainingAsset,
      tokenBalancesUsd: state.portfolio.tokenBalancesUsd,
      allocationTargets: state.portfolio.allocationTargets,
    },
  };

  return finalizeResult(nextState, signal, {
    status: "filled",
    mode: config.executionMode,
    detail: "Paper sell executed",
    executedAt: nowIso(),
    tradeSizeUsd: cashDelta,
    assetDelta: -maxAssetToSell,
    cashDelta,
  });
}
