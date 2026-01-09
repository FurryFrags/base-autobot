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
  defaultMaxPositionUsd: number;
  defaultMaxDrawdownPct: number;
  defaultStopLossPct: number;
  defaultTakeProfitPct: number;
  defaultVolatilityLookback: number;
  defaultMaxTradesPerHour: number;
  startingCashUsd: number;
  addressBook: {
    chainId: number;
    network: string;
    routers: {
      uniswapV2Factory: string;
      uniswapV2Router02: string;
      uniswapUniversalRouter: string;
      uniswapPermit2: string;
      uniswapV3Factory: string;
      uniswapV3SwapRouter02: string;
      uniswapV3QuoterV2: string;
    };
    tokens: {
      weth: string;
      usdc: string;
      usdbc: string;
      aave: string;
      link: string;
      base: string;
    };
  };
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
  lastError?: { message: string; at: string };
  errorCount?: number;
  portfolio: {
    cashUsd: number;
    asset: number;
  };
  avgEntryPrice?: number;
  priceHistory: number[];
  params: {
    tradeSizeUsd: number;
    minMovePct: number;
    minIntervalSec: number;
    maxPositionUsd: number;
    maxDrawdownPct: number;
    stopLossPct: number;
    takeProfitPct: number;
    volatilityLookback: number;
    maxTradesPerHour: number;
  };
};

export type StrategyResult = {
  pricePoint: PricePoint;
  signal: Signal;
};
