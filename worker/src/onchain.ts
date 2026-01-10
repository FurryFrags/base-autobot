import {
  Contract,
  JsonRpcProvider,
  Wallet,
  formatUnits,
  isAddress,
  parseUnits,
} from "ethers";
import type { BotState, ExecutionResult, RuntimeConfig, RuntimeSecrets, Signal } from "./types";
import { nowIso, resolveTokenKey } from "./utils";

const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

const routerAbi = [
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
];

function normalizePrivateKey(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  return /^0x[0-9a-fA-F]{64}$/.test(withPrefix) ? withPrefix : undefined;
}

function toDecimalString(value: number, decimals: number): string {
  const safeDecimals = Math.min(Math.max(decimals, 0), 18);
  return value.toFixed(safeDecimals);
}

export async function executeOnchainTrade(
  config: RuntimeConfig,
  secrets: RuntimeSecrets,
  state: BotState,
  signal: Signal,
  totalPortfolioUsd: number,
  allocationTarget?: number,
): Promise<{ result: ExecutionResult; nextState: BotState }> {
  const executedAt = nowIso();
  if (!secrets.rpcUrl) {
    return {
      result: {
        status: "failed",
        mode: "onchain",
        detail: "RPC_URL is not set",
        executedAt,
      },
      nextState: state,
    };
  }

  const privateKey = normalizePrivateKey(secrets.botPrivateKey);
  if (!privateKey) {
    return {
      result: {
        status: "failed",
        mode: "onchain",
        detail: "BOT_PRIVATE_KEY is missing or invalid",
        executedAt,
      },
      nextState: state,
    };
  }

  const assetTokenKey = resolveTokenKey(config.assetSymbol, config.addressBook.tokens);
  const quoteTokenKey = resolveTokenKey(config.quoteSymbol, config.addressBook.tokens);
  if (!assetTokenKey || !quoteTokenKey) {
    return {
      result: {
        status: "failed",
        mode: "onchain",
        detail: "ASSET_SYMBOL or QUOTE_SYMBOL not found in address book",
        executedAt,
      },
      nextState: state,
    };
  }

  const assetToken = config.addressBook.tokens[assetTokenKey];
  const quoteToken = config.addressBook.tokens[quoteTokenKey];
  const routerAddress = config.swapRouterAddress || config.addressBook.routers.uniswapV2Router02;
  if (![assetToken, quoteToken, routerAddress].every((addr) => isAddress(addr))) {
    return {
      result: {
        status: "failed",
        mode: "onchain",
        detail: "Invalid router or token address",
        executedAt,
      },
      nextState: state,
    };
  }

  const tradeSizeUsd = state.params.tradeSizeUsd;
  if (tradeSizeUsd <= 0) {
    return {
      result: {
        status: "failed",
        mode: "onchain",
        detail: "Trade size must be positive",
        executedAt,
      },
      nextState: state,
    };
  }

  if (signal.action === "buy" && allocationTarget && allocationTarget > 0) {
    const projectedExposure = state.portfolio.asset * signal.price + tradeSizeUsd;
    const allocationLimit = totalPortfolioUsd * allocationTarget;
    if (projectedExposure > allocationLimit) {
      return {
        result: {
          status: "skipped",
          mode: "onchain",
          detail: "Allocation limit reached",
          executedAt,
        },
        nextState: state,
      };
    }
  }

  const provider = new JsonRpcProvider(secrets.rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  const inputToken = signal.action === "buy" ? quoteToken : assetToken;
  const outputToken = signal.action === "buy" ? assetToken : quoteToken;
  const inputContract = new Contract(inputToken, erc20Abi, provider);
  const outputContract = new Contract(outputToken, erc20Abi, provider);
  const [inputDecimals, outputDecimals] = await Promise.all([
    inputContract.decimals(),
    outputContract.decimals(),
  ]);

  const amountInValue =
    signal.action === "buy" ? tradeSizeUsd : tradeSizeUsd / signal.price;
  if (!Number.isFinite(amountInValue) || amountInValue <= 0) {
    return {
      result: {
        status: "failed",
        mode: "onchain",
        detail: "Computed trade amount is invalid",
        executedAt,
      },
      nextState: state,
    };
  }

  const amountIn = parseUnits(toDecimalString(amountInValue, inputDecimals), inputDecimals);
  const balance = await inputContract.balanceOf(wallet.address);
  if (balance < amountIn) {
    return {
      result: {
        status: "skipped",
        mode: "onchain",
        detail: "Insufficient token balance",
        executedAt,
      },
      nextState: state,
    };
  }

  const allowance = await inputContract.allowance(wallet.address, routerAddress);
  if (allowance < amountIn) {
    const approval = await new Contract(inputToken, erc20Abi, wallet).approve(
      routerAddress,
      amountIn,
    );
    return {
      result: {
        status: "submitted",
        mode: "onchain",
        detail: `Approval submitted ${approval.hash}`,
        executedAt,
        tradeSizeUsd: tradeSizeUsd,
      },
      nextState: state,
    };
  }

  const router = new Contract(routerAddress, routerAbi, wallet);
  const amountsOut: bigint[] = await router.getAmountsOut(amountIn, [inputToken, outputToken]);
  const expectedOut = amountsOut[amountsOut.length - 1];
  const slippageBps = Math.min(Math.max(config.swapSlippageBps, 0), 5_000);
  const minOut = (expectedOut * BigInt(10_000 - slippageBps)) / BigInt(10_000);
  const deadline = Math.floor(Date.now() / 1000) + Math.max(config.swapDeadlineSec, 60);
  const swap = await router.swapExactTokensForTokens(
    amountIn,
    minOut,
    [inputToken, outputToken],
    wallet.address,
    deadline,
  );

  const expectedOutValue = Number(formatUnits(expectedOut, outputDecimals));
  const amountInValueFormatted = Number(formatUnits(amountIn, inputDecimals));
  const assetDelta =
    signal.action === "buy" ? expectedOutValue : -amountInValueFormatted;
  const cashDelta = signal.action === "buy" ? -tradeSizeUsd : expectedOutValue;
  const tradeSize =
    signal.action === "buy" ? tradeSizeUsd : expectedOutValue;

  return {
    result: {
      status: "submitted",
      mode: "onchain",
      detail: `Swap submitted ${swap.hash}`,
      executedAt,
      tradeSizeUsd: tradeSize,
      assetDelta,
      cashDelta,
    },
    nextState: {
      ...state,
      lastTradeAt: executedAt,
    },
  };
}
