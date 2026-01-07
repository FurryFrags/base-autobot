import type { TokenInfo, TokenSymbol } from "./types";

/**
 * Allowlist ONLY.
 * Addresses verified on Base via BaseScan + Uniswap Base deployments page.
 */
export function getTokenMap(): Record<TokenSymbol, TokenInfo> {
  return {
    // cbBTC (8 decimals)
    CBBTC: { symbol: "CBBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8 },

    // WETH on Base (Uniswap docs list Base wrapped native token address)
    ETH:   { symbol: "ETH",   address: "0x4200000000000000000000000000000000000006", decimals: 18 },

    // LINK on Base (you can replace if you use a different canonical LINK bridge)
    LINK:  { symbol: "LINK",  address: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196", decimals: 18 },

    // AAVE on Base
    AAVE:  { symbol: "AAVE",  address: "0x63706e401c06ac8513145b7687a14804d17f814b", decimals: 18 },

    // USDC on Base
    USDC:  { symbol: "USDC",  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
  };
}

export function assertAllowlist(map: Record<string, { address: string }>) {
  for (const [k, v] of Object.entries(map)) {
    if (!v.address || !v.address.startsWith("0x") || v.address.length !== 42) {
      throw new Error(`Bad address for token ${k}: ${v.address}`);
    }
  }
}
