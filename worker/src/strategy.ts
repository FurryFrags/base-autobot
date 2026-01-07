import type { BotState } from "./state";
import type { StrategyAction, TokenInfo, TokenSymbol } from "./types";
import { quoteExactInputSingle, swapExactInputSingle } from "./uniswap";
import { erc20 } from "./erc20";
import { parseUnits } from "ethers";
import type { Env } from "./worker_env";

/**
 * Strategy skeleton.
 *
 * Safety defaults:
 * - Returns only a QUOTE action unless you explicitly change `execute = true`.
 * - The Worker starts PAUSED by default.
 */
export async function runStrategyOnce(env: Env, tokens: Record<TokenSymbol, TokenInfo>, st: BotState): Promise<StrategyAction> {
  const fee = st.params.defaultFee;

  // Example pair: USDC -> WETH
  const tokenIn = tokens.USDC;
  const tokenOut = tokens.ETH;

  // Amount in human units (USDC has 6 decimals)
  const amountInHuman = st.params.tradeSizeUsd;

  const quote = await quoteExactInputSingle(
    env.UNISWAP_V3_QUOTER_V2,
    env.wallet,
    tokenIn,
    tokenOut,
    fee,
    amountInHuman
  );

  // Conservative slippage calc:
  const amountOut = BigInt(quote.amountOut);
  const amountOutMin = amountOut * BigInt(10_000 - st.params.maxSlippageBps) / 10_000n;

  // === IMPORTANT: default is quote-only ===
  const execute = false;

  if (!execute) {
    return { action: "quote", pair: `${tokenIn.symbol}/${tokenOut.symbol}`, quote };
  }

  // Ensure allowance (approve exact amount in this template)
  const amountInRaw = parseUnits(amountInHuman, tokenIn.decimals);
  const tIn = erc20(tokenIn.address, env.wallet);
  const allowance = await tIn.allowance(env.wallet.address, env.UNISWAP_V3_SWAP_ROUTER02);
  if (allowance < amountInRaw) {
    const approveTx = await tIn.approve(env.UNISWAP_V3_SWAP_ROUTER02, amountInRaw);
    await approveTx.wait();
  }

  const swap = await swapExactInputSingle({
    routerAddress: env.UNISWAP_V3_SWAP_ROUTER02,
    wallet: env.wallet,
    tokenIn,
    tokenOut,
    fee,
    amountInHuman,
    amountOutMinRaw: amountOutMin,
    recipient: env.wallet.address,
    deadlineSeconds: 60,
  });

  return { action: "swap", pair: `${tokenIn.symbol}/${tokenOut.symbol}`, swap };
}
