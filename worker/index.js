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

async function kFetch(path, apiKey, init = {}) {
  const res = await fetch(`${KLAVIYO_BASE}${path}`, {
    ...init,
    headers: klaviyoHeaders(apiKey),
  });
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
      'conversions', 'conversion_rate', 'revenue',
    ],
  };
  if (conversionMetricId) attributes.conversion_metric_id = conversionMetricId;
  return JSON.stringify({ data: { type, attributes } });
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
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }

    const { klaviyoKey, startDate, endDate, comparisonStart, comparisonEnd } = body;

    if (!klaviyoKey || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: 'Required: klaviyoKey, startDate, endDate' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }

    try {
      // Account info + metrics list in parallel (metrics needed for conversion_metric_id)
      const [accounts, metrics] = await Promise.all([
        kFetch('/accounts/', klaviyoKey),
        kFetch('/metrics/?page[size]=100', klaviyoKey),
      ]);

      const conversionMetric = (metrics.data ?? []).find(m =>
        (m.attributes?.name ?? '').toLowerCase().includes('placed order')
      );
      const conversionMetricId = conversionMetric?.id ?? null;

      // Campaign + flow reports for the primary period
      const [campaignReport, flowReport] = await Promise.all([
        kFetch('/campaign-values-reports/', klaviyoKey, {
          method: 'POST',
          body: reportBody('campaign-values-report', startDate, endDate, conversionMetricId),
        }),
        kFetch('/flow-values-reports/', klaviyoKey, {
          method: 'POST',
          body: reportBody('flow-values-report', startDate, endDate, conversionMetricId),
        }),
      ]);

      // Comparison period (if requested)
      let comparison = null;
      if (comparisonStart && comparisonEnd) {
        const [compCampaigns, compFlows] = await Promise.all([
          kFetch('/campaign-values-reports/', klaviyoKey, {
            method: 'POST',
            body: reportBody('campaign-values-report', comparisonStart, comparisonEnd, conversionMetricId),
          }),
          kFetch('/flow-values-reports/', klaviyoKey, {
            method: 'POST',
            body: reportBody('flow-values-report', comparisonStart, comparisonEnd, conversionMetricId),
          }),
        ]);
        comparison = { campaigns: compCampaigns, flows: compFlows };
      }

      return new Response(JSON.stringify({
        account: accounts.data?.[0] ?? null,
        period: { campaigns: campaignReport, flows: flowReport },
        comparison,
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
