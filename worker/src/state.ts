import type { BotState, RuntimeConfig } from "./types";

const KEY = "bot_state_v2";

function defaultState(config: RuntimeConfig): BotState {
  return {
    paused: true,
    lastRunAt: undefined,
    lastPrice: undefined,
    lastSignal: undefined,
    lastExecution: undefined,
    lastTradeAt: undefined,
    portfolio: {
      cashUsd: config.startingCashUsd,
      asset: 0,
    },
    avgEntryPrice: undefined,
    priceHistory: [],
    params: {
      tradeSizeUsd: config.defaultTradeSizeUsd,
      minMovePct: config.defaultMinMovePct,
      minIntervalSec: config.defaultMinIntervalSec,
      maxPositionUsd: config.defaultMaxPositionUsd,
      maxDrawdownPct: config.defaultMaxDrawdownPct,
      stopLossPct: config.defaultStopLossPct,
      takeProfitPct: config.defaultTakeProfitPct,
      volatilityLookback: config.defaultVolatilityLookback,
      maxTradesPerHour: config.defaultMaxTradesPerHour,
    },
  };
}

export async function loadState(KV: KVNamespace, config: RuntimeConfig): Promise<BotState> {
  const raw = await KV.get(KEY);
  if (!raw) return defaultState(config);
  const parsed = JSON.parse(raw) as BotState;
  return {
    ...defaultState(config),
    ...parsed,
    portfolio: {
      ...defaultState(config).portfolio,
      ...parsed.portfolio,
    },
    priceHistory: parsed.priceHistory ?? defaultState(config).priceHistory,
    params: {
      ...defaultState(config).params,
      ...parsed.params,
    },
  };
}

export async function saveState(KV: KVNamespace, state: BotState): Promise<void> {
  await KV.put(KEY, JSON.stringify(state));
}
