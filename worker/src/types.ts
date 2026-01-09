export type ExecutionMode = "paper" | "webhook" | "disabled";

export type RuntimeConfig = {
  assetSymbol: string;
  priceFeedUrl: string;
  priceField: string;
  executionMode: ExecutionMode;
  webhookUrl?: string;
  webhookAuthToken?: string;
  defaultTradeSizeUsd: number;
  defaultMinMovePct: number;
  defaultMinIntervalSec: number;
  startingCashUsd: number;
};

export type PricePoint = {
  price: number;
  fetchedAt: string;
};

export type Signal = {
  action: "buy" | "sell" | "hold";
  reason: string;
  price: number;
  changePct?: number;
  generatedAt: string;
};

export type ExecutionResult = {
  status: "skipped" | "submitted" | "filled" | "failed";
  mode: ExecutionMode;
  detail?: string;
  executedAt: string;
  tradeSizeUsd?: number;
  assetDelta?: number;
  cashDelta?: number;
};

export type BotState = {
  paused: boolean;
  lastRunAt?: string;
  lastPrice?: number;
  lastSignal?: Signal;
  lastExecution?: ExecutionResult;
  lastTradeAt?: string;
  portfolio: {
    cashUsd: number;
    asset: number;
  };
  params: {
    tradeSizeUsd: number;
    minMovePct: number;
    minIntervalSec: number;
  };
};

export type StrategyResult = {
  pricePoint: PricePoint;
  signal: Signal;
};
