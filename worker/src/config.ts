import type { ExecutionMode, RuntimeConfig, RuntimeSecrets } from "./types";
import { baseMainnetAddressBook } from "./chain";

function asNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asMode(value: string | undefined, fallback: ExecutionMode): ExecutionMode {
  if (value === "paper" || value === "webhook" || value === "onchain" || value === "disabled")
    return value;
  return fallback;
}

function asBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function asTrimmed(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asStartingCash(
  value: string | undefined,
  fallback: number,
): { amount: number; useWallet: boolean } {
  if (!value) return { amount: fallback, useWallet: false };
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "wallet") return { amount: 0, useWallet: true };
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? { amount: parsed, useWallet: false }
    : { amount: fallback, useWallet: false };
}

export function buildRuntimeConfig(env: EnvBindings): RuntimeConfig {
  const startingCash = asStartingCash(env.STARTING_CASH_USD, 0);
  return {
    assetSymbol: env.ASSET_SYMBOL || "WETH",
    quoteSymbol: env.QUOTE_SYMBOL || "USDC",
    priceFeedUrl: env.PRICE_FEED_URL || "https://api.coinbase.com/v2/prices/ETH-USD/spot",
    priceField: env.PRICE_FIELD || "data.amount",
    indexFeedUrl: env.INDEX_FEED_URL,
    indexPriceField: env.INDEX_PRICE_FIELD || "data.amount",
    executionMode: asMode(env.EXECUTION_MODE, "paper"),
    webhookUrl: env.WEBHOOK_URL,
    webhookAuthToken: env.WEBHOOK_AUTH_TOKEN,
    defaultTradeSizeUsd: asNumber(env.DEFAULT_TRADE_SIZE_USD, 25),
    defaultMinMovePct: asNumber(env.DEFAULT_MIN_MOVE_PCT, 0.35),
    defaultMinIntervalSec: asNumber(env.DEFAULT_MIN_INTERVAL_SEC, 300),
    defaultMaxPositionUsd: asNumber(env.DEFAULT_MAX_POSITION_USD, 0),
    defaultMaxDrawdownPct: asNumber(env.DEFAULT_MAX_DRAWDOWN_PCT, 0),
    defaultStopLossPct: asNumber(env.DEFAULT_STOP_LOSS_PCT, 0),
    defaultTakeProfitPct: asNumber(env.DEFAULT_TAKE_PROFIT_PCT, 0),
    defaultVolatilityLookback: asNumber(env.DEFAULT_VOLATILITY_LOOKBACK, 20),
    defaultMaxTradesPerHour: asNumber(env.DEFAULT_MAX_TRADES_PER_HOUR, 0),
    defaultIndexMinMovePct: asNumber(env.DEFAULT_INDEX_MIN_MOVE_PCT, 0),
    defaultForecastLookback: asNumber(env.DEFAULT_FORECAST_LOOKBACK, 20),
    startingCashUsd: startingCash.amount,
    useWalletStartingCash: startingCash.useWallet,
    startPaused: asBoolean(env.START_PAUSED, true),
    walletAddress: asTrimmed(env.WALLET_ADDRESS),
    swapRouterAddress: env.SWAP_ROUTER_ADDRESS,
    swapSlippageBps: asNumber(env.SWAP_SLIPPAGE_BPS, 50),
    swapDeadlineSec: asNumber(env.SWAP_DEADLINE_SEC, 300),
    addressBook: baseMainnetAddressBook,
  };
}

export function buildRuntimeSecrets(env: EnvBindings): RuntimeSecrets {
  return {
    rpcUrl: env.RPC_URL,
    botPrivateKey: env.BOT_PRIVATE_KEY,
  };
}

export type EnvBindings = {
  KV: KVNamespace;
  ADMIN_TOKEN?: string;
  ASSET_SYMBOL?: string;
  QUOTE_SYMBOL?: string;
  PRICE_FEED_URL?: string;
  PRICE_FIELD?: string;
  INDEX_FEED_URL?: string;
  INDEX_PRICE_FIELD?: string;
  EXECUTION_MODE?: ExecutionMode;
  WEBHOOK_URL?: string;
  WEBHOOK_AUTH_TOKEN?: string;
  DEFAULT_TRADE_SIZE_USD?: string;
  DEFAULT_MIN_MOVE_PCT?: string;
  DEFAULT_MIN_INTERVAL_SEC?: string;
  DEFAULT_MAX_POSITION_USD?: string;
  DEFAULT_MAX_DRAWDOWN_PCT?: string;
  DEFAULT_STOP_LOSS_PCT?: string;
  DEFAULT_TAKE_PROFIT_PCT?: string;
  DEFAULT_VOLATILITY_LOOKBACK?: string;
  DEFAULT_MAX_TRADES_PER_HOUR?: string;
  DEFAULT_INDEX_MIN_MOVE_PCT?: string;
  DEFAULT_FORECAST_LOOKBACK?: string;
  STARTING_CASH_USD?: string;
  START_PAUSED?: string;
  WALLET_ADDRESS?: string;
  SWAP_ROUTER_ADDRESS?: string;
  SWAP_SLIPPAGE_BPS?: string;
  SWAP_DEADLINE_SEC?: string;
  RPC_URL?: string;
  BOT_PRIVATE_KEY?: string;
};
