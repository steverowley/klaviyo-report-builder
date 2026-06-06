import { describe, it, expect } from "vitest";
import { sumCounts, sumRevenue, formatGBP, formatInt, formatDelta, computeHeadlineMetrics } from "./reportMetrics.js";

describe("sumRevenue", () => {
  it("sums conversion_value across campaigns and flows", () => {
    const period = { campaigns: [{ conversion_value: 100 }, { conversion_value: 50.5 }], flows: [{ conversion_value: 200 }] };
    expect(sumRevenue(period)).toBeCloseTo(350.5);
  });
  it("handles missing arrays", () => {
    expect(sumRevenue({})).toBe(0);
    expect(sumRevenue(null)).toBe(0);
  });
});

describe("sumCounts", () => {
  it("sums the counts array", () => {
    expect(sumCounts({ counts: [1, 2, 3] })).toBe(6);
  });
  it("returns null when unavailable", () => {
    expect(sumCounts(null)).toBeNull();
    expect(sumCounts({})).toBeNull();
  });
});

describe("formatDelta", () => {
  it("shows a percentage with an arrow for a positive change", () => {
    expect(formatDelta(120, 100)).toBe("↑ +20.0% vs prev");
  });
  it("shows a downward arrow and unicode minus for a decrease", () => {
    expect(formatDelta(80, 100)).toBe("↓ −20.0% vs prev");
  });
  it("never divides by a zero or negative base — shows absolute change instead", () => {
    expect(formatDelta(5, 0)).toBe("↑ +5 vs prev");
    expect(formatDelta(2, -3)).toMatch(/vs prev/);
    expect(formatDelta(5, 0)).not.toMatch(/Infinity|NaN|%/);
  });
  it("returns empty string when there is nothing to compare", () => {
    expect(formatDelta(5, null)).toBe("");
  });
  it("uses an integer (count) delta when percent is false", () => {
    expect(formatDelta(7, 4, { percent: false })).toBe("↑ +3 vs prev");
  });
});

describe("formatGBP / formatInt", () => {
  it("formats currency to 2dp with thousands separators", () => {
    expect(formatGBP(1234.5)).toBe("£1,234.50");
  });
  it("renders an em dash for null", () => {
    expect(formatGBP(null)).toBe("—");
    expect(formatInt(null)).toBe("—");
  });
});

describe("computeHeadlineMetrics", () => {
  it("computes revenue + delta and never emits NaN against a zero base", () => {
    const kd = {
      period: { campaigns: [{ conversion_value: 1000 }], flows: [{ conversion_value: 500 }] },
      aggregates: { subscribers: { counts: [10, 20] }, orders: { counts: [1, 2] }, unsubscribes: { counts: [0, 0] } },
      comparison: {
        campaigns: [{ conversion_value: 1000 }], flows: [{ conversion_value: 0 }],
        aggregates: { subscribers: { counts: [0] }, orders: { counts: [3] }, unsubscribes: { counts: [0] } },
      },
    };
    const m = computeHeadlineMetrics(kd);
    expect(m.totalRevenue.value).toBe("£1,500.00");
    expect(m.totalRevenue.delta).toBe("↑ +50.0% vs prev"); // 1500 vs 1000
    expect(m.newSubscribers.value).toBe("30");
    expect(m.newSubscribers.delta).not.toMatch(/Infinity|NaN|%/); // comparison base is 0
    expect(m.netGrowth.value).toBe("+30");
  });
  it("omits deltas when there is no comparison", () => {
    const m = computeHeadlineMetrics({ period: { campaigns: [], flows: [] }, aggregates: {} });
    expect(m.totalRevenue.delta).toBe("");
    expect(m.totalRevenue.value).toBe("£0.00");
  });
});
