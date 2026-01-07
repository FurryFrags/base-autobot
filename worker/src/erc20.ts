import { Contract, Wallet } from "ethers";
import type { HexAddress } from "./types";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

export function erc20(address: HexAddress, wallet: Wallet) {
  return new Contract(address, ERC20_ABI, wallet);
}
