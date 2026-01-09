import type { BotState, PricePoint, StrategyResult } from "./types";

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function evaluateStrategy(pricePoint: PricePoint, state: BotState): StrategyResult {
  const price = pricePoint.price;
  const previousPrice = state.lastPrice;
  const minMovePct = state.params.minMovePct;
  const exposureUsd = state.portfolio.asset * price;

  if (state.portfolio.asset > 0 && state.avgEntryPrice) {
    const entryChangePct = ((price - state.avgEntryPrice) / state.avgEntryPrice) * 100;
    if (state.params.stopLossPct > 0 && entryChangePct <= -state.params.stopLossPct) {
      return {
        pricePoint,
        signal: {
          action: "sell",
          reason: `Stop loss ${entryChangePct.toFixed(3)}% breached`,
          price,
          changePct: entryChangePct,
          generatedAt: pricePoint.fetchedAt,
        },
      };
    }
    if (state.params.takeProfitPct > 0 && entryChangePct >= state.params.takeProfitPct) {
      return {
        pricePoint,
        signal: {
          action: "sell",
          reason: `Take profit ${entryChangePct.toFixed(3)}% reached`,
          price,
          changePct: entryChangePct,
          generatedAt: pricePoint.fetchedAt,
        },
      };
    }
  }

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

  if (state.params.volatilityLookback > 1 && state.priceHistory.length > 1) {
    const meanPrice = state.priceHistory.reduce((sum, value) => sum + value, 0) / state.priceHistory.length;
    const volatilityPct = meanPrice > 0 ? (stddev(state.priceHistory) / meanPrice) * 100 : 0;
    if (state.params.maxDrawdownPct > 0 && volatilityPct > state.params.maxDrawdownPct) {
      return {
        pricePoint,
        signal: {
          action: "hold",
          reason: `Volatility ${volatilityPct.toFixed(3)}% above limit`,
          price,
          changePct,
          generatedAt: pricePoint.fetchedAt,
        },
      };
    }
  }

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

  const action = changePct > 0 ? "buy" : "sell";

  if (action === "buy" && state.params.maxPositionUsd > 0) {
    const projectedExposure = exposureUsd + state.params.tradeSizeUsd;
    if (projectedExposure > state.params.maxPositionUsd) {
      return {
        pricePoint,
        signal: {
          action: "hold",
          reason: `Exposure ${projectedExposure.toFixed(2)} exceeds max`,
          price,
          changePct,
          generatedAt: pricePoint.fetchedAt,
        },
      };
    }
  }

  return {
    pricePoint,
    signal: {
      action,
      reason: `Move ${changePct.toFixed(3)}% exceeds threshold`,
      price,
      changePct,
      generatedAt: pricePoint.fetchedAt,
    },
  };
}
