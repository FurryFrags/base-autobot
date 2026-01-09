import type { MarketPoint, RuntimeConfig } from "./types";
import { asNumber, nowIso, readPath } from "./utils";

async function fetchPriceFromFeed(url: string, field: string): Promise<number> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Price feed error (${response.status})`);
  }

  const data = await response.json();
  const raw = readPath(data, field);
  const price = asNumber(raw);

  if (!price || price <= 0) {
    throw new Error(`Invalid price from feed at field '${field}'`);
  }

  return price;
}

export async function fetchMarketPoint(config: RuntimeConfig): Promise<MarketPoint> {
  const price = await fetchPriceFromFeed(config.priceFeedUrl, config.priceField);
  const indexPrice =
    config.indexFeedUrl && config.indexPriceField
      ? await fetchPriceFromFeed(config.indexFeedUrl, config.indexPriceField)
      : undefined;

  return {
    price,
    indexPrice,
    fetchedAt: nowIso(),
  };
}
