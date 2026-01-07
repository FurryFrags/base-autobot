import { Wallet } from "ethers";
import { makeProvider } from "./rpc";

export interface EnvBindings {
  KV: KVNamespace;

  BOT_PRIVATE_KEY: string;

  BASE_RPC_URL: string;
  CHAIN_ID: string;

  UNISWAP_V3_SWAP_ROUTER02: string;
  UNISWAP_V3_QUOTER_V2: string;
}

export type Env = EnvBindings & {
  provider: ReturnType<typeof makeProvider>;
  wallet: Wallet;
};

export function buildRuntimeEnv(env: EnvBindings): Env {
  const provider = makeProvider(env.BASE_RPC_URL);
  const wallet = new Wallet(env.BOT_PRIVATE_KEY, provider);

  return {
    ...env,
    provider,
    wallet,
  };
}
