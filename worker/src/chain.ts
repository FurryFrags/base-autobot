export type AddressBook = {
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

export const baseMainnetAddressBook: AddressBook = {
  chainId: 8453,
  network: "base",
  routers: {
    uniswapV2Factory: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
    uniswapV2Router02: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    uniswapUniversalRouter: "0x6fF5693b99212Da76ad316178A184AB56D299b43",
    uniswapPermit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    uniswapV3Factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    uniswapV3SwapRouter02: "0x2626664c2603336E57B271c5C0b26F421741e481",
    uniswapV3QuoterV2: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
  },
  tokens: {
    weth: "0x4200000000000000000000000000000000000006",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdbc: "0xD9aaEC86B65D86f6A7B5B1b0c42FFA531710b6CA",
    aave: "0x63706e401c06ac8513145b7687a14804d17f814b",
    link: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196",
    base: "0xd07379a755a8f11b57610154861d694b2a0f615a",
  },
};
