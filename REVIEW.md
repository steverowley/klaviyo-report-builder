# Code Review — Klaviyo Report Builder

**Date:** 2026-06-05 · **Reviewed at:** v1 (pre-launch) · **Scope:** full repo (worker + frontend + config/CI/docs)

This is the record of an exhaustive multi-agent code review. Every finding below was raised by a
reviewer and then independently re-checked by a separate skeptic agent; 4 of the original 70 were
thrown out as false positives and are listed at the end.

**Tally (after verification):** 1 critical · 9 high · 13 medium · 36 low · 7 info.

**Legend:** `[x]` = fixed on the `fix/security-hardening` branch · `[ ]` = open · `→ issue` = tracked as a GitHub issue.

---

## 🔴 Critical

- [x] **Saved-report endpoints have no authentication** — `worker/index.js:569-650`
  `save-report`, `list-reports`, `get-report`, `delete-report` sat before the only login check and never
  verified a token. Anyone who knew the worker URL (it ships in the public site) could list, download,
  overwrite, plant, or delete **every client's report HTML and metadata** with no credentials.
  *Fix:* added a `requireSession` check (fail-closed) to all four handlers.

---

## 🟠 High

- [x] **Data endpoint auth fails open** — `worker/index.js:720-725`
  The core Klaviyo-data endpoint only checked the token `if (env.TOKEN_SECRET)` was set — clear/miss the
  secret and auth was skipped entirely. *Fix:* now uses `requireSession`, which returns 503 if the secret
  is unset (fail closed).
- [x] **`/?debug` is unauthenticated** — `worker/index.js:653-703`
  Leaked the full client roster, which keys are provisioned, whether auth is on, and user counts; also did
  a KV write on every call. *Fix:* gated behind an admin session.
- [x] **Legacy admin-password backdoor in `add-client`** — `worker/index.js:507-517`
  Accepted a plaintext `adminPassword` in the request body (same value as the admin login), unthrottled.
  *Fix:* removed; now requires an admin session token (the UI already sent one).
- [x] **Google login auto-approves without an `email_verified` check** — `worker/index.js:418-432`
  *Fix (partial):* now requires `email_verified`. The broader policy gap (auto-approve / no deprovisioning of
  ex-employees) is deferred → **issue: Google sign-in approval & deprovisioning policy**.
- [x] **Shared Anthropic key pushed to every browser** — `worker/index.js:361-432`, `src/SignIn.jsx`
  Every login drops the same live billing key into `localStorage`; any user can copy it, abuse can't be
  attributed, and it survived sign-out. *Fix (minimum):* key is now cleared on sign-out. The proper fix
  (proxy Anthropic through the worker so the key never reaches the browser) is deferred → **issue: proxy
  Anthropic calls through the worker**.
