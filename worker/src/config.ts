import type { ExecutionMode, RuntimeConfig } from "./types";

function asNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asMode(value: string | undefined, fallback: ExecutionMode): ExecutionMode {
  if (value === "paper" || value === "webhook" || value === "disabled") return value;
  return fallback;
}

export function buildRuntimeConfig(env: EnvBindings): RuntimeConfig {
  return {
    assetSymbol: env.ASSET_SYMBOL || "BASE",
    priceFeedUrl: env.PRICE_FEED_URL || "https://api.coinbase.com/v2/prices/ETH-USD/spot",
    priceField: env.PRICE_FIELD || "data.amount",
    executionMode: asMode(env.EXECUTION_MODE, "paper"),
    webhookUrl: env.WEBHOOK_URL,
    webhookAuthToken: env.WEBHOOK_AUTH_TOKEN,
    defaultTradeSizeUsd: asNumber(env.DEFAULT_TRADE_SIZE_USD, 25),
    defaultMinMovePct: asNumber(env.DEFAULT_MIN_MOVE_PCT, 0.35),
    defaultMinIntervalSec: asNumber(env.DEFAULT_MIN_INTERVAL_SEC, 300),
    startingCashUsd: asNumber(env.STARTING_CASH_USD, 1000),
  };
}

export type EnvBindings = {
  KV: KVNamespace;
  ADMIN_TOKEN?: string;
  ASSET_SYMBOL?: string;
  PRICE_FEED_URL?: string;
  PRICE_FIELD?: string;
  EXECUTION_MODE?: ExecutionMode;
  WEBHOOK_URL?: string;
  WEBHOOK_AUTH_TOKEN?: string;
  DEFAULT_TRADE_SIZE_USD?: string;
  DEFAULT_MIN_MOVE_PCT?: string;
  DEFAULT_MIN_INTERVAL_SEC?: string;
  STARTING_CASH_USD?: string;
};
