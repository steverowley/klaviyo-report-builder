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

function slugify(name) {
  return name.toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 32) || ('client_' + Date.now().toString(36));
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
        filter: `greater-or-equal(datetime,${startDate}T00:00:00+00:00),less-than(datetime,${endDate}T23:59:59+00:00)`,
        timezone: 'UTC',
        page_size: 500,
      },
    },
  });
}

function extractResults(report) {
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

function processAggregate(agg, measurement = 'count') {
  try {
    const attrs = agg?.data?.attributes;
    if (!attrs) return null;

    if (Array.isArray(attrs.results) && attrs.results.length > 0) {
      const r = attrs.results[0];
      const dates = r.dates;
      const raw = r.measurements?.[measurement] ?? r.data?.[measurement];
      if (!dates?.length || !raw?.length) return null;
      const counts = raw.map(v => Array.isArray(v) ? Number(v[0] ?? 0) : Number(v ?? 0));
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
    return { dates: dates.map(d => d.slice(0, 10)), counts };
  } catch {
    return null;
  }
}

function normaliseCampaigns(report, campaignNames = {}) {
  return extractResults(report).map(row => {
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

function aggregateFlowRows(report, flowNames = {}) {
  const rows = extractResults(report);
  const byFlow = {};

  for (const row of rows) {
    const g = row.groupings ?? {};
    const s = row.statistics ?? {};
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
    const r = Number(s.recipients ?? 0);
    f.recipients       += r;
    f.delivered        += Number(s.delivered        ?? 0);
    f.opens            += Math.round(Number(s.open_rate  ?? 0) * r);
    f.clicks           += Math.round(Number(s.click_rate ?? 0) * r);
    f.conversions      += Number(s.conversions      ?? 0);
    f.conversion_value += Number(s.conversion_value ?? 0);
  }

  return Object.values(byFlow).map(f => ({
    ...f,
    open_rate:       f.recipients > 0 ? f.opens  / f.recipients : 0,
    click_rate:      f.recipients > 0 ? f.clicks / f.recipients : 0,
    ctor:            f.opens      > 0 ? f.clicks / f.opens      : 0,
    conversion_rate: f.recipients > 0 ? f.conversions      / f.recipients : 0,
    rpr:             f.recipients > 0 ? f.conversion_value / f.recipients : 0,
  }));
}

// ── Auth helpers ─────────────────────────────────────────────────────────────

async function pbkdf2Hash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMat = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, keyMat, 256);
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return `pbkdf2:${saltB64}:${hashB64}`;
}

async function pbkdf2Verify(password, stored) {
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

async function makeToken(username, isAdmin, secret) {
  const payload = btoa(JSON.stringify({ sub: username, admin: isAdmin, exp: Date.now() + 7 * 24 * 3600 * 1000 }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const sig = toB64url(new Uint8Array(sigBuf));
  return `${payload}.${sig}`;
}

async function verifyToken(token, secret) {
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    // ── POST /?action=register ────────────────────────────────────────────────
    if (request.method === 'POST' && action === 'register') {
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
      const sharedAnthropicKey = env.SHARED_ANTHROPIC_KEY || null;

      // Check admin credentials first
      if (env.ADMIN_USERNAME && env.ADMIN_PASSWORD &&
          username.toLowerCase() === env.ADMIN_USERNAME.toLowerCase() &&
          password === env.ADMIN_PASSWORD) {
        const token = await makeToken(username.toLowerCase(), true, env.TOKEN_SECRET);
        return new Response(JSON.stringify({ token, username: username.toLowerCase(), admin: true, workerUrl, anthropicKey: sharedAnthropicKey }), { headers: { 'Content-Type': 'application/json', ...cors(origin) } });
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
      return new Response(JSON.stringify({ token, username: user.username, admin: false, workerUrl, anthropicKey: sharedAnthropicKey }), { headers: { 'Content-Type': 'application/json', ...cors(origin) } });
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

      const { adminPassword, name, klaviyoKey } = body;

      // accept either admin session token OR legacy adminPassword (for backward compat)
      const session = await verifyToken(getBearerToken(request), env.TOKEN_SECRET);
      const hasAdminToken = session?.admin === true;
      const hasLegacyPassword = env.ADMIN_PASSWORD && adminPassword === env.ADMIN_PASSWORD;
      if (!hasAdminToken && !hasLegacyPassword) {
        return new Response(JSON.stringify({ error: 'Invalid admin password.' }), {
          status: 401, headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }

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

    // POST /?action=save-report — persist a generated report to KV ────────────
    if (request.method === 'POST' && action === 'save-report') {
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
      const { html, metadata } = body;
      if (!html || !metadata?.clientId) {
        return new Response(JSON.stringify({ error: 'html and metadata.clientId are required' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }
      const ts = String(Date.now()).padStart(16, '0');
      const key = `report_${ts}_${metadata.clientId}`;
      const kvMeta = {
        generatedAt: metadata.generatedAt || new Date().toISOString(),
        clientId:    metadata.clientId,
        reportType:  metadata.reportType  || '',
        dateStart:   metadata.dateStart   || '',
        dateEnd:     metadata.dateEnd     || '',
        accountName: (metadata.accountName || '').slice(0, 100),
      };
      await env.CLIENTS_KV.put(key, html, { metadata: kvMeta });
      return new Response(JSON.stringify({ saved: true, key }), {
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }

    // GET /?action=list-reports — list saved reports (metadata only) ──────────
    if (request.method === 'GET' && action === 'list-reports') {
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
      const key = url.searchParams.get('key');
      if (!key || !env.CLIENTS_KV) {
        return new Response(JSON.stringify({ error: 'key required and KV must be configured' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) },
        });
      }
      await env.CLIENTS_KV.delete(key);
      return new Response(JSON.stringify({ deleted: true, key }), {
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }

    // GET /?action=get-report&key=<key> — fetch full HTML for a saved report ──
    if (request.method === 'GET' && action === 'get-report') {
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

    // GET /?debug — diagnostic check
    if (request.method === 'GET' && url.searchParams.has('debug')) {
      const clients = await readClients(env);
      const keyStatus = await Promise.all(clients.map(async c => ({
        id: c.id,
        name: c.name,
        keyInKv: env.CLIENTS_KV ? !!(await env.CLIENTS_KV.get('key_' + c.id)) : false,
        keyInSecrets: !!env[`KLAVIYO_KEY_${c.id}`],
      })));
      return new Response(JSON.stringify({
        kvAvailable: !!env.CLIENTS_KV,
        CLIENTS_JSON_set: !!env.CLIENTS_JSON,
        clients: keyStatus,
      }, null, 2), {
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }

    // GET / — return client list
    if (request.method === 'GET') {
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

    // Require valid session token for data access
    if (env.TOKEN_SECRET) {
      const session = await verifyToken(getBearerToken(request), env.TOKEN_SECRET);
      if (!session) {
        return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
      }
    }

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

      const conversionMetric = metricList.find(m => {
        const n = (m.attributes?.name ?? '').toLowerCase();
        return n.includes('placed order') || n.includes('place order');
      });

      const subscribedMetric = metricList.find(m => {
        const n = (m.attributes?.name ?? '').toLowerCase();
        return (n.includes('subscribed to list') || n.includes('subscribe to list') ||
                n.includes('added to list') || n.includes('joined list'))
          && !n.includes('back in stock') && !n.includes('sms');
      });

      const unsubscribedMetric = metricList.find(m => {
        const n = (m.attributes?.name ?? '').toLowerCase();
        return (n.includes('unsubscribed from list') || n.includes('unsubscribed from email') ||
                n.includes('removed from list') ||
                (n.includes('unsubscribed') && !n.includes('sms')));
      });

      const conversionMetricId   = conversionMetric?.id   ?? null;
      const subscribedMetricId   = subscribedMetric?.id   ?? null;
      const unsubscribedMetricId = unsubscribedMetric?.id ?? null;

      const safeAgg = (metricId, measurements, start = startDate, end = endDate) =>
        metricId
          ? kFetch('/metric-aggregates/', klaviyoKey, {
              method: 'POST',
              body: aggregateBody(metricId, start, end, measurements),
            }).catch(e => ({ _error: e.message }))
          : Promise.resolve(null);

      const [campaignReport, flowReport, orderAgg, subscriberAgg, unsubAgg] = await Promise.all([
        kFetch('/campaign-values-reports/', klaviyoKey, {
          method: 'POST', body: reportBody('campaign-values-report', startDate, endDate, conversionMetricId),
        }),
        kFetch('/flow-values-reports/', klaviyoKey, {
          method: 'POST', body: reportBody('flow-values-report', startDate, endDate, conversionMetricId),
        }),
        safeAgg(conversionMetricId,   ['count', 'sum_value']),
        safeAgg(subscribedMetricId,   ['count']),
        safeAgg(unsubscribedMetricId, ['count']),
      ]);

      let comparison = null;
      if (comparisonStart && comparisonEnd) {
        const [compCampaigns, compFlows, compSubAgg, compUnsubAgg, compOrderAgg] = await Promise.all([
          kFetch('/campaign-values-reports/', klaviyoKey, {
            method: 'POST', body: reportBody('campaign-values-report', comparisonStart, comparisonEnd, conversionMetricId),
          }),
          kFetch('/flow-values-reports/', klaviyoKey, {
            method: 'POST', body: reportBody('flow-values-report', comparisonStart, comparisonEnd, conversionMetricId),
          }),
          safeAgg(subscribedMetricId,   ['count'], comparisonStart, comparisonEnd),
          safeAgg(unsubscribedMetricId, ['count'], comparisonStart, comparisonEnd),
          safeAgg(conversionMetricId,   ['count', 'sum_value'], comparisonStart, comparisonEnd),
        ]);
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

      return new Response(JSON.stringify({
        account: accounts.data?.[0] ?? null,
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
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }
  },
};
