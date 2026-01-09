import type { PricePoint, RuntimeConfig } from "./types";
import { asNumber, nowIso, readPath } from "./utils";

export async function fetchPrice(config: RuntimeConfig): Promise<PricePoint> {
  const response = await fetch(config.priceFeedUrl, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Price feed error (${response.status})`);
  }

  const data = await response.json();
  const raw = readPath(data, config.priceField);
  const price = asNumber(raw);

  if (!price || price <= 0) {
    throw new Error(`Invalid price from feed at field '${config.priceField}'`);
  }

  return {
    price,
    fetchedAt: nowIso(),
  };
}
