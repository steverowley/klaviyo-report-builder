# Klaviyo Report Builder

A browser-based tool for Agencies that pulls live data from client Klaviyo accounts and uses Claude AI to generate polished, print-ready email marketing performance reports in minutes.

---

## What it does

Klaviyo Report Builder fetches campaign and flow performance data from a client's Klaviyo account, hands it to Claude AI, and produces a fully-formatted HTML report with:

- Revenue, orders, campaigns sent, and subscriber growth at a glance
- Campaign-by-campaign performance table (opens, clicks, revenue)
- Flow performance aggregated by flow (not per individual message)
- List growth and order volume charts
- AI-written narrative insights and next-step recommendations
- Optional comparison against the previous period or same period last year

Reports are rendered instantly in the browser and can be downloaded as standalone HTML files — no server required at report time.

---

## Architecture

Static frontend on GitHub Pages + a Cloudflare Worker as data proxy and auth backend.

```
Browser (React + Vite)
  │
  └─▶  Cloudflare Worker  (your deployment at worker/)
          ├─▶  Klaviyo REST API   (fetch campaign / flow data)
          ├─▶  Anthropic API      (proxied + streamed — key stays server-side)
          │       └─▶  Claude  (generates the report HTML)
          ├─▶  Auth endpoints     (login, Google SSO, user management)
          └─▶  Cloudflare KV      (user accounts + saved reports)
```

**Why a Worker?**
Klaviyo's private API requires a server-side key and does not support browser CORS. The Worker fetches, normalises, and aggregates the raw Klaviyo data, handles all authentication, proxies the Anthropic call so that key also stays server-side, and stores user accounts and saved reports in KV — then returns clean JSON to the browser.

---

## Authentication

The app is gated behind a login screen. Access works as follows:

1. Users **sign in with Google** — any verified Google account can sign in, but the first sign-in only creates a **pending** account. An admin must approve it in the Users panel before it can be used.
2. **Admins** can also sign in with a username and password (the "Admin sign-in" toggle), bootstrapped from the `ADMIN_USERNAME` / `ADMIN_PASSWORD` worker secrets.

No API key setup is required — the user just signs in and the app is fully configured.

Sessions are HMAC-SHA-256 signed tokens with a 7-day expiry, stored in `sessionStorage`.

Admin accounts are bootstrapped from worker secrets (`ADMIN_USERNAME` + `ADMIN_PASSWORD`) and never touch KV.

---

## Worker secrets (Cloudflare dashboard)

All secrets are set via **Workers & Pages → klaviyo-proxy → Settings → Variables and Secrets**.

| Secret | Description |
|---|---|
| `TOKEN_SECRET` | Any long random string — signs session tokens |
| `ADMIN_USERNAME` | Admin login username |
| `ADMIN_PASSWORD` | Admin login password |
| `SHARED_ANTHROPIC_KEY` | Anthropic API key — used server-side by the Worker's Anthropic proxy; never sent to the browser |
| `KLAVIYO_KEY_<clientId>` | Per-client Klaviyo private API key (one per client) |
| `GITHUB_TOKEN` | GitHub token with **Issues: read & write** on the issues repo — used server-side by the Worker's `?action=github-issue` proxy so the in-app feedback form can file bug reports / feature requests without anyone logging in to GitHub |
| `GITHUB_REPO` *(optional)* | `owner/repo` to file feedback issues into (defaults to `steverowley/klaviyo-report-builder`). This is a plain variable, not a secret |

`SHARED_ANTHROPIC_KEY` stays server-side: the browser calls the Worker's authenticated `?action=anthropic` proxy, so users never see or paste an API key.

### Feedback (bug reports & feature requests)

