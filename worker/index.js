const KLAVIYO_BASE = 'https://a.klaviyo.com/api';
const REVISION = '2024-10-15';

function klaviyoHeaders(apiKey) {
  return {
    'Authorization': `Klaviyo-API-Key ${apiKey}`,
    'revision': REVISION,
    'Content-Type': 'application/json',
  };
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

async function kFetch(path, apiKey, init = {}, retries = 4) {
  const res = await fetch(`${KLAVIYO_BASE}${path}`, {
    ...init,
    headers: klaviyoHeaders(apiKey),
  });
  if (res.status === 429 && retries > 0) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '1', 10);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return kFetch(path, apiKey, init, retries - 1);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Klaviyo ${res.status} on ${path}: ${body.slice(0, 400)}`);
  }
  return res.json();
}

function reportBody(type, startDate, endDate, conversionMetricId) {
  const attributes = {
    timeframe: {
      start: `${startDate}T00:00:00+00:00`,
      end: `${endDate}T23:59:59+00:00`,
    },
    statistics: [
      'recipients', 'delivered', 'open_rate', 'click_rate',
      'conversions', 'conversion_rate', 'conversion_value',
    ],
  };
  if (conversionMetricId) attributes.conversion_metric_id = conversionMetricId;
  return JSON.stringify({ data: { type, attributes } });
}

function aggregateBody(metricId, startDate, endDate, measurements) {
  return JSON.stringify({
    data: {
      type: 'metric-aggregate',
      attributes: {
        metric_id: metricId,
        interval: 'day',
        measurements,
        filter: `greater-or-equal(datetime,${startDate}T00:00:00+00:00),less-or-equal(datetime,${endDate}T23:59:59+00:00)`,
        timezone: 'UTC',
        page_size: 500,
      },
    },
  });
}

// Normalise a metric-aggregate response into {dates, counts}.
// Handles both flat [5,3,7] and nested [[5],[3],[7]] Klaviyo response formats.
function processAggregate(agg, measurement = 'count') {
  try {
    const attrs = agg?.data?.attributes;
    if (!attrs) return null;
    const dates = attrs.dates;
    const raw = attrs.data?.[measurement];
    if (!dates?.length || !raw?.length) return null;
    const counts = raw.map(v => Array.isArray(v) ? Number(v[0] ?? 0) : Number(v ?? 0));
    return { dates: dates.map(d => d.slice(0, 10)), counts };
  } catch {
    return null;
  }
}

// Roll up per-message flow rows into per-flow aggregates.
function aggregateFlowRows(flowReport) {
  const rows = flowReport?.data ?? [];
  const byFlow = {};

  for (const row of rows) {
    const a = row.attributes ?? {};
    // Klaviyo flow-values-report nests stats under groupings
    const stats = a.statistics ?? a;
    const flowId = a.flow_id ?? a.groupings?.flow_id ?? row.id ?? 'unknown';
    const flowName = a.flow_name ?? a.groupings?.flow_name ?? a.name ?? flowId;
    const trigger = a.flow_trigger ?? a.trigger_type ?? null;

    if (!byFlow[flowId]) {
      byFlow[flowId] = {
        id: flowId,
        name: flowName,
        trigger,
        recipients: 0,
        delivered: 0,
        opens: 0,
        clicks: 0,
        conversions: 0,
        conversion_value: 0,
      };
    }

    const f = byFlow[flowId];
    const r = Number(stats.recipients ?? 0);
    f.recipients += r;
    f.delivered += Number(stats.delivered ?? 0);
    // open_rate and click_rate are fractions of recipients — recover event counts
    f.opens += Math.round(Number(stats.open_rate ?? 0) * r);
    f.clicks += Math.round(Number(stats.click_rate ?? 0) * r);
    f.conversions += Number(stats.conversions ?? 0);
    f.conversion_value += Number(stats.conversion_value ?? 0);
  }

  return Object.values(byFlow).map(f => ({
    ...f,
    open_rate: f.recipients > 0 ? f.opens / f.recipients : 0,
    click_rate: f.recipients > 0 ? f.clicks / f.recipients : 0,
    ctor: f.opens > 0 ? f.clicks / f.opens : 0,
    conversion_rate: f.recipients > 0 ? f.conversions / f.recipients : 0,
    rpr: f.recipients > 0 ? f.conversion_value / f.recipients : 0,
  }));
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST only' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }

    let body;
    try { body = await request.json(); }
    catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }

    const { klaviyoKey, startDate, endDate, comparisonStart, comparisonEnd } = body;
    if (!klaviyoKey || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: 'Required: klaviyoKey, startDate, endDate' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }

    try {
      const [accounts, metrics] = await Promise.all([
        kFetch('/accounts/', klaviyoKey),
        kFetch('/metrics/', klaviyoKey),
      ]);

      const metricList = metrics.data ?? [];
      const findMetric = (...keywords) =>
        metricList.find(m => keywords.some(k => (m.attributes?.name ?? '').toLowerCase().includes(k)));

      const conversionMetric    = findMetric('placed order');
      const subscribedMetric    = findMetric('subscribed to list', 'subscribe to list');
      const unsubscribedMetric  = findMetric('unsubscribed', 'unsubscribe');

      const conversionMetricId   = conversionMetric?.id ?? null;
      const subscribedMetricId   = subscribedMetric?.id ?? null;
      const unsubscribedMetricId = unsubscribedMetric?.id ?? null;

      const safeAgg = (metricId, measurements) =>
        metricId
          ? kFetch('/metric-aggregates/', klaviyoKey, {
              method: 'POST',
              body: aggregateBody(metricId, startDate, endDate, measurements),
            }).catch(() => null)
          : Promise.resolve(null);

      const [campaignReport, flowReport, orderAgg, subscriberAgg, unsubAgg] = await Promise.all([
        kFetch('/campaign-values-reports/', klaviyoKey, {
          method: 'POST', body: reportBody('campaign-values-report', startDate, endDate, conversionMetricId),
        }),
        kFetch('/flow-values-reports/', klaviyoKey, {
          method: 'POST', body: reportBody('flow-values-report', startDate, endDate, conversionMetricId),
        }),
        safeAgg(conversionMetricId, ['count', 'sum_value']),
        safeAgg(subscribedMetricId, ['count']),
        safeAgg(unsubscribedMetricId, ['count']),
      ]);

      let comparison = null;
      if (comparisonStart && comparisonEnd) {
        const [compCampaigns, compFlows] = await Promise.all([
          kFetch('/campaign-values-reports/', klaviyoKey, {
            method: 'POST', body: reportBody('campaign-values-report', comparisonStart, comparisonEnd, conversionMetricId),
          }),
          kFetch('/flow-values-reports/', klaviyoKey, {
            method: 'POST', body: reportBody('flow-values-report', comparisonStart, comparisonEnd, conversionMetricId),
          }),
        ]);
        comparison = {
          campaigns: campaignReport, // raw for Claude to sum
          flows: aggregateFlowRows(compFlows),
        };
      }

      return new Response(JSON.stringify({
        account: accounts.data?.[0] ?? null,
        period: {
          campaigns: campaignReport,
          flows: aggregateFlowRows(flowReport),
        },
        comparison,
        aggregates: {
          orders:       processAggregate(orderAgg, 'count'),
          subscribers:  processAggregate(subscriberAgg, 'count'),
          unsubscribes: processAggregate(unsubAgg, 'count'),
        },
      }), {
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }
  },
};
