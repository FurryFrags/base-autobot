export type BotState = {
  paused: boolean;
  lastRunAt?: string;
  lastResult?: unknown;
  params: {
    // Safety knobs
    maxSlippageBps: number; // e.g. 50 = 0.50%
    maxTradesPerRun: number;
    tradeSizeUsd: string; // human string to avoid float surprises
    defaultFee: number; // Uniswap v3 fee tier, e.g. 500 / 3000 / 10000
  };
};

const KEY = "bot_state_v1";

export async function loadState(KV: KVNamespace): Promise<BotState> {
  const raw = await KV.get(KEY);
  if (!raw) {
    return {
      paused: true, // SAFE DEFAULT
      params: {
        maxSlippageBps: 50,
        maxTradesPerRun: 1,
        tradeSizeUsd: "25",
        defaultFee: 3000,
      },
    };
  }
  return JSON.parse(raw) as BotState;
}

export async function saveState(KV: KVNamespace, st: BotState): Promise<void> {
  await KV.put(KEY, JSON.stringify(st));
}