The bug icon in the app header opens a feedback form. Submissions are turned into
GitHub issues (labelled `bug` or `enhancement`) via the Worker's `?action=github-issue`
proxy, which injects `GITHUB_TOKEN` server-side — the token never reaches the browser
and users never need a GitHub account. Until `GITHUB_TOKEN` is set, the form shows a
"not set up yet" message instead of failing. Create the token as a
[fine-grained personal access token](https://github.com/settings/personal-access-tokens/new)
scoped to the issues repo with **Issues: Read and write**.

---

## Client management

Clients (Klaviyo accounts) are managed two ways:

- **Via the app** — Admin users see an "Add client" option in the client dropdown. Requires an admin session and a valid Klaviyo private API key for the new client.
- **Via worker secrets** — Set `KLAVIYO_KEY_<clientId>` directly in Cloudflare and add the client to `CLIENTS_JSON` (a worker secret containing a JSON array of `{id, name}` objects).

Client list and keys are stored in the `CLIENTS_KV` Cloudflare KV namespace.

---

## Deploying the Worker

> Setting this up on fresh accounts? Follow [docs/self-host-setup.md](docs/self-host-setup.md)
> instead — it covers the Cloudflare account, KV namespaces, every secret, the
> Google OAuth client and the GitHub Actions secrets, in order.

The Worker lives in `worker/index.js`. Deploy with [Wrangler](https://developers.cloudflare.com/workers/wrangler/):

```bash
cd worker
npm install
npx wrangler login
export CLOUDFLARE_ACCOUNT_ID=<your account id>
npx wrangler deploy
```

After deploy, set the required secrets in the Cloudflare dashboard (see table above). The Worker URL is printed by Wrangler — it's also available at Workers & Pages → klaviyo-proxy.

### KV namespaces

Two KV namespaces are required. `wrangler.toml` ships with placeholder IDs —
KV namespaces are account-specific, so you must create your own and paste the
IDs in:

| Binding | Purpose |
|---|---|
| `CLIENTS_KV` | Client list, Klaviyo keys, saved reports |
| `USERS` | User accounts (register/approve/delete) |

Create them if they don't exist yet:

```bash
wrangler kv namespace create CLIENTS_KV
wrangler kv namespace create USERS
# Paste the returned IDs into wrangler.toml
```

---

## Frontend

The production build is served from GitHub Pages:

```
https://steverowley.github.io/klaviyo-report-builder/
```

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds with Vite and deploys automatically.

### Running locally

```bash
npm install
npm run dev
# → http://localhost:5173/klaviyo-report-builder/
```

---

## Project structure

```
klaviyo-report-builder/
├── src/
│   ├── App.jsx                 # Root: auth gate, admin panel, session management
│   ├── ReportBuilder.jsx       # Main UI: config sidebar, report iframe, history
│   ├── useReportGeneration.js  # Generation lifecycle: fetch, stream, retry, watchdog, cancel
│   ├── reportPrompt.js         # The Claude report prompt, versioned (REPORT_PROMPT_VERSION)
│   ├── anthropicStream.js      # Anthropic SSE stream parser
│   ├── workerApi.js            # Authenticated fetch helper for all worker calls
│   ├── ecommerceEvents.js      # UK ecommerce/holiday/payday event calendar
│   ├── reportHtml.js           # Report extraction, completeness checks, warning embeds
│   ├── reportMetrics.js        # Headline metrics computed in JS (not by the model)
│   ├── dateUtils.js            # Date helpers + report date validation
│   ├── errors.js               # Friendly error messages + retry classification
│   ├── theme.js                # Monochrome design tokens + shared input style
│   ├── useFocusTrap.js         # Keyboard focus management for dialogs
│   ├── components/             # ReportStates, Controls, ClientModals
│   ├── Settings.jsx            # Worker URL settings (admin only)
│   ├── SignIn.jsx              # Login screen
│   └── main.jsx                # React entry point
├── worker/
│   ├── index.js             # Cloudflare Worker: Klaviyo proxy + auth backend
│   └── wrangler.toml        # Worker config, KV bindings
├── .github/workflows/
│   ├── ci.yml               # Tests + build on every PR and non-main push
│   ├── deploy.yml           # GitHub Pages: tests, build, deploy on push to main
│   └── deploy-worker.yml    # Cloudflare Worker deploy (requires CLOUDFLARE_API_TOKEN secret)
├── index.html
├── vite.config.js           # base: "/klaviyo-report-builder/"
└── package.json
```

---

## How report generation works

1. The browser POSTs to the Worker with the selected `clientId` and date range.
2. The Worker resolves the Klaviyo key from KV (or env secrets), fetches and normalises campaign reports, flow reports, and daily metric aggregates, then returns clean JSON.
3. The browser calls the Worker's authenticated Anthropic proxy (streamed) with a detailed system prompt specifying the full HTML layout, and the Klaviyo JSON as data. The Worker injects the Anthropic key and streams Claude's response back.
4. Claude writes the complete HTML document. The browser streams it into an `<iframe srcdoc>` in real time and saves a copy to KV when complete.
5. Each saved report is stamped with who generated it, the prompt version that produced it (`REPORT_PROMPT_VERSION` in `src/reportPrompt.js`), and a snapshot of the exact Klaviyo inputs — so any number in a past report can be traced back to its source.
6. Past reports are accessible from the sidebar and persist across devices.

**Report types:** Weekly, Fortnightly, Monthly, Quarterly, YTD, Custom date range.
**Comparison modes:** None, Previous Period, Year on Year.
**Models:** Haiku 4.5 (fastest), Sonnet 4.6 (recommended), Opus 4.8 (highest quality).

---

## Report sections

Each generated report contains:

1. **Header** — Logo, print button, report title, client name, date range
2. **Period Snapshot** — Four hero metrics: revenue, campaigns sent, new subscribers, total orders
3. **List Growth** — Subscriber chart with net change
4. **Order Volume** — Daily orders chart
5. **Campaign Performance** — Table with opens, clicks, revenue per campaign
6. **Flow Performance** — Aggregated table per flow
7. **Key Insights** — AI-written analysis grounded in the data
8. **Comparison Analysis** — Delta table (shown only when a comparison period is selected)
9. **Next Steps** — Six prioritised action items
10. **Footer** — Branding and generation timestamp

---

## Security

- Klaviyo keys live in Cloudflare Worker secrets — never in the browser.
- The Anthropic key is stored in the `SHARED_ANTHROPIC_KEY` worker secret and used **only server-side** by the Worker's `?action=anthropic` proxy — it is never sent to the browser.
- Passwords are hashed with PBKDF2 (200,000 iterations, SHA-256).
- Session tokens are HMAC-SHA-256 signed with `TOKEN_SECRET`, expire after 7 days, and are validated on every sensitive Worker endpoint.
- The `.gitignore` blocks `.env`, `.env.*`, `*.key`, `*.pem`, and `secrets.*` — do not remove these entries.

---

## Design system

Strict editorial magazine aesthetic — strictly monochromatic, never green/red/blue.

| Token | Value |
|---|---|
| **Display font** | Ovo |
| **Body / UI font** | DM Sans 300 / 400 / 500 / 600 |
| **Ink** | `#0a0a0a` |
| **Graphite** | `#2a2a2a` |
| **Ash** | `#6b6b6b` |
| **Silver** | `#b8b8b8` |
| **Bone** | `#ededed` |
| **Paper** | `#f8f6f2` |
| **Pearl** | `#ffffff` |

Status deltas use `↑`/`↓` arrows in ink. Numbers use tabular figures. Hero metrics in large Ovo; labels in DM Sans uppercase with tracked letter-spacing.

---

## Troubleshooting

**"Auth not configured (TOKEN_SECRET missing)"**
The `TOKEN_SECRET` worker secret hasn't been set. Add it in the Cloudflare dashboard under Workers & Pages → klaviyo-proxy → Settings → Variables and Secrets, then redeploy.

**403 on the Users panel**
Your session token was issued before `TOKEN_SECRET` was set. Sign out and sign back in to get a fresh token.

**"Could not load clients from worker"**
Check the Worker URL is correct in Settings, the Worker is deployed, and `CLIENTS_KV` is bound in `wrangler.toml` with a valid namespace ID.

**Klaviyo 403 / permission error**
The Klaviyo private API key needs read access to Campaigns, Flows, and Metrics. Regenerate with those scopes.

**Report generation stalls**
Claude can take 60–120 seconds for a full report — this is normal. If it never resolves, check the Anthropic key and account credit balance.

---

> **Internal tool Not publicly released. Version 1 (not yet live).**
