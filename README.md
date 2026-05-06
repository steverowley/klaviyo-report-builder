# Klaviyo Report Builder

A browser-based tool that pulls live data from your Klaviyo account and uses Claude AI to generate polished, print-ready email marketing performance reports in minutes.

![Swanky Agency](https://swankyagency.com/wp-content/uploads/2022/05/swanky-2020-black.png)

---

## What it does

Klaviyo Report Builder fetches campaign and flow performance data directly from your Klaviyo account, hands it to Claude (Anthropic's AI), and produces a fully-formatted HTML report with:

- Revenue, orders, campaigns sent, and subscriber growth at a glance
- Campaign-by-campaign performance table (opens, clicks, revenue)
- Flow performance aggregated by flow (not by individual message)
- List growth and order volume charts
- AI-written narrative insights and next-step recommendations
- Optional comparison against the previous period or same period last year

Reports are rendered instantly in the browser and can be downloaded as a standalone HTML file — no server required.

---

## Architecture

This is a **static, frontend-only application** hosted on GitHub Pages. There is no backend. All API calls happen either directly from the browser or through a small Cloudflare Worker that acts as a data-fetching proxy.

```
Browser (React + Vite)
  │
  ├─▶  Cloudflare Worker (your own deployment)
  │       └─▶  Klaviyo REST API  (fetches campaign / flow data)
  │
  └─▶  Anthropic API  (direct browser call)
          └─▶  Claude Sonnet 4.6  (generates the report HTML)
```

**Why a Worker?** Klaviyo's private API requires a server-side key and does not support browser CORS. The Worker fetches, normalises, and aggregates the raw Klaviyo data, then returns clean JSON to the browser. The Anthropic call goes directly from the browser using the `anthropic-dangerous-direct-browser-access` header — no proxy needed there.

**API keys** are stored only in the user's browser `localStorage` and are never logged, committed, or sent anywhere except to their intended APIs.

---

## Getting started

### Prerequisites

| Requirement | Where to get it |
|---|---|
| **Anthropic API key** (`sk-ant-…`) | [console.anthropic.com](https://console.anthropic.com) |
| **Klaviyo Private API key** (`pk_…`) | Klaviyo → Settings → API Keys → Create Private API Key (read scopes: Campaigns, Flows, Metrics) |
| **Cloudflare Worker URL** (HTTPS) | Deploy the Worker from `worker/` — see below |

### 1. Deploy the Cloudflare Worker

The Worker lives in `worker/index.js` and is deployed with [Wrangler](https://developers.cloudflare.com/workers/wrangler/).

```bash
cd worker
npm install
npx wrangler login
npx wrangler deploy
```

Wrangler prints the Worker's public HTTPS URL when it finishes — copy it, you'll need it in Settings.

### 2. Open the app

The production build is served automatically from GitHub Pages:

```
https://<your-github-username>.github.io/klaviyo-report-builder/
```

On first load the app opens the Settings screen. Paste your three keys and save. They are written to `localStorage` in your browser and never leave your machine.

### 3. Generate a report

1. Enter your account or client name.
2. Choose a report type: **Fortnightly**, **Monthly**, **Year to Date**, or **Custom**.
3. Optionally add a comparison period (previous period or year-on-year).
4. Click **Generate report** and wait ~60–90 seconds while the app fetches data and Claude composes the HTML.
5. Download the finished report with the button that appears in the top-right corner.

---

## Running locally

```bash
npm install
npm run dev
```

The dev server starts at `http://localhost:5173/klaviyo-report-builder/`. Settings and report generation work identically to production — you just need the same three keys in localStorage.

To build for production:

```bash
npm run build
```

The output goes to `dist/` with the correct `/klaviyo-report-builder/` base path for GitHub Pages.

---

## Deployment

### Frontend (GitHub Pages)

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds with Vite and deploys to GitHub Pages automatically. No extra configuration needed once the Pages source is set to the `gh-pages` branch (or the workflow's output — check the workflow file for the exact target).

### Cloudflare Worker

`.github/workflows/deploy-worker.yml` exists for automated Worker deployments. It requires a `CLOUDFLARE_API_TOKEN` secret in your repository settings. You can also deploy manually at any time with `npx wrangler deploy` from `worker/`.

---

## Project structure

```
klaviyo-report-builder/
├── src/
│   ├── App.jsx              # Root component — routes between Settings and ReportBuilder
│   ├── ReportBuilder.jsx    # Main UI: config sidebar, loading state, report iframe
│   ├── Settings.jsx         # API key management (reads/writes localStorage only)
│   └── main.jsx             # React DOM entry point
├── worker/
│   ├── index.js             # Cloudflare Worker — Klaviyo data fetcher and normaliser
│   └── package.json
├── .github/workflows/
│   ├── deploy.yml           # GitHub Pages deployment
│   └── deploy-worker.yml    # Cloudflare Worker deployment
├── index.html
├── vite.config.js           # base: "/klaviyo-report-builder/"
└── package.json
```

---

## How the Worker fetches data

The Worker (`worker/index.js`) accepts a POST request from the browser containing the Klaviyo key, date range, and optional comparison range. It then:

1. Fetches campaign performance statistics for the period from Klaviyo's Reporting API.
2. Fetches flow performance statistics and aggregates per-message rows into per-flow totals.
3. Fetches daily order and subscriber aggregate metrics.
4. Repeats steps 1–3 for the comparison period if requested.
5. Returns a single flat JSON object to the browser.

Rate-limit responses (HTTP 429) are retried with exponential back-off.

---

## How the report is generated

The browser calls the Anthropic API directly with:

- A detailed system prompt that specifies the full HTML/CSS layout (10 named sections, exact font stack, colour palette, and component specs).
- The structured JSON from the Worker as the data payload.
- **Model:** `claude-sonnet-4-6` with up to 32,000 output tokens.

Claude writes the complete HTML document in a single response. The browser streams the output, renders it in an `<iframe srcdoc>`, and makes it available for download when the stream closes.

---

## Security

- **API keys are stored only in `localStorage`** under the keys `swanky_anthropic_key`, `swanky_klaviyo_key`, and `swanky_worker_url`. They are never logged, included in error messages, or committed to the repository.
- The `.gitignore` blocks `.env`, `.env.*`, `*.key`, `*.pem`, and `secrets.*` — do not remove these entries.
- The Settings screen is the only component that reads from or writes to those localStorage entries.
- The Cloudflare Worker is your infrastructure — it sees your Klaviyo key in transit but does not store it.

---

## Design system

The generated reports (and the app shell) use a strict editorial design language:

| Token | Value |
|---|---|
| **Display font** | Cormorant Garamond 300 / 400 / 500 (Google Fonts) |
| **Body / UI font** | Inter 300 / 400 / 500 / 600 (Google Fonts) |
| **Ink** | `#0a0a0a` |
| **Graphite** | `#2a2a2a` |
| **Ash** | `#6b6b6b` |
| **Silver** | `#b8b8b8` |
| **Bone** | `#ededed` |
| **Paper** | `#f8f6f2` |
| **Pearl** | `#ffffff` |

The palette is strictly monochromatic. Status deltas use `↑`/`↓` arrows in ink — never green or red. Numbers use tabular figures. Hero metrics are set in large Cormorant Garamond; labels are Inter uppercase with tracked letter-spacing (0.16–0.22 em).

---

## Report sections

Each generated report contains:

1. **Header** — Logo, print button, report title, account name, and date range meta bar.
2. **Period Snapshot** — Four hero metric cards: revenue, campaigns sent, new subscribers, total orders.
3. **List Growth** — Subscriber acquisition chart with period totals and net change.
4. **Order Volume** — Daily orders line chart.
5. **Campaign Performance** — Table of every campaign: subject line, sends, open rate, click rate, revenue.
6. **Flow Performance** — Table of every active flow with aggregated sends, open rate, click rate, revenue.
7. **Key Insights** — Five paragraphs of AI-written analysis grounded in the data.
8. **Comparison Analysis** — Period-over-period or year-on-year delta table (shown only when a comparison range is selected).
9. **Next Steps** — Six numbered action items with strategic tags.
10. **Footer** — Branding and generation timestamp.

---

## Troubleshooting

**"Failed to fetch" from the Worker**
Check that the Worker URL in Settings is correct and that the Worker is deployed and running. Open the URL in a browser — it should return a JSON error (not a network failure).

**Klaviyo 403 / permission error**
Your Klaviyo Private API key needs read access to Campaigns, Flows, and Metrics. Regenerate the key with those scopes selected.

**Report generation times out or stalls**
Claude can take 60–120 seconds for a full report. A patience message appears after 90 seconds — this is normal. If the stream never resolves, check your Anthropic key and account credit balance.

**Blank report / malformed HTML**
Occasionally Claude will produce slightly malformed HTML under heavy load. Regenerating usually fixes it. If the issue is consistent, check whether the Worker is returning valid JSON (open browser DevTools → Network and inspect the Worker response).

---

## Contributing

1. Fork the repository and create a feature branch.
2. Follow the design system rules in `CLAUDE.md` — no new colours, no new fonts.
3. Never commit API keys or `.env` files.
4. Open a pull request with a [Conventional Commits](https://www.conventionalcommits.org/) title (`feat:`, `fix:`, `docs:`, etc.).

---

## License

MIT
