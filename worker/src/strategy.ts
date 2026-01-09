import type { BotState, PricePoint, StrategyResult } from "./types";

export function evaluateStrategy(pricePoint: PricePoint, state: BotState): StrategyResult {
  const price = pricePoint.price;
  const previousPrice = state.lastPrice;
  const minMovePct = state.params.minMovePct;

  if (!previousPrice) {
    return {
      pricePoint,
      signal: {
        action: "hold",
        reason: "No previous price to compare",
        price,
        generatedAt: pricePoint.fetchedAt,
      },
    };
  }

  const changePct = ((price - previousPrice) / previousPrice) * 100;
  const absMove = Math.abs(changePct);

  if (absMove < minMovePct) {
    return {
      pricePoint,
      signal: {
        action: "hold",
        reason: `Move ${absMove.toFixed(3)}% below threshold`,
        price,
        changePct,
        generatedAt: pricePoint.fetchedAt,
      },
    };
  }

  return {
    pricePoint,
    signal: {
      action: changePct > 0 ? "buy" : "sell",
      reason: `Move ${changePct.toFixed(3)}% exceeds threshold`,
      price,
      changePct,
      generatedAt: pricePoint.fetchedAt,
    },
  };
}
