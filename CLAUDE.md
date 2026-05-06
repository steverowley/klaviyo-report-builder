# Klaviyo Report Builder — guidance for Claude Code

## Workflow preferences (persistent — set by Steve)

- **Auto-merge using conventional commits.** When the user asks to merge, do not stop to ask permission for the merge step. Create a PR with a Conventional Commits–style title (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `style:`, `test:`, `build:`, `ci:`, `perf:`), then squash-merge it into `main` with the same conventional title. The squash commit body should be the bullet-list summary from the PR description.
- This applies whenever the user says "merge", "ship", "deploy it", "push it live", or similar — assume conventional-commit squash-merge into `main` unless they say otherwise.
- The deploy workflow (`.github/workflows/deploy.yml`) runs on every push to `main`, so a successful merge is the deploy.

## Architecture (do not break)

- Frontend-only static site, hosted on GitHub Pages. **No backend except the Cloudflare Worker proxy.**
- **Anthropic key** lives in browser `localStorage` (`swanky_anthropic_key`) — entered via Settings.
- **Klaviyo keys** are stored as Cloudflare Worker secrets (`KLAVIYO_KEY_<clientId>`), never in the browser. The browser sends a `clientId`; the worker resolves it to the correct key internally.
- **Client list** is stored as a Worker secret `CLIENTS_JSON` — a JSON array of `{id, name}` objects. Update it via the Cloudflare dashboard; no redeploy needed.
- localStorage keys in use: `swanky_anthropic_key`, `swanky_worker_url`. `swanky_klaviyo_key` is legacy — cleared on "Clear all keys" but no longer written.
- The worker exposes `GET /` (client list) and `POST /` (fetch Klaviyo data). The frontend calls `GET workerUrl` on load to populate the client dropdown.
- `handleGenerate` POSTs directly from the browser to `https://api.anthropic.com/v1/messages`. The Klaviyo data arrives pre-fetched from the worker and is embedded in the Claude prompt.
- Vite `base` is `/klaviyo-report-builder/` to match the GitHub Pages path. Do not change this without also updating the repo name.

## Security rules (non-negotiable)

- **Never** write API keys into source files, commit them, log them, or include them in error messages.
- **Never** add a `.env` file containing secrets. The `.gitignore` already covers `.env`, `.env.*`, `*.key`, `*.pem`, `secrets.*` — keep these entries.
- The Settings screen is the only component that reads from or writes to the localStorage key entries. Any other component that needs them should accept them as props or read them at request time (as `ReportBuilder.handleGenerate` does).
- Stop the user immediately if they're about to do something that risks exposing keys (e.g. pasting a key into the chat, committing a `.env` with real values, hardcoding a key for "testing").

## Design system (non-negotiable)

- Display: Cormorant Garamond (300/400/500). Body/UI: Inter (300/400/500/600). Both via Google Fonts.
- Strictly monochromatic palette — `#0a0a0a` ink, `#2a2a2a` graphite, `#6b6b6b` ash, `#b8b8b8` silver, `#ededed` bone, `#f8f6f2` paper, `#ffffff` pearl. Never introduce green/red/blue, even for status (deltas use `↑`/`↓` arrows in monochrome).
- Hairline rules (1px), generous whitespace, editorial magazine feel. Tabular numerals on numbers. Big Cormorant Garamond for hero metrics; Inter uppercase tracked-out (~0.16–0.22em letter-spacing) for labels.
- Logo: `https://swankyagency.com/wp-content/uploads/2022/05/swanky-2020-black.png`.

## Honesty clause

If something fails (CORS, MCP auth, an unknown model ID, a Klaviyo scope error), tell the user the actual error and the realistic options. Do not paper over failures with cosmetic UI or simulated progress. If browser-direct MCP turns out not to work, the realistic fallback is a tiny Cloudflare Worker as an auth proxy — flag this immediately, not after a long fake wait.
