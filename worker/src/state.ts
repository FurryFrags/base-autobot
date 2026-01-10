import type { BotState, RuntimeConfig } from "./types";

const KEY = "bot_state_v2";

function buildTokenRecord(value: number, config: RuntimeConfig): Record<string, number> {
  return Object.keys(config.addressBook.tokens).reduce<Record<string, number>>((acc, key) => {
    acc[key] = value;
    return acc;
  }, {});
}

function defaultState(config: RuntimeConfig): BotState {
  return {
    paused: config.startPaused,
    lastRunAt: undefined,
    lastPrice: undefined,
    lastIndexPrice: undefined,
    lastSignal: undefined,
    lastExecution: undefined,
    lastTradeAt: undefined,
    portfolio: {
      cashUsd: config.startingCashUsd,
      asset: 0,
      tokenBalancesUsd: buildTokenRecord(0, config),
      allocationTargets: buildTokenRecord(0, config),
    },
    avgEntryPrice: undefined,
    priceHistory: [],
    indexHistory: [],
    walletHistory: [],
    transactions: [],
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
      indexMinMovePct: config.defaultIndexMinMovePct,
      forecastLookback: config.defaultForecastLookback,
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
      tokenBalancesUsd: {
        ...defaultState(config).portfolio.tokenBalancesUsd,
        ...(parsed.portfolio?.tokenBalancesUsd ?? {}),
      },
      allocationTargets: {
        ...defaultState(config).portfolio.allocationTargets,
        ...(parsed.portfolio?.allocationTargets ?? {}),
      },
    },
    priceHistory: parsed.priceHistory ?? defaultState(config).priceHistory,
    indexHistory: parsed.indexHistory ?? defaultState(config).indexHistory,
    walletHistory: parsed.walletHistory ?? defaultState(config).walletHistory,
    transactions: parsed.transactions ?? defaultState(config).transactions,
    params: {
      ...defaultState(config).params,
      ...parsed.params,
    },
  };
}

export async function saveState(KV: KVNamespace, state: BotState): Promise<void> {
  await KV.put(KEY, JSON.stringify(state));
}
