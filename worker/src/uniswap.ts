import { Contract, Wallet, parseUnits } from "ethers";
import type { QuoteResult, SwapResult, TokenInfo } from "./types";

/**
 * Uniswap v3 Base deployments:
 * - QuoterV2: 0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a
 * - SwapRouter02: 0x2626664c2603336E57B271c5C0b26F421741e481
 *
 * These are from Uniswap's Base deployments page.
 */

const QUOTER_V2_ABI = [
  // quoteExactInputSingle(tokenIn, tokenOut, fee, amountIn, sqrtPriceLimitX96)
  "function quoteExactInputSingle(address,address,uint24,uint256,uint160) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
];

const SWAP_ROUTER02_ABI = [
  // exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96))
  "function exactInputSingle(tuple(address,address,uint24,address,uint256,uint256,uint256,uint160)) payable returns (uint256 amountOut)",
];

export async function quoteExactInputSingle(
  quoterAddress: string,
  wallet: Wallet,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  fee: number,
  amountInHuman: string
): Promise<QuoteResult> {
  const quoter = new Contract(quoterAddress, QUOTER_V2_ABI, wallet);
  const amountIn = parseUnits(amountInHuman, tokenIn.decimals);
  const sqrtPriceLimitX96 = 0n;

  const [amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate] =
    await quoter.quoteExactInputSingle(tokenIn.address, tokenOut.address, fee, amountIn, sqrtPriceLimitX96);

  return {
    amountOut: amountOut.toString(),
    sqrtPriceX96After: sqrtPriceX96After.toString(),
    initializedTicksCrossed: Number(initializedTicksCrossed),
    gasEstimate: gasEstimate.toString(),
  };
}

export async function swapExactInputSingle(params: {
  routerAddress: string;
  wallet: Wallet;
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  fee: number;
  amountInHuman: string;
  amountOutMinRaw: bigint;
  recipient: string;
  deadlineSeconds: number;
}): Promise<SwapResult> {
  const {
    routerAddress,
    wallet,
    tokenIn,
    tokenOut,
    fee,
    amountInHuman,
    amountOutMinRaw,
    recipient,
    deadlineSeconds,
  } = params;

  const router = new Contract(routerAddress, SWAP_ROUTER02_ABI, wallet);

  const amountIn = parseUnits(amountInHuman, tokenIn.decimals);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);

  const callParams = [
    tokenIn.address,
    tokenOut.address,
    fee,
    recipient,
    deadline,
    amountIn,
    amountOutMinRaw,
    0n, // sqrtPriceLimitX96
  ] as const;

  const tx = await router.exactInputSingle(callParams);
  const receipt = await tx.wait();

  return {
    txHash: receipt.hash,
    amountIn: amountIn.toString(),
    amountOutMin: amountOutMinRaw.toString(),
  };
}
