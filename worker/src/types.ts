export type HexAddress = `0x${string}`;

export type TokenSymbol = "CBBTC" | "ETH" | "LINK" | "AAVE" | "USDC";

export type TokenInfo = {
  symbol: TokenSymbol;
  address: HexAddress;
  decimals: number;
};

export type QuoteResult = {
  amountOut: string; // raw (wei-like)
  sqrtPriceX96After?: string;
  initializedTicksCrossed?: number;
  gasEstimate?: string;
};

export type SwapResult = {
  txHash: string;
  amountIn: string;
  amountOutMin: string;
};

export type StrategyAction =
  | { action: "none" }
  | { action: "quote"; pair: string; quote: QuoteResult }
  | { action: "swap"; pair: string; swap: SwapResult };
