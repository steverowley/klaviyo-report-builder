// Pre-compute the report's headline numbers in JS rather than asking the model to
// do arithmetic on them. This removes the single biggest source of a wrong number
// reaching a client (the model mis-summing revenue or computing a delta against a
// zero/negative base), and makes the comparison-revenue definition explicit. The
// model formats narrative prose; these exact values fill the snapshot cards.

export function sumCounts(agg) {
  if (!agg || !Array.isArray(agg.counts)) return null;
  return agg.counts.reduce((a, b) => a + (Number(b) || 0), 0);
}

// Total revenue for a period = attributed revenue across all email campaigns + flows.
export function sumRevenue(period) {
  if (!period) return 0;
  const sum = (arr) => (arr || []).reduce((a, r) => a + (Number(r.conversion_value) || 0), 0);
  return sum(period.campaigns) + sum(period.flows);
}

export function formatGBP(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatInt(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-GB");
}

// Monochrome delta string: ↑/↓ arrow + signed value, never a colour and never a
// NaN/Infinity/percentage-against-a-zero-or-negative-base. Returns "" when there is
// nothing to compare against. Uses the unicode minus (−) to match the design system.
export function formatDelta(current, prev, { percent = true } = {}) {
  if (prev == null || current == null) return "";
  if (percent && prev > 0) {
    const pct = ((current - prev) / prev) * 100;
    return `${pct >= 0 ? "↑ +" : "↓ −"}${Math.abs(pct).toFixed(1)}% vs prev`;
  }
  const diff = current - prev;
  return `${diff >= 0 ? "↑ +" : "↓ −"}${formatInt(Math.abs(diff))} vs prev`;
}

// Build the formatted headline metrics for the Period Snapshot + List Growth cards.
export function computeHeadlineMetrics(kd) {
  const p = kd.period || {};
  const c = kd.comparison || null;
  const pa = kd.aggregates || {};
  const ca = (c && c.aggregates) || {};

  const pRev = sumRevenue(p);
  const cRev = c ? sumRevenue(c) : null;
  const pSubs = sumCounts(pa.subscribers);
  const cSubs = c ? sumCounts(ca.subscribers) : null;
  const pUnsub = sumCounts(pa.unsubscribes);
  const cUnsub = c ? sumCounts(ca.unsubscribes) : null;
  const pOrders = sumCounts(pa.orders);
  const cOrders = c ? sumCounts(ca.orders) : null;
  const pCamp = (p.campaigns || []).length;
  const cCamp = c ? (c.campaigns || []).length : null;
  const pNet = pSubs != null && pUnsub != null ? pSubs - pUnsub : null;
  const cNet = cSubs != null && cUnsub != null ? cSubs - cUnsub : null;

  return {
    totalRevenue:   { value: formatGBP(pRev),   delta: c ? formatDelta(pRev, cRev) : "" },
    campaignsSent:  { value: formatInt(pCamp),  delta: c ? formatDelta(pCamp, cCamp, { percent: false }) : "" },
    newSubscribers: { value: formatInt(pSubs),  delta: c ? formatDelta(pSubs, cSubs) : "" },
    totalOrders:    { value: formatInt(pOrders), delta: c ? formatDelta(pOrders, cOrders) : "" },
    unsubscribes:   { value: formatInt(pUnsub), delta: c ? formatDelta(pUnsub, cUnsub) : "" },
    netGrowth:      { value: pNet == null ? "—" : (pNet >= 0 ? "+" : "") + formatInt(pNet), delta: c ? formatDelta(pNet, cNet) : "" },
  };
}