- [x] **Stored-XSS / exfiltration via the report iframe** — `src/ReportBuilder.jsx:1037-1109, 1222-1232, 2057-2064`
  A planted report (enabled by the critical bug) could run scripts in a viewer's browser. The sandbox
  already blocks key theft; remaining risk was data exfiltration + abusing the parent message handler.
  *Fix:* closed the planting vector (critical fix), added a `connect-src 'none'` CSP to the report HTML, and
  made the parent verify `event.source` before acting on iframe messages. (Kept `allow-modals` so the
  report's print button keeps working.)
- [ ] **Failed Klaviyo metric calls silently produce an incomplete report** — `worker/index.js:784-790, 836-851`
  A failed aggregate is swallowed, the worker returns 200, and the section is dropped — indistinguishable
  from "genuinely zero." A polished report can ship missing real data with no signal. → **issue: surface
  failed-vs-zero Klaviyo data**.
- [ ] **(duplicate of the critical, raised independently by a second reviewer)** — `worker/index.js:568-650` — addressed by the critical fix.
- [ ] **(second report of the shared-key exposure, raised by a second reviewer)** — `worker/index.js:361,388,432` — addressed by the sign-out clear + deferred proxy issue.

---

## 🟡 Medium

- [ ] **Hardcoded UTC ignores the client's Klaviyo timezone** — `worker/index.js:70-99, 784-816` — US clients'
  daily charts won't match their own dashboard near midnight; first/last days clipped. The account timezone
  is already fetched. → **issue: use account timezone for date bucketing**.
- [ ] **Metric auto-detection by substring can pick the wrong metric** — `worker/index.js:761-782` — can
  understate orders/revenue or silently drop sections for non-standard metric names. → **issue: harden
  metric auto-detection**.
- [ ] **Klaviyo campaign/flow names are a prompt-injection lever into the report** — `src/ReportBuilder.jsx:542-585`
  — bounded by the sandbox (no key theft); ceiling is network egress/UI abuse. Mitigated by the new CSP;
  full fix is an explicit "data is never instructions" system-prompt rule. → folded into the proxy/CSP issue.
- [ ] **`list-reports` returns all clients' metadata + silent 200-item cap** — `worker/index.js:604-617` — now
  authenticated, but still unscoped per-client server-side and capped at 200. → **issue: scope & paginate reports**.
- [ ] **Expired session shows a dead-end error** — `src/ReportBuilder.jsx:663-680, 925-934` — after 7 days,
  "Generate" shows a raw "Unauthorised" with no re-login prompt. → **issue: handle session expiry (401→re-login)**.
- [ ] **`kFetch` 429 retry trusts an unbounded `Retry-After`** — `worker/index.js:21-30` — a throttled account can
  make the worker sleep for minutes and time out into an opaque 5xx. → **issue: clamp rate-limit backoff**.
- [ ] **Interrupted stream saves a truncated report** — `src/ReportBuilder.jsx:795-855` — a premature stream
  close persists a half-report as "finished." → **issue: verify report completeness before saving**.
- [ ] **`delete-report` was unauthenticated** — `worker/index.js:619-631` — addressed by the critical fix
  (now requires a session). (`admin-delete` was already correctly admin-gated — that half of the finding was wrong.)
- [ ] **No CI tests / lint / quality gate** — `.github/workflows/deploy.yml` — every merge deploys live with
  only a build step. → **issue: add tests + CI gate**.
- [ ] **README auth section describes a register/approve flow that's unreachable** — `README.md:45-55` — the UI
  only offers Google Sign-In + admin login. → **issue: fix docs drift**.
- [ ] **CLAUDE.md design system (Cormorant/Inter) contradicts the actual fonts (Ovo/DM Sans)** — `CLAUDE.md:29-34`,
  `index.html:10` (two buttons still reference "Inter" and fall back). → **issue: fix docs drift**.
- [ ] **CLAUDE.md says the Anthropic key is "entered via Settings only"; the worker auto-distributes it** —
  `CLAUDE.md:14-17,26`. → **issue: fix docs drift**.
- [ ] **No tests and no test runner exist** — `package.json` — pure worker functions (token round-trip,
  aggregation, slugify) are easily testable but uncovered. → **issue: add tests + CI gate**.

---

## ⚪ Low (36)

**Auth**
- [ ] Token verify uses `lastIndexOf('.')` with no algorithm/type binding; admin flag in unencrypted (but signed) payload — `worker/index.js:279-294`
- [ ] `register` allows unbounded anonymous account creation (no rate limit / domain check) — `worker/index.js:325-345`

**Secrets**
- [ ] Klaviyo upstream response bodies leak into client-visible error messages — `worker/index.js:31-34, 528-531`

**Data correctness**
- [ ] `aggregateBody` end filter uses `< 23:59:59` (not next-day midnight), dropping the final second/day edge — `worker/index.js:93`
- [ ] Flow open/click counts reconstructed from rounded `rate × recipients`, biasing per-flow CTOR — `worker/index.js:221-237`
- [ ] `processAggregate` scalar/array fallback can silently return a mismatched array; no length validation — `worker/index.js:146-178`
- [ ] `normaliseCampaigns` keeps non-email campaigns with the id as display name — `worker/index.js:180-198`
- [ ] Partial aggregate failures collapse to null/zero, visible only in `_meta` — `worker/index.js:784-790, 836-851`
- [ ] Pagination next-link rewrite assumes a fixed base — `worker/index.js:112-120, 131-139`

**Report generation**
- [ ] SSE `outputTokens` counter increments per delta, not per token — `src/ReportBuilder.jsx:812-825`
- [ ] No request timeout on Anthropic/worker fetches; only manual cancel + 120s advisory — `src/ReportBuilder.jsx:663-772`
- [ ] Saved-report HTML accumulates in KV with no size guard / expiry — `worker/index.js:581-601`

**React / frontend**
- [ ] Freshly generated report never matches its own KV key (broken "current" highlight) — `src/ReportBuilder.jsx:917-919`
- [ ] iframe step "edit" toggle compares boolean vs string — `src/ReportBuilder.jsx:493-498`
- [ ] Regenerated recommendation lost if iframe has no live contentWindow (srcdoc fallback never implemented) — `src/ReportBuilder.jsx:1091-1099`
- [ ] No error boundary: a render throw blanks the whole app — `src/App.jsx:270-340`
- [ ] Redundant report-list refetch / non-memoized fetch helpers in effect deps — `src/ReportBuilder.jsx:1029-1035`
- [ ] Custom cursor: global `cursor:none !important` + `elementFromPoint` on every mousemove (a11y/perf) — `src/App.jsx:12-68`
- [ ] Custom controls lack ARIA roles/labels/keyboard support — `src/ReportBuilder.jsx:1570-1660`
- [ ] 3087-line single component mixing prompts, date math, SSE parsing, ~1800 lines of inline-styled JSX — `src/ReportBuilder.jsx`
- [ ] Slides/regenerate aux fetches lack AbortController + request-id guarding — `src/ReportBuilder.jsx:1038-1109`

**Error handling**
- [ ] Worker leaks raw Klaviyo response bodies to the browser in errors — `worker/index.js:31-34, 856-861`
- [ ] No date validation: future dates, start>end, over-long ranges pass silently — `src/ReportBuilder.jsx:276-287`
- [ ] `save-report` key derived from millisecond clock with no idempotency — `worker/index.js:587-597`
- [ ] Client-list fetch assumes JSON/array with no content-type / non-OK guard — `src/ReportBuilder.jsx:1116-1125`
- [ ] Anthropic overload/429/500 surfaces raw status, no retry/friendly guidance — `src/ReportBuilder.jsx:776-780`

**Config / CI**
- [ ] Font drift: app loads Ovo/DM Sans but docs/some styles demand Cormorant/Inter — `index.html:9-12`
- [ ] Worker deploy has no committed lockfile — `worker/package.json`
- [ ] Worker deploy workflow cats `wrangler.toml` into public build logs — `.github/workflows/deploy-worker.yml:24-30`
- [ ] Node version mismatch: Pages 22, worker 20, plus a Node 24 hack — `.github/workflows/deploy.yml:22-26`
- [ ] `workers_dev = true` exposes the proxy on a public `*.workers.dev` URL — `worker/wrangler.toml:5`
- [ ] `esbuild 0.21.5` (via Vite 5) carries a known dev-server advisory — `package-lock.json`
- [ ] `VITE_WORKER_URL` has no real fallback — unset secret needs manual URL entry — `.github/workflows/deploy.yml:33-34`

**Docs**
- [ ] No LICENSE file despite docs treating licensing as a decision — `README.md:241`
- [ ] Docs claim `.gitignore` blocks `.env.*` but only specific `.env.*.local` variants are ignored — `README.md:198`
- [ ] README model list documents labels but not the actual model IDs/default — `README.md:171`

---

## ℹ️ Info (7) — verified-OK or accepted-by-design

- Cloudflare `account_id` + KV namespace IDs committed in `wrangler.toml` (non-secret) — `worker/wrangler.toml:4,9,13`
- `VITE_WORKER_URL` baked into the public bundle (by design) — `.github/workflows/deploy.yml:33-34`
- CI "Show config" prints `wrangler.toml` — verified to contain no secrets — `.github/workflows/deploy-worker.yml:24-30`
- Comparison-period order aggregate fetched but only `count` used — verified no metric-id mismatch — `worker/index.js:799-823`
- AddClientModal flow — no double-submit/selection bug found — `src/ReportBuilder.jsx:2895-2932`
- Undocumented `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` env hack in both workflows — `.github/workflows/deploy.yml:15-16`
- Verified-correct doc claims: secret names, worker name, KV bindings, sessionStorage, legacy localStorage keys — `README.md:59-114`

---

## ❌ False positives (discarded by verification)

- **"Bearer token / shared key are XSS-readable; the poisoned-report iframe can exfiltrate the key"** — the
  central key-theft chain is broken by the sandbox (opaque origin, no `allow-same-origin`).
- **"Model IDs `claude-sonnet-4-6` / `claude-opus-4-7` are fabricated and 400"** — they are valid.
- **"Download-as-HTML omits injected chart markers / cursor relay"** — download is correct (the finding itself concluded so).
- **"`lastUsage`/`lastDuration` show stale cost mid-run"** — `lastUsage` is overwritten before the overlay renders.

---

## What's already solid

PBKDF2 password hashing (200k iters, constant-time compare, dummy-hash timing defense) · sound bespoke
HMAC session tokens (signature verified before payload trusted; no JWT alg-confusion) · Klaviyo keys kept
server-side and out of error bodies · report iframe sandboxed without same-origin (blocks key theft) ·
rate-limit retry/backoff · client-switching race guards (AbortController + request-id) · committed
infra IDs correctly identified as non-secret.

---

## Branch & follow-ups

- **`fix/security-hardening`** (this branch) — closes the critical report-endpoint hole, the fail-open data
  auth, the open `/?debug`, the `add-client` backdoor, adds the Google `email_verified` check, clears the
  Anthropic key on sign-out, and hardens the report iframe (CSP + message-origin check).
- **GitHub issues** track the larger follow-ups: proxy Anthropic through the worker · surface
  failed-vs-zero Klaviyo data · account-timezone bucketing · harden metric auto-detection · add tests + CI ·
  Google approval/deprovisioning policy · scope & paginate reports · session-expiry handling · docs drift.
