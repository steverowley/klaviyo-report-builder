// Shared fetch helper for the Cloudflare Worker API. Every endpoint takes the
// same shape — base worker URL, an optional ?action=… (plus extra query
// params), a Bearer session token, and an optional JSON body — so build that
// in one place instead of hand-rolling headers at every call site.

export function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function workerFetch(workerUrl, { action, params = {}, method = "GET", token, body, signal } = {}) {
  const url = new URL(workerUrl);
  if (action) url.searchParams.set("action", action);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return fetch(url, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(token),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(signal ? { signal } : {}),
  });
}
