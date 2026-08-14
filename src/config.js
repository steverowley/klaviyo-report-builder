// App configuration.
//
// The Cloudflare Worker proxy URL is a PUBLIC endpoint, not a secret — it's
// already visible in the deployed app's network requests, and the actual
// secrets (Anthropic + Klaviyo keys) live server-side as Worker secrets. Baking
// the URL in guarantees the sign-in screen never has to ask users for it,
// regardless of deploy target (GitHub Pages, Vercel, local dev).
//
// Override order: the VITE_WORKER_URL build-time env var (e.g. the GitHub
// Actions secret) wins when set; otherwise this default is used. Admins can
// still override it at runtime in Settings.
export const DEFAULT_WORKER_URL =
  import.meta.env.VITE_WORKER_URL || "https://klaviyo-proxy.rowley-778.workers.dev";

// Single source of truth for the Worker URL. An admin-set override in Settings
// (localStorage) wins; otherwise the baked-in URL above is used. Always call
// this rather than reading localStorage directly — a missing key must never
// leave a caller without a URL.
export const WORKER_URL_KEY = "swanky_worker_url";

export function getWorkerUrl() {
  return localStorage.getItem(WORKER_URL_KEY) || DEFAULT_WORKER_URL;
}

// Google Sign-In client ID. Public by design (it's visible in the OAuth popup
// URL), but it's tied to a specific Google Cloud project — so a self-hosted
// deploy needs its own, set as the VITE_GOOGLE_CLIENT_ID build-time env var.
// The Worker validates the same ID server-side via its GOOGLE_CLIENT_ID secret;
// the two must match or every Google sign-in is rejected.
export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  "603699639407-kufvngv1tcjbr38bp2bi7i7f21o3rvbb.apps.googleusercontent.com";
