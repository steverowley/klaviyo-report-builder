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
