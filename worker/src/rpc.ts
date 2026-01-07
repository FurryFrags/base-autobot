import { JsonRpcProvider } from "ethers";

export function makeProvider(rpcUrl: string) {
  return new JsonRpcProvider(rpcUrl, undefined, {
    // keep it conservative; Workers are not a full node environment
    staticNetwork: true,
  });
}
