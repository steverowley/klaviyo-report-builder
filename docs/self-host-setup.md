# Standing the app up on your own accounts

This is a from-scratch setup guide: new Cloudflare account, new Google OAuth
client, new Anthropic key. Follow it top to bottom and the app comes up on your
own infrastructure with nothing pointing at anyone else's.

Budget about an hour. Most of it is waiting on dashboards, not typing.

**What you cannot bring with you:** Cloudflare Worker secrets are write-only —
once set, nothing can read them back, not even an account owner. So the Klaviyo
API keys, the Anthropic key and the token secret from a previous deploy are
gone for good. Every key below has to be created fresh.

---

## Before you start

Install what you need locally:

```bash
node --version   # need 18 or newer — https://nodejs.org if missing
git --version
```

Clone the repo if you haven't:

```bash
git clone https://github.com/steverowley/klaviyo-report-builder.git
cd klaviyo-report-builder
npm install
```

---

## 1. Cloudflare account and Worker

The Worker is the backend: it holds every API key, talks to Klaviyo and
Anthropic, and gates access. The free plan covers this app comfortably
(100,000 requests/day; a report is a handful of requests).

1. Sign up at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up). No domain or payment needed.
2. Copy your **Account ID** — dashboard right-hand sidebar, or Workers & Pages → Overview. A 32-character hex string.
3. Log Wrangler (Cloudflare's CLI) into that account:

```bash
cd worker
npm install
npx wrangler login          # opens a browser to authorise
npx wrangler whoami         # confirm the email and account are yours
```

### Create the two KV namespaces

KV is Cloudflare's key-value store. This app uses two — one for clients and
saved reports, one for user accounts.

```bash
npx wrangler kv namespace create CLIENTS_KV
npx wrangler kv namespace create USERS
```

Each prints an `id`. Open `worker/wrangler.toml` and replace
`REPLACE_WITH_YOUR_CLIENTS_KV_ID` and `REPLACE_WITH_YOUR_USERS_KV_ID` with them.

### First deploy

```bash
export CLOUDFLARE_ACCOUNT_ID=<the account id from step 2>
npx wrangler deploy
```

Wrangler prints the Worker URL, something like
`https://klaviyo-proxy.<your-subdomain>.workers.dev`. **Write it down** — several
later steps need it.

Sign-in won't work yet; the secrets come next.

---

## 2. Worker secrets

Set from the `worker/` directory. Each command prompts for the value, so the
secret never appears in your shell history:

```bash
npx wrangler secret put TOKEN_SECRET
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SHARED_ANTHROPIC_KEY
npx wrangler secret put CLIENTS_JSON
npx wrangler secret put GOOGLE_CLIENT_ID
```

| Secret | What to enter |
|---|---|
| `TOKEN_SECRET` | A long random string — signs session tokens. Generate with `openssl rand -base64 32`. Never reuse an old one. |
| `ADMIN_USERNAME` | Your admin login name. |
| `ADMIN_PASSWORD` | A strong password. This is the account that approves everyone else, so treat it as the master key. |
| `SHARED_ANTHROPIC_KEY` | Your Anthropic API key — see step 3. |
| `CLIENTS_JSON` | Your client list as JSON, e.g. `[{"id":"acme","name":"Acme Ltd"}]`. Start with `[]` if you have none yet. |
| `GOOGLE_CLIENT_ID` | Your Google OAuth client ID — see step 4. Must match the frontend's. |

Optional:

| Secret | Effect if unset |
|---|---|
| `SPEND_CAP_USD` | No spend ceiling on report generation. |
| `GITHUB_TOKEN` / `GITHUB_REPO` | In-app feedback form shows "not set up yet" instead of filing issues. |

### Klaviyo keys — one per client

Each client needs its own key, created inside **their** Klaviyo account:
Settings → API Keys → Create Private API Key, with read scopes for campaigns,
flows, metrics, lists and segments.

```bash
npx wrangler secret put KLAVIYO_KEY_acme     # id must match CLIENTS_JSON
```

The secret name is `KLAVIYO_KEY_` plus the client's `id` from `CLIENTS_JSON`.
Get that wrong and the app reports the client as unconfigured.

You can also add clients from inside the app later — admins get an "Add client"
option in the client dropdown, which validates the key before saving it.

---

## 3. Anthropic API key

This is what writes the reports, and it's billed to you per use.

1. Sign up at [console.anthropic.com](https://console.anthropic.com).
2. Add credit under Billing — pay-as-you-go, no subscription.
3. API Keys → Create Key. Copy it once; it's not shown again.
4. Set it as `SHARED_ANTHROPIC_KEY` (step 2).

Rough cost: a report is a large prompt and a long response, so think cents
rather than fractions of a cent. Set `SPEND_CAP_USD` if you want a hard ceiling
while you get a feel for it.

---

## 4. Google sign-in

The app authenticates people through Google. The OAuth client is tied to a
Google Cloud project, so you need your own — an inherited client ID will reject
every sign-in.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project.
2. APIs & Services → OAuth consent screen. Choose **External**, fill in app name and your email, and save. It can stay in "Testing" mode — that's fine for a small number of users.
3. APIs & Services → Credentials → Create Credentials → **OAuth client ID** → **Web application**.
4. Under **Authorised JavaScript origins**, add every URL the app is served from:
   - `https://<your-github-username>.github.io`
   - `http://localhost:5173` (for local development)
5. Create, then copy the **Client ID** (ends in `.apps.googleusercontent.com`).

That one ID goes in two places, and they must match:

- Worker secret `GOOGLE_CLIENT_ID` (step 2)
- Frontend build variable `VITE_GOOGLE_CLIENT_ID` (step 5)

---

## 5. Frontend deploy

The frontend is a static site on GitHub Pages. It needs to know two things at
build time: where the Worker is, and which Google client ID to use.

In your GitHub repo → Settings → Secrets and variables → Actions → New
repository secret:

| Secret | Value |
|---|---|
| `VITE_WORKER_URL` | Your Worker URL from step 1 |
| `VITE_GOOGLE_CLIENT_ID` | Your Google client ID from step 4 |
| `CLOUDFLARE_API_TOKEN` | See below |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID from step 1 |

For `CLOUDFLARE_API_TOKEN`: Cloudflare dashboard → My Profile → API Tokens →
Create Token → **Edit Cloudflare Workers** template. This lets GitHub Actions
redeploy the Worker automatically whenever `worker/**` changes on `main`.

Then check Settings → Pages is serving from the `gh-pages` branch, and push to
`main`. Two workflows run: `deploy.yml` (frontend) and `deploy-worker.yml`
(Worker).

Also update the fallback in `src/config.js` — `DEFAULT_WORKER_URL` still points
at the old Worker, and it's what local development uses when
`VITE_WORKER_URL` isn't set.

---

## 6. First sign-in

1. Open the app and use **Admin sign-in** with the username and password from step 2.
2. Sign in with Google separately — that creates a **pending** account.
3. Back as admin, open the Users panel and approve it.

Every Google sign-in lands in the pending queue first; nobody gets in until an
admin approves them. That queue is the only thing standing between a public URL
and your clients' Klaviyo data, so keep the admin password strong and don't
share it.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Authentication error [code: 10000]` on deploy | `CLOUDFLARE_API_TOKEN` doesn't match the account that owns the Worker, or lacks Workers edit permission. |
| `account_id ... does not match any of your authenticated accounts` | `CLOUDFLARE_ACCOUNT_ID` belongs to a different account than the token. |
| Google button appears, sign-in returns "Token not issued for this application" | Frontend `VITE_GOOGLE_CLIENT_ID` and Worker `GOOGLE_CLIENT_ID` disagree. |
| Google popup errors before reaching the app | The app's URL isn't in the OAuth client's authorised JavaScript origins. |
| Client dropdown empty | `CLIENTS_JSON` unset or `[]`. |
| A client errors on report generation | Missing or wrong `KLAVIYO_KEY_<id>`, or the key lacks read scopes. |
| Reports fail with a 503 about the Anthropic key | `SHARED_ANTHROPIC_KEY` unset, or the account is out of credit. |

---

## Security notes

- Never commit any of these values. `.gitignore` already covers `.env`, `*.key`, `*.pem` and `secrets.*` — leave those entries alone.
- API keys belong in `wrangler secret put` and GitHub Actions secrets, nowhere else. They must never reach the browser or a source file.
- Klaviyo private API keys grant access to a client's customer data. Only hold keys for accounts you're authorised to access, and remove them when an engagement ends (delete the client in-app, and `npx wrangler secret delete KLAVIYO_KEY_<id>`).
- Rotate `TOKEN_SECRET` if you ever suspect it leaked; it invalidates all sessions and forces everyone to sign in again.
