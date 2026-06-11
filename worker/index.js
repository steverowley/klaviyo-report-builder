const KLAVIYO_BASE = 'https://a.klaviyo.com/api';
const REVISION = '2024-10-15';

function klaviyoHeaders(apiKey) {
  return {
    'Authorization': `Klaviyo-API-Key ${apiKey}`,
    'revision': REVISION,
    'Content-Type': 'application/json',
  };
}

const DEFAULT_ORIGIN = 'https://steverowley.github.io';

// Resolve the CORS origin against an allowlist instead of reflecting any origin.
// Override the allowlist with the ALLOWED_ORIGINS worker var (comma-separated).
// localhost/127.0.0.1 on any port is always allowed for local dev.
export function allowedOrigin(origin, env) {
  const list = (env?.ALLOWED_ORIGINS || DEFAULT_ORIGIN)
    .split(',').map(s => s.trim()).filter(Boolean);
  if (origin && (list.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) {
    return origin;
  }
  return list[0] || DEFAULT_ORIGIN;
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin || DEFAULT_ORIGIN,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

async function kFetch(path, apiKey, init = {}, retries = 4) {
  const res = await fetch(`${KLAVIYO_BASE}${path}`, {
    ...init,
    headers: klaviyoHeaders(apiKey),
  });
  if (res.status === 429 && retries > 0) {
    const parsed = parseInt(res.headers.get('Retry-After') || '1', 10);
    // Clamp to 10s so a hostile or oversized Retry-After can't hang the worker
    // until it times out into an opaque 5xx.
    const wait = Math.min(Number.isFinite(parsed) ? Math.max(parsed, 0) : 1, 10);
    await new Promise(r => setTimeout(r, wait * 1000));
    return kFetch(path, apiKey, init, retries - 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Log the upstream detail server-side only; never return raw Klaviyo bodies to
    // the browser (they can echo request context).
    console.error(`Klaviyo ${res.status} on ${path}: ${body.slice(0, 400)}`);
    const err = new Error(`Klaviyo request failed (${res.status})`);
    err.klaviyoStatus = res.status;
    throw err;
  }
  return res.json();
}

export function slugify(name) {
  return name.toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 32) || ('client_' + Date.now().toString(36));
}

// KV metadata is capped at 1024 bytes total; keep persisted warnings small so a
// report with many warnings still saves (the warning also lives in the report HTML).
export function trimReportWarnings(warnings) {
  if (!Array.isArray(warnings)) return [];
  return warnings.slice(0, 6).map((w) => String(w).slice(0, 120));
}

// KV key for a month's cumulative Anthropic spend, e.g. 'spend_2026-06'.
export function spendMonthKey(date = new Date()) {
  return `spend_${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Add a sanitised per-report cost to a running monthly total. Ignores garbage and
// clamps a single report's contribution so one bad value can't blow up the total.
export function addSpend(current, costUsd) {
  const base = Number.isFinite(current) ? current : 0;
  const add = Number(costUsd);
  if (!Number.isFinite(add) || add <= 0) return base;
  return Math.round((base + Math.min(add, 50)) * 1e6) / 1e6;
}

// Read merged client list: KV-stored clients first, then CLIENTS_JSON secret fallback.
async function readClients(env) {
  let kvClients = [];
  if (env.CLIENTS_KV) {
    try { kvClients = JSON.parse(await env.CLIENTS_KV.get('clients') || '[]'); } catch {}
  }
  let secretClients = [];
  try { secretClients = JSON.parse(env.CLIENTS_JSON || '[]'); } catch {}
  const kvIds = new Set(kvClients.map(c => c.id));
  const merged = [...kvClients];
  for (const sc of secretClients) {
    if (!kvIds.has(sc.id)) merged.push(sc);
  }
  return merged;
}

// Read Klaviyo key: KV first, then per-client env secret fallback.
async function readKlaviyoKey(env, clientId) {
  if (env.CLIENTS_KV) {
    const kv = await env.CLIENTS_KV.get('key_' + clientId);
    if (kv) return kv;
  }
  return env[`KLAVIYO_KEY_${clientId}`] || null;
}

export function reportBody(type, startDate, endDate, conversionMetricId, startOffset = '+00:00', endOffset = '+00:00') {
  const attributes = {
    timeframe: {
      start: `${startDate}T00:00:00${startOffset}`,
      end: `${endDate}T23:59:59${endOffset}`,
    },
    statistics: [
      'recipients', 'delivered', 'open_rate', 'click_rate',
      'conversions', 'conversion_rate', 'conversion_value',
    ],
  };
  if (conversionMetricId) attributes.conversion_metric_id = conversionMetricId;
  return JSON.stringify({ data: { type, attributes } });
}

// Validate the date inputs to the data endpoint (defence-in-depth — the UI also
// validates). Returns a user-facing error string, or null when the range is sane.
export function validateDateRange({ startDate, endDate, comparisonStart, comparisonEnd } = {}) {
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  const check = (label, v) => {
    if (!ymd.test(v)) return `${label} must be in YYYY-MM-DD format`;
    if (Number.isNaN(Date.parse(`${v}T00:00:00Z`))) return `${label} is not a valid date`;
    return null;
  };
  for (const [label, v] of [['startDate', startDate], ['endDate', endDate]]) {
    const e = check(label, v);
    if (e) return e;
  }
  if (startDate > endDate) return 'startDate must be on or before endDate'; // lexicographic == chronological for YYYY-MM-DD
  const span = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000;
  if (span > 430) return 'Date range is too long (maximum ~14 months)';
  if (comparisonStart != null || comparisonEnd != null) {
    for (const [label, v] of [['comparisonStart', comparisonStart], ['comparisonEnd', comparisonEnd]]) {
      const e = check(label, v);
      if (e) return e;
    }
    if (comparisonStart > comparisonEnd) return 'comparisonStart must be on or before comparisonEnd';
  }
  return null;
}

// Add one calendar day to a YYYY-MM-DD string (UTC math is safe for a bare date).
export function nextDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function aggregateBody(metricId, startDate, endDate, measurements, timezone = 'UTC', startOffset = '+00:00', endOffset = '+00:00') {
  return JSON.stringify({
    data: {
      type: 'metric-aggregate',
      attributes: {
        metric_id: metricId,
        interval: 'day',
        measurements,
        // Exclusive next-day-midnight upper bound includes the whole final day and
        // matches the campaign/flow report window (which is inclusive of endDate).
        filter: `greater-or-equal(datetime,${startDate}T00:00:00${startOffset}),less-than(datetime,${nextDay(endDate)}T00:00:00${endOffset})`,
        timezone,
        page_size: 500,
      },
    },
  });
}

// Return the UTC offset (e.g. "-05:00") for an IANA timezone on a given YYYY-MM-DD.
// Computed numerically so it's robust to DST and engine formatting differences.
export function tzOffset(timeZone, dateStr) {
  if (!timeZone || timeZone === 'UTC') return '+00:00';
  try {
    const instant = new Date(`${dateStr}T12:00:00Z`);
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(instant).reduce((acc, x) => (acc[x.type] = x.value, acc), {});
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    const diffMin = Math.round((asUTC - instant.getTime()) / 60000);
    const sign = diffMin >= 0 ? '+' : '-';
    const abs = Math.abs(diffMin);
    return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  } catch {
    return '+00:00';
  }
}

export function extractResults(report) {
  const results = report?.data?.attributes?.results;
  if (Array.isArray(results)) return results;
  if (Array.isArray(report?.data)) return report.data;
  return [];
}

async function getFlowNames(klaviyoKey) {
  const names = {};
  let errMsg = null;
  try {
    let url = '/flows/?page[size]=50';
    while (url) {
      const res = await kFetch(url, klaviyoKey);
      for (const f of (res.data ?? [])) {
        names[f.id] = f.attributes?.name ?? f.id;
      }
      const next = res.links?.next ?? null;
      url = next ? next.replace(KLAVIYO_BASE, '') : null;
    }
  } catch (e) {
    errMsg = e.message;
  }
  return { names, errMsg };
}

async function getCampaignNames(klaviyoKey) {
  const names = {};
  let errMsg = null;
  try {
    let url = "/campaigns/?filter=equals(messages.channel,'email')";
    while (url) {
      const res = await kFetch(url, klaviyoKey);
      for (const c of (res.data ?? [])) {
        names[c.id] = c.attributes?.name ?? c.id;
      }
      const next = res.links?.next ?? null;
      url = next ? next.replace(KLAVIYO_BASE, '') : null;
    }
  } catch (e) {
    errMsg = e.message;
  }
  return { names, errMsg };
}

export function processAggregate(agg, measurement = 'count') {
  try {
    const attrs = agg?.data?.attributes;
    if (!attrs) return null;

    if (Array.isArray(attrs.results) && attrs.results.length > 0) {
      const r = attrs.results[0];
      const dates = r.dates;
      const raw = r.measurements?.[measurement] ?? r.data?.[measurement];
      if (!dates?.length || !raw?.length) return null;
      const counts = raw.map(v => Array.isArray(v) ? Number(v[0] ?? 0) : Number(v ?? 0));
      // Parallel arrays are plotted label-against-value; a length mismatch (malformed
      // payload) would silently shift every count onto the wrong day, so treat it as
      // unavailable rather than emit a wrong-date chart.
      if (dates.length !== counts.length) return null;
      return { dates: dates.map(d => d.slice(0, 10)), counts };
    }

    const dates = attrs.dates;
    let raw;
    if (Array.isArray(attrs.data)) {
      if (attrs.data[0]?.measurements) {
        raw = attrs.data[0].measurements[measurement];
      } else {
        const idx = ['count', 'sum_value', 'unique'].indexOf(measurement);
        raw = attrs.data[idx >= 0 ? idx : 0];
      }
    } else {
      raw = attrs.data?.[measurement];
    }
    if (!dates?.length || !raw?.length) return null;
    const counts = raw.map(v => Array.isArray(v) ? Number(v[0] ?? 0) : Number(v ?? 0));
    if (dates.length !== counts.length) return null;
    return { dates: dates.map(d => d.slice(0, 10)), counts };
  } catch {
    return null;
  }
}

// Pick the metric that best matches a set of names. An exact canonical-name
// match always wins over a fuzzy substring match, so a duplicate or custom-named
// metric (e.g. "Placed Order (Test)") can't shadow the real "Placed Order".
export function pickMetric(metricList = [], { exact = [], includes = [], exclude = [] }) {
  const nameOf = m => (m.attributes?.name ?? '').toLowerCase();
  const exactLower = exact.map(s => s.toLowerCase());
  const exactMatch = metricList.find(m => exactLower.includes(nameOf(m)));
  if (exactMatch) return exactMatch;
  return metricList.find(m => {
    const n = nameOf(m);
    return includes.some(s => n.includes(s)) && !exclude.some(s => n.includes(s));
  }) ?? null;
}

// How many metrics match the fuzzy criteria — used to warn the operator when the
// choice was ambiguous.
export function countMetricMatches(metricList = [], { includes = [], exclude = [] }) {
  return metricList.filter(m => {
    const n = (m.attributes?.name ?? '').toLowerCase();
    return includes.some(s => n.includes(s)) && !exclude.some(s => n.includes(s));
  }).length;
}

// This is an email performance report, but Klaviyo's campaign-values-report returns
// every channel (email, SMS, push). Drop any row explicitly tagged as a non-email
// channel so SMS/push recipients and revenue don't inflate the email figures. A
// missing/blank channel is treated as email to avoid dropping legitimate rows.
export function isEmailChannel(sendChannel) {
  return !sendChannel || sendChannel === 'email';
}

export function normaliseCampaigns(report, campaignNames = {}) {
  return extractResults(report).filter(row => isEmailChannel(row.groupings?.send_channel)).map(row => {
    const g = row.groupings ?? {};
    const s = row.statistics ?? {};
    const id = g.campaign_id ?? null;
    return {
      campaign_id:      id,
      campaign_name:    campaignNames[id] ?? g.campaign_name ?? id ?? 'Unknown',
      send_channel:     g.send_channel ?? null,
      recipients:       Number(s.recipients      ?? 0),
      delivered:        Number(s.delivered        ?? 0),
      open_rate:        Number(s.open_rate        ?? 0),
      click_rate:       Number(s.click_rate       ?? 0),
      conversions:      Number(s.conversions      ?? 0),
      conversion_rate:  Number(s.conversion_rate  ?? 0),
      conversion_value: Number(s.conversion_value ?? 0),
    };
  });
}

export function aggregateFlowRows(report, flowNames = {}) {
  const rows = extractResults(report);
  const byFlow = {};

  for (const row of rows) {
    const g = row.groupings ?? {};
    const s = row.statistics ?? {};
    if (!isEmailChannel(g.send_channel)) continue; // email report — exclude SMS/push flow messages
    const flowId   = g.flow_id ?? 'unknown';
    const flowName = flowNames[flowId] ?? g.flow_name ?? g.flow_message_name ?? flowId;

    if (!byFlow[flowId]) {
      byFlow[flowId] = {
        id: flowId, name: flowName,
        send_channel: g.send_channel ?? null,
        recipients: 0, delivered: 0,
        opens: 0, clicks: 0,
        conversions: 0, conversion_value: 0,
      };
    }

    const f = byFlow[flowId];
    // Klaviyo's open_rate/click_rate denominator is `delivered` (bounces excluded),
    // so reconstruct absolute opens/clicks against delivered — multiplying by
    // recipients would overstate them whenever a message bounced.
    const d = Number(s.delivered ?? 0);
    f.recipients       += Number(s.recipients ?? 0);
    f.delivered        += d;
    f.opens            += Math.round(Number(s.open_rate  ?? 0) * d);
    f.clicks           += Math.round(Number(s.click_rate ?? 0) * d);
    f.conversions      += Number(s.conversions      ?? 0);
    f.conversion_value += Number(s.conversion_value ?? 0);
  }

  return Object.values(byFlow).map(f => ({
    ...f,
    open_rate:       f.delivered  > 0 ? f.opens  / f.delivered : 0,
    click_rate:      f.delivered  > 0 ? f.clicks / f.delivered : 0,
    ctor:            f.opens      > 0 ? f.clicks / f.opens      : 0,
    conversion_rate: f.recipients > 0 ? f.conversions      / f.recipients : 0,
    rpr:             f.recipients > 0 ? f.conversion_value / f.recipients : 0,
  }));
}

// ── Auth helpers ─────────────────────────────────────────────────────────────

export async function pbkdf2Hash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMat = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, keyMat, 256);
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return `pbkdf2:${saltB64}:${hashB64}`;
}

export async function pbkdf2Verify(password, stored) {
  const parts = stored.split(':');
  if (parts[0] !== 'pbkdf2') return false;
  const [, saltB64, hashB64] = parts;
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const keyMat = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, keyMat, 256);
  const derived = btoa(String.fromCharCode(...new Uint8Array(bits)));
  if (derived.length !== hashB64.length) return false;
  let diff = 0;
  for (let i = 0; i < derived.length; i++) diff |= derived.charCodeAt(i) ^ hashB64.charCodeAt(i);
  return diff === 0;
}

function toB64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf instanceof ArrayBuffer ? buf : buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function makeToken(username, isAdmin, secret) {
  const payload = btoa(JSON.stringify({ sub: username, admin: isAdmin, exp: Date.now() + 7 * 24 * 3600 * 1000 }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const sig = toB64url(new Uint8Array(sigBuf));
  return `${payload}.${sig}`;
}

export async function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigBytes = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payload));
    if (!valid) return null;
    const data = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}

function getBearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
}

// Require a valid session. Returns a Response (503/401/403) to short-circuit when
// auth is missing/invalid, or null when the caller holds a valid session.
// Fails CLOSED: if TOKEN_SECRET is unset, every protected route is denied.
async function requireSession(request, env, origin, { admin = false } = {}) {
  const json = (obj, status) => new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });
  if (!env.TOKEN_SECRET) return json({ error: 'Auth not configured (TOKEN_SECRET missing).' }, 503);
  const session = await verifyToken(getBearerToken(request), env.TOKEN_SECRET);
  if (!session) return json({ error: 'Unauthorised' }, 401);
  if (admin && !session.admin) return json({ error: 'Forbidden' }, 403);
  return null;
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request.headers.get('Origin'), env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    try {
      return await handleRequest(request, env, origin);
    } catch (err) {
      console.error('Unhandled worker error:', err);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }
  },
};

async function handleRequest(request, env, origin) {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    // ── POST /?action=register ────────────────────────────────────────────────
    // Not exposed in the UI (access is Google SSO + admin login). Gated behind an
    // admin session so it can't be used for anonymous/unbounded account creation.
    if (request.method === 'POST' && action === 'register') {
      const regAuthFail = await requireSession(request, env, origin, { admin: true });
      if (regAuthFail) return regAuthFail;
      let body;
      try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      const { username, password } = body;
      if (!username || !password || username.length < 3 || password.length < 8) {
        return new Response(JSON.stringify({ error: 'Username (min 3 chars) and password (min 8 chars) required.' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      if (!env.USERS) {
        return new Response(JSON.stringify({ error: 'User store not configured.' }), { status: 503, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      const existing = await env.USERS.get('user_' + username.toLowerCase());
      if (existing) {
        return new Response(JSON.stringify({ error: 'Username already taken.' }), { status: 409, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      const passwordHash = await pbkdf2Hash(password);
      const user = { username: username.toLowerCase(), passwordHash, approved: false, createdAt: new Date().toISOString() };
      await env.USERS.put('user_' + username.toLowerCase(), JSON.stringify(user));
      return new Response(JSON.stringify({ registered: true }), { headers: { 'Content-Type': 'application/json', ...cors(origin) } });
    }

    // ── POST /?action=login ───────────────────────────────────────────────────
    if (request.method === 'POST' && action === 'login') {
      if (!env.TOKEN_SECRET) {
        return new Response(JSON.stringify({ error: 'Auth not configured (TOKEN_SECRET missing).' }), { status: 503, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      let body;
      try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      const { username, password } = body;
      if (!username || !password) {
        return new Response(JSON.stringify({ error: 'Username and password required.' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      const workerUrl = new URL(request.url).origin;

      // Check admin credentials first
      if (env.ADMIN_USERNAME && env.ADMIN_PASSWORD &&
          username.toLowerCase() === env.ADMIN_USERNAME.toLowerCase() &&
          password === env.ADMIN_PASSWORD) {
        const token = await makeToken(username.toLowerCase(), true, env.TOKEN_SECRET);
        return new Response(JSON.stringify({ token, username: username.toLowerCase(), admin: true, workerUrl }), { headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      if (!env.USERS) {
        return new Response(JSON.stringify({ error: 'Invalid credentials.' }), { status: 401, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      const raw = await env.USERS.get('user_' + username.toLowerCase());
      if (!raw) {
        // Run a dummy hash to prevent timing attacks
        await pbkdf2Hash('dummy_password_to_prevent_timing_attacks');
        return new Response(JSON.stringify({ error: 'Invalid credentials.' }), { status: 401, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      const user = JSON.parse(raw);
      const ok = await pbkdf2Verify(password, user.passwordHash);
      if (!ok) {
        return new Response(JSON.stringify({ error: 'Invalid credentials.' }), { status: 401, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      if (!user.approved) {
        return new Response(JSON.stringify({ error: 'pending' }), { status: 403, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      const token = await makeToken(user.username, false, env.TOKEN_SECRET);
      return new Response(JSON.stringify({ token, username: user.username, admin: false, workerUrl }), { headers: { 'Content-Type': 'application/json', ...cors(origin) } });
    }

    // ── POST /?action=login-google ────────────────────────────────────────────
    if (request.method === 'POST' && action === 'login-google') {
      if (!env.TOKEN_SECRET) {
        return new Response(JSON.stringify({ error: 'Auth not configured.' }), { status: 503, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      let body;
      try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      const { credential } = body;
      if (!credential) {
        return new Response(JSON.stringify({ error: 'Missing credential' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      let tokenInfo;
      try {
        const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
        tokenInfo = await r.json();
        if (!r.ok || tokenInfo.error_description) {
          return new Response(JSON.stringify({ error: 'Invalid Google token' }), { status: 401, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
        }
      } catch {
        return new Response(JSON.stringify({ error: 'Could not verify token with Google' }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      const expectedAud = env.GOOGLE_CLIENT_ID || '603699639407-kufvngv1tcjbr38bp2bi7i7f21o3rvbb.apps.googleusercontent.com';
      if (tokenInfo.aud !== expectedAud) {
        return new Response(JSON.stringify({ error: 'Token not issued for this application' }), { status: 401, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      const emailVerified = tokenInfo.email_verified === true || tokenInfo.email_verified === 'true';
      const email = (tokenInfo.email || '').toLowerCase();
      if (!emailVerified || !email.endsWith('@swankyagency.com')) {
        return new Response(JSON.stringify({ error: 'Access restricted to verified @swankyagency.com accounts' }), { status: 403, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      if (!env.USERS) {
        return new Response(JSON.stringify({ error: 'User store not configured.' }), { status: 503, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      const userKey = 'user_' + email;
      const existing = await env.USERS.get(userKey);
      let user;
      if (!existing) {
        // First sign-in creates a PENDING account that an admin must approve.
        // (Deleting a user therefore revokes access: their next sign-in lands
        // back in the pending queue rather than silently re-provisioning.)
        user = { username: email, approved: false, createdAt: new Date().toISOString(), authMethod: 'google' };
        await env.USERS.put(userKey, JSON.stringify(user));
      } else {
        user = JSON.parse(existing);
      }
      if (!user.approved) {
        return new Response(JSON.stringify({ error: 'pending' }), { status: 403, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      const workerUrl = new URL(request.url).origin;
      const token = await makeToken(email, false, env.TOKEN_SECRET);
      return new Response(JSON.stringify({ token, username: email, admin: false, workerUrl }), { headers: { 'Content-Type': 'application/json', ...cors(origin) } });
    }

    // ── POST /?action=anthropic — authenticated proxy to the Anthropic API ────
    // Keeps SHARED_ANTHROPIC_KEY server-side; the browser sends a session token
    // and the prompt, and never sees the key.
    if (request.method === 'POST' && action === 'anthropic') {
      const authFail = await requireSession(request, env, origin);
      if (authFail) return authFail;
      if (!env.SHARED_ANTHROPIC_KEY) {
        return new Response(JSON.stringify({ error: 'Anthropic key not configured on the worker.' }), {
          status: 503, headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }
      let payload;
      try { payload = await request.json(); }
      catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.SHARED_ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      // Stream the response straight back: text/event-stream for stream:true, JSON otherwise.
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
          ...cors(origin),
        },
      });
    }

    // ── GET /?action=admin-users ──────────────────────────────────────────────
    if (request.method === 'GET' && action === 'admin-users') {
      const session = await verifyToken(getBearerToken(request), env.TOKEN_SECRET);
      if (!session?.admin) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      if (!env.USERS) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      const list = await env.USERS.list({ prefix: 'user_' });
      const users = await Promise.all(list.keys.map(async k => {
        const raw = await env.USERS.get(k.name);
        if (!raw) return null;
        const u = JSON.parse(raw);
        return { username: u.username, approved: u.approved, createdAt: u.createdAt };
      }));
      return new Response(JSON.stringify(users.filter(Boolean)), { headers: { 'Content-Type': 'application/json', ...cors(origin) } });
    }

    // ── POST /?action=admin-approve ───────────────────────────────────────────
    if (request.method === 'POST' && action === 'admin-approve') {
      const session = await verifyToken(getBearerToken(request), env.TOKEN_SECRET);
      if (!session?.admin) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      let body;
      try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      const { username } = body;
      if (!username || !env.USERS) {
        return new Response(JSON.stringify({ error: 'username required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      const raw = await env.USERS.get('user_' + username.toLowerCase());
      if (!raw) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      const user = JSON.parse(raw);
      user.approved = true;
      await env.USERS.put('user_' + username.toLowerCase(), JSON.stringify(user));
      return new Response(JSON.stringify({ approved: true }), { headers: { 'Content-Type': 'application/json', ...cors(origin) } });
    }

    // ── POST /?action=admin-delete ────────────────────────────────────────────
    if (request.method === 'POST' && action === 'admin-delete') {
      const session = await verifyToken(getBearerToken(request), env.TOKEN_SECRET);
      if (!session?.admin) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      let body;
      try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      const { username } = body;
      if (!username || !env.USERS) {
        return new Response(JSON.stringify({ error: 'username required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
      await env.USERS.delete('user_' + username.toLowerCase());
      return new Response(JSON.stringify({ deleted: true }), { headers: { 'Content-Type': 'application/json', ...cors(origin) } });
    }

    // ── POST /?action=add-client — add a new client via UI ──────────────────
    if (request.method === 'POST' && action === 'add-client') {
      const authFail = await requireSession(request, env, origin, { admin: true });
      if (authFail) return authFail;
      if (!env.CLIENTS_KV) {
        return new Response(JSON.stringify({ error: 'KV namespace not configured. Follow the setup guide to enable client management.' }), {
          status: 503, headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }

      let body;
      try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }

      const { name, klaviyoKey } = body;

      if (!name || !klaviyoKey) {
        return new Response(JSON.stringify({ error: 'name and klaviyoKey are required.' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }

      // Validate the Klaviyo key actually works
      try {
        await kFetch('/accounts/', klaviyoKey);
      } catch (e) {
        return new Response(JSON.stringify({ error: `Klaviyo key validation failed: ${e.message}` }), {
          status: 422, headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }

      // Build a unique ID, avoiding collisions with existing clients
      const existing = await readClients(env);
      const existingIds = new Set(existing.map(c => c.id));
      let id = slugify(name);
      if (existingIds.has(id)) {
        let n = 2;
        while (existingIds.has(`${id}_${n}`)) n++;
        id = `${id}_${n}`;
      }

      // Check if client already exists (by name) — update key if so
      const existingKv = JSON.parse(await env.CLIENTS_KV.get('clients') || '[]');
      const nameMatch = existingKv.find(c => c.name.toLowerCase() === name.toLowerCase());
      if (nameMatch) {
        // Just update the key for this client
        await env.CLIENTS_KV.put('key_' + nameMatch.id, klaviyoKey);
        return new Response(JSON.stringify({ updated: true, client: nameMatch, clients: existing }), {
          headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }

      const newClient = { id, name, createdAt: new Date().toISOString() };
      const updatedKv = [...existingKv, newClient];
      await Promise.all([
        env.CLIENTS_KV.put('clients', JSON.stringify(updatedKv)),
        env.CLIENTS_KV.put('key_' + id, klaviyoKey),
      ]);

      const allClients = await readClients(env);
      return new Response(JSON.stringify({ created: true, client: newClient, clients: allClients }), {
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }

    // ── POST /?action=offboard-client {clientId} — remove a departed client ────
    // Admin-only, destructive: deletes the client's Klaviyo key, its entry in the
    // client list, and every saved report (+ reproducibility snapshot) for it.
    if (request.method === 'POST' && action === 'offboard-client') {
      const authFail = await requireSession(request, env, origin, { admin: true });
      if (authFail) return authFail;
      if (!env.CLIENTS_KV) {
        return new Response(JSON.stringify({ error: 'KV namespace not configured.' }), {
          status: 503, headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }
      let body; try { body = await request.json(); } catch { body = {}; }
      const { clientId } = body;
      if (!clientId) {
        return new Response(JSON.stringify({ error: 'clientId is required.' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }
      // Remove the Klaviyo key and the client-list entry.
      const existingKv = JSON.parse(await env.CLIENTS_KV.get('clients') || '[]');
      const updatedKv = existingKv.filter(c => c.id !== clientId);
      await Promise.all([
        env.CLIENTS_KV.delete('key_' + clientId),
        env.CLIENTS_KV.put('clients', JSON.stringify(updatedKv)),
      ]);
      // Delete every saved report (and its snapshot) belonging to this client.
      let reportsRemoved = 0;
      const list = await env.CLIENTS_KV.list({ prefix: 'report_' });
      const toDelete = list.keys.filter(k => k.metadata?.clientId === clientId);
      for (const k of toDelete) {
        await Promise.all([
          env.CLIENTS_KV.delete(k.name),
          env.CLIENTS_KV.delete(`reportdata_${k.name}`),
        ]);
        reportsRemoved++;
      }
      const allClients = await readClients(env);
      return new Response(JSON.stringify({ offboarded: true, clientId, reportsRemoved, clients: allClients }), {
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }

    // POST /?action=save-report — persist a generated report to KV ────────────
    if (request.method === 'POST' && action === 'save-report') {
      const authFail = await requireSession(request, env, origin);
      if (authFail) return authFail;
      if (!env.CLIENTS_KV) {
        return new Response(JSON.stringify({ error: 'KV not configured' }), {
          status: 503, headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }
      let body;
      try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }
      const { html, metadata, inputData } = body;
      if (!html || !metadata?.clientId) {
        return new Response(JSON.stringify({ error: 'html and metadata.clientId are required' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }
      // Guard against a pathologically large report quietly bloating KV.
      if (typeof html !== 'string' || html.length > 2_000_000) {
        return new Response(JSON.stringify({ error: 'Report is too large to save.' }), {
          status: 413, headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }
      // Stamp the report with the verified session user (audit trail) — trust the
      // signed token, not a client-supplied field.
      const saveSession = await verifyToken(getBearerToken(request), env.TOKEN_SECRET);
      // Random suffix so two reports for the same client in the same millisecond
      // can't collide on the key.
      const ts = String(Date.now()).padStart(16, '0');
      const key = `report_${ts}_${crypto.randomUUID().slice(0, 8)}_${metadata.clientId}`;
      const kvMeta = {
        generatedAt: metadata.generatedAt || new Date().toISOString(),
        generatedBy: (saveSession?.sub || '').slice(0, 80),
        clientId:    metadata.clientId,
        reportType:  metadata.reportType  || '',
        dateStart:   metadata.dateStart   || '',
        dateEnd:     metadata.dateEnd     || '',
        accountName: (metadata.accountName || '').slice(0, 100),
        // Which version of the report prompt produced this report (audit trail).
        promptVersion: metadata.promptVersion != null ? String(metadata.promptVersion).slice(0, 16) : '',
        warnings:    trimReportWarnings(metadata.warnings),
      };
      try {
        await env.CLIENTS_KV.put(key, html, { metadata: kvMeta });
      } catch {
        // KV metadata exceeds its 1024-byte cap — drop the warnings (still in the
        // report HTML) rather than fail the whole save.
        delete kvMeta.warnings;
        await env.CLIENTS_KV.put(key, html, { metadata: kvMeta });
      }
      // Reproducibility: persist the exact Klaviyo inputs that produced this report
      // (separate key, fetched on demand) so a disputed number can be reconstructed.
      if (inputData) {
        const snapshot = JSON.stringify(inputData);
        if (snapshot.length <= 2_000_000) {
          await env.CLIENTS_KV.put(`reportdata_${key}`, snapshot).catch(() => {});
        }
      }
      return new Response(JSON.stringify({ saved: true, key }), {
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }

    // GET /?action=list-reports — list saved reports (metadata only) ──────────
    if (request.method === 'GET' && action === 'list-reports') {
      const authFail = await requireSession(request, env, origin);
      if (authFail) return authFail;
      if (!env.CLIENTS_KV) {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }
      const list = await env.CLIENTS_KV.list({ prefix: 'report_', limit: 200 });
      const entries = list.keys
        .map(k => ({ key: k.name, ...k.metadata }))
        .sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
      return new Response(JSON.stringify(entries), {
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }

    // POST /?action=delete-report&key=<key> — delete a saved report from KV ───
    if (request.method === 'POST' && action === 'delete-report') {
      const authFail = await requireSession(request, env, origin);
      if (authFail) return authFail;
      const key = url.searchParams.get('key');
      if (!key || !env.CLIENTS_KV) {
        return new Response(JSON.stringify({ error: 'key required and KV must be configured' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }
      await Promise.all([
        env.CLIENTS_KV.delete(key),
        env.CLIENTS_KV.delete(`reportdata_${key}`), // also drop the reproducibility snapshot
      ]);
      return new Response(JSON.stringify({ deleted: true, key }), {
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }

    // GET /?action=get-report-data&key=<key> — the saved Klaviyo inputs (for audit)
    if (request.method === 'GET' && action === 'get-report-data') {
      const authFail = await requireSession(request, env, origin);
      if (authFail) return authFail;
      const key = url.searchParams.get('key');
      if (!key || !env.CLIENTS_KV) {
        return new Response(JSON.stringify({ error: 'key required and KV must be configured' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }
      const snapshot = await env.CLIENTS_KV.get(`reportdata_${key}`);
      if (snapshot === null) {
        return new Response(JSON.stringify({ error: 'No saved source data for this report' }), {
          status: 404, headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }
      return new Response(snapshot, { headers: { 'Content-Type': 'application/json', ...cors(origin) } });
    }

    // GET /?action=get-report&key=<key> — fetch full HTML for a saved report ──
    if (request.method === 'GET' && action === 'get-report') {
      const authFail = await requireSession(request, env, origin);
      if (authFail) return authFail;
      const key = url.searchParams.get('key');
      if (!key || !env.CLIENTS_KV) {
        return new Response(JSON.stringify({ error: 'key required and KV must be configured' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }
      const { value, metadata } = await env.CLIENTS_KV.getWithMetadata(key, 'text');
      if (value === null) {
        return new Response(JSON.stringify({ error: 'Report not found' }), {
          status: 404, headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }
      return new Response(JSON.stringify({ html: value, metadata }), {
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }

    // GET /?action=spend-status — this month's Anthropic spend vs the cap ────────
    if (request.method === 'GET' && action === 'spend-status') {
      const authFail = await requireSession(request, env, origin);
      if (authFail) return authFail;
      const capUsd = Number(env.SPEND_CAP_USD) > 0 ? Number(env.SPEND_CAP_USD) : 100;
      const monthKey = spendMonthKey();
      const spentUsd = env.CLIENTS_KV ? Number(await env.CLIENTS_KV.get(monthKey)) || 0 : 0;
      return new Response(JSON.stringify({
        month: monthKey.replace('spend_', ''),
        spentUsd: Math.round(spentUsd * 100) / 100,
        capUsd,
        ratio: capUsd > 0 ? spentUsd / capUsd : 0,
      }), { headers: { 'Content-Type': 'application/json', ...cors(origin) } });
    }

    // POST /?action=track-spend {costUsd} — add a report's cost to the month total ─
    if (request.method === 'POST' && action === 'track-spend') {
      const authFail = await requireSession(request, env, origin);
      if (authFail) return authFail;
      let body; try { body = await request.json(); } catch { body = {}; }
      if (env.CLIENTS_KV) {
        const monthKey = spendMonthKey();
        const current = Number(await env.CLIENTS_KV.get(monthKey)) || 0;
        const updated = addSpend(current, body.costUsd);
        await env.CLIENTS_KV.put(monthKey, String(updated));
        return new Response(JSON.stringify({ spentUsd: updated }), {
          headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }
      return new Response(JSON.stringify({ spentUsd: 0 }), {
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }

    // GET /?debug — diagnostic check
    if (request.method === 'GET' && url.searchParams.has('debug')) {
      const debugAuthFail = await requireSession(request, env, origin, { admin: true });
      if (debugAuthFail) return debugAuthFail;
      const clients = await readClients(env);
      const keyStatus = await Promise.all(clients.map(async c => ({
        id: c.id,
        name: c.name,
        keyInKv: env.CLIENTS_KV ? !!(await env.CLIENTS_KV.get('key_' + c.id)) : false,
        keyInSecrets: !!env[`KLAVIYO_KEY_${c.id}`],
      })));

      // Test USERS KV binding with a write + read + delete
      let usersKvTest = 'not bound';
      if (env.USERS) {
        try {
          const testKey = '__diag_test__';
          await env.USERS.put(testKey, 'ok');
          const val = await env.USERS.get(testKey);
          await env.USERS.delete(testKey);
          usersKvTest = val === 'ok' ? 'write+read+delete OK' : `read mismatch: ${val}`;
        } catch (e) {
          usersKvTest = `error: ${e.message}`;
        }
      }

      // Count registered users
      let userCount = 0;
      let pendingCount = 0;
      if (env.USERS) {
        try {
          const list = await env.USERS.list({ prefix: 'user_' });
          userCount = list.keys.length;
          const users = await Promise.all(list.keys.map(async k => {
            const raw = await env.USERS.get(k.name);
            return raw ? JSON.parse(raw) : null;
          }));
          pendingCount = users.filter(u => u && !u.approved).length;
        } catch {}
      }

      return new Response(JSON.stringify({
        kvAvailable: !!env.CLIENTS_KV,
        CLIENTS_JSON_set: !!env.CLIENTS_JSON,
        TOKEN_SECRET_set: !!env.TOKEN_SECRET,
        USERS_bound: !!env.USERS,
        usersKvTest,
        userCount,
        pendingCount,
        clients: keyStatus,
      }, null, 2), {
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }

    // GET / — return client list (requires a valid session; the client roster is confidential)
    if (request.method === 'GET') {
      const listAuthFail = await requireSession(request, env, origin);
      if (listAuthFail) return listAuthFail;
      const clients = await readClients(env);
      return new Response(JSON.stringify(clients), {
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405, headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }

    // Require valid session token for data access (fails closed if TOKEN_SECRET is unset)
    const dataAuthFail = await requireSession(request, env, origin);
    if (dataAuthFail) return dataAuthFail;

    let body;
    try { body = await request.json(); }
    catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }

    const { clientId, startDate, endDate, comparisonStart, comparisonEnd } = body;
    if (!clientId || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: 'Required: clientId, startDate, endDate' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }
    const dateError = validateDateRange({ startDate, endDate, comparisonStart, comparisonEnd });
    if (dateError) {
      return new Response(JSON.stringify({ error: dateError }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }

    const klaviyoKey = await readKlaviyoKey(env, clientId);
    if (!klaviyoKey) {
      return new Response(JSON.stringify({ error: `No Klaviyo key configured for client: ${clientId}` }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }

    try {
      const [accounts, metrics, flowResult, campaignResult] = await Promise.all([
        kFetch('/accounts/', klaviyoKey),
        kFetch('/metrics/', klaviyoKey),
        getFlowNames(klaviyoKey),
        getCampaignNames(klaviyoKey),
      ]);

      const flowNames     = flowResult.names;
      const campaignNames = campaignResult.names;
      const metricList    = metrics.data ?? [];

      // Use the client's Klaviyo account timezone for day boundaries + bucketing,
      // so daily charts line up with what they see in their own dashboard.
      const accountTimezone = accounts.data?.[0]?.attributes?.timezone || 'UTC';
      const startOffset = tzOffset(accountTimezone, startDate);
      const endOffset   = tzOffset(accountTimezone, endDate);

      const ORDER_MATCH = { exact: ['placed order'], includes: ['placed order', 'place order'] };
      const SUBSCRIBE_MATCH = {
        exact: ['subscribed to list'],
        includes: ['subscribed to list', 'subscribe to list', 'added to list', 'joined list'],
        exclude: ['back in stock', 'sms'],
      };
      const UNSUBSCRIBE_MATCH = {
        exact: ['unsubscribed from list'],
        includes: ['unsubscribed from list', 'unsubscribed from email', 'removed from list', 'unsubscribed'],
        exclude: ['sms'],
      };

      const conversionMetric   = pickMetric(metricList, ORDER_MATCH);
      const subscribedMetric   = pickMetric(metricList, SUBSCRIBE_MATCH);
      const unsubscribedMetric = pickMetric(metricList, UNSUBSCRIBE_MATCH);

      const conversionMetricId   = conversionMetric?.id   ?? null;
      const subscribedMetricId   = subscribedMetric?.id   ?? null;
      const unsubscribedMetricId = unsubscribedMetric?.id ?? null;

      const safeAgg = (metricId, measurements, start = startDate, end = endDate, sOff = startOffset, eOff = endOffset) =>
        metricId
          ? kFetch('/metric-aggregates/', klaviyoKey, {
              method: 'POST',
              body: aggregateBody(metricId, start, end, measurements, accountTimezone, sOff, eOff),
            }).catch(e => ({ _error: e.message }))
          : Promise.resolve(null);

      const [campaignReport, flowReport, orderAgg, subscriberAgg, unsubAgg] = await Promise.all([
        kFetch('/campaign-values-reports/', klaviyoKey, {
          method: 'POST', body: reportBody('campaign-values-report', startDate, endDate, conversionMetricId, startOffset, endOffset),
        }),
        kFetch('/flow-values-reports/', klaviyoKey, {
          method: 'POST', body: reportBody('flow-values-report', startDate, endDate, conversionMetricId, startOffset, endOffset),
        }),
        safeAgg(conversionMetricId,   ['count', 'sum_value']),
        safeAgg(subscribedMetricId,   ['count']),
        safeAgg(unsubscribedMetricId, ['count']),
      ]);

      let comparison = null;
      let comparisonHadError = false;
      if (comparisonStart && comparisonEnd) {
        const compStartOffset = tzOffset(accountTimezone, comparisonStart);
        const compEndOffset   = tzOffset(accountTimezone, comparisonEnd);
        const [compCampaigns, compFlows, compSubAgg, compUnsubAgg, compOrderAgg] = await Promise.all([
          kFetch('/campaign-values-reports/', klaviyoKey, {
            method: 'POST', body: reportBody('campaign-values-report', comparisonStart, comparisonEnd, conversionMetricId, compStartOffset, compEndOffset),
          }),
          kFetch('/flow-values-reports/', klaviyoKey, {
            method: 'POST', body: reportBody('flow-values-report', comparisonStart, comparisonEnd, conversionMetricId, compStartOffset, compEndOffset),
          }),
          safeAgg(subscribedMetricId,   ['count'], comparisonStart, comparisonEnd, compStartOffset, compEndOffset),
          safeAgg(unsubscribedMetricId, ['count'], comparisonStart, comparisonEnd, compStartOffset, compEndOffset),
          safeAgg(conversionMetricId,   ['count', 'sum_value'], comparisonStart, comparisonEnd, compStartOffset, compEndOffset),
        ]);
        if (compOrderAgg?._error || compSubAgg?._error || compUnsubAgg?._error) comparisonHadError = true;
        comparison = {
          campaigns:  normaliseCampaigns(compCampaigns, campaignNames),
          flows:      aggregateFlowRows(compFlows, flowNames),
          aggregates: {
            orders:       processAggregate(compOrderAgg, 'count'),
            subscribers:  processAggregate(compSubAgg,   'count'),
            unsubscribes: processAggregate(compUnsubAgg, 'count'),
          },
        };
      }

      // Human-readable warnings so the UI can flag incomplete data instead of
      // silently dropping sections. A failed fetch is distinct from a genuine zero.
      const warnings = [];
      if (!conversionMetricId) {
        warnings.push('No "Placed Order" metric was found in this Klaviyo account, so order volume and revenue figures are unavailable.');
      } else if (orderAgg?._error) {
        warnings.push('Order and revenue data could not be loaded from Klaviyo (a temporary error or a permissions issue) — the order/revenue figures may be incomplete.');
      }
      if (conversionMetric && countMetricMatches(metricList, ORDER_MATCH) > 1) {
        warnings.push(`More than one order metric matched; using "${conversionMetric.attributes?.name}" — double-check this is the right one for revenue.`);
      }
      if (!subscribedMetricId) {
        warnings.push('No list-subscribe metric was found, so new-subscriber (list growth) figures are unavailable.');
      } else if (subscriberAgg?._error) {
        warnings.push('Subscriber (list growth) data could not be loaded from Klaviyo — the new-subscriber figures may be incomplete.');
      }
      if (!unsubscribedMetricId) {
        warnings.push('No list-unsubscribe metric was found, so unsubscribe figures are unavailable.');
      } else if (unsubAgg?._error) {
        warnings.push('Unsubscribe data could not be loaded from Klaviyo — the unsubscribe figures may be incomplete.');
      }
      if (comparisonHadError) {
        warnings.push('Some comparison-period data could not be loaded, so the period-over-period changes may be inaccurate.');
      }
      if (flowResult.errMsg) {
        warnings.push('Flow names could not be loaded, so some flows may appear as IDs rather than names.');
      }
      if (campaignResult.errMsg) {
        warnings.push('Campaign names could not be loaded, so some campaigns may appear as IDs rather than names.');
      }

      return new Response(JSON.stringify({
        account: accounts.data?.[0] ?? null,
        warnings,
        period: {
          campaigns: normaliseCampaigns(campaignReport, campaignNames),
          flows:     aggregateFlowRows(flowReport, flowNames),
        },
        comparison,
        aggregates: {
          orders:       processAggregate(orderAgg,      'count'),
          subscribers:  processAggregate(subscriberAgg, 'count'),
          unsubscribes: processAggregate(unsubAgg,      'count'),
        },
        _meta: {
          conversionMetric:   conversionMetric?.attributes?.name   ?? null,
          subscribedMetric:   subscribedMetric?.attributes?.name   ?? null,
          unsubscribedMetric: unsubscribedMetric?.attributes?.name ?? null,
          flowNamesError:     flowResult.errMsg,
          campaignNamesError: campaignResult.errMsg,
          flowCount:          Object.keys(flowNames).length,
          campaignCount:      Object.keys(campaignNames).length,
          orderAggError:      orderAgg?._error ?? null,
          subscriberAggError: subscriberAgg?._error ?? null,
          unsubAggError:      unsubAgg?._error ?? null,
        },
      }), {
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });

    } catch (err) {
      console.error('Data endpoint error:', err);
      return new Response(JSON.stringify({ error: "Couldn't load this client's data from Klaviyo — please try again. If it persists, check the client's API key permissions." }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }
}
