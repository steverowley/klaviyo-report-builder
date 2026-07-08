# Klaviyo Report Builder — User Guide

A practical, step-by-step guide for Swanky Agency staff. It covers signing in,
generating a client report, reviewing and sending it, and the admin tools for
managing clients and users.

> **You don't need any API keys.** The tool is fully configured by your admin —
> just sign in and go. There is no Anthropic or Klaviyo key for you to paste in.

---

## Table of contents

1. [Signing in](#1-signing-in)
2. [The screen at a glance](#2-the-screen-at-a-glance)
3. [Generating a report](#3-generating-a-report)
4. [The "incomplete data" warning](#4-the-incomplete-data-warning)
5. [Reading the report](#5-reading-the-report)
6. [Editing the report text](#6-editing-the-report-text)
7. [Reviewing and sending (sign-off)](#7-reviewing-and-sending-sign-off)
8. [Exports: HTML, source data, and Speedy Slides](#8-exports-html-source-data-and-speedy-slides)
9. [Past reports](#9-past-reports)
10. [AI spend this month](#10-ai-spend-this-month)
11. [Admin: managing clients](#11-admin-managing-clients)
12. [Admin: managing users](#12-admin-managing-users)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Signing in

There are two ways in:

- **Sign in with Google** — use your `@swankyagency.com` account. The first time you
  sign in, your account goes into a **pending** queue and an admin has to approve it
  before you can use the tool. You'll see a "waiting for approval" message until then.
- **Admin sign-in** — admins can use the "Admin sign-in" toggle and enter the admin
  username and password.

Sessions last 7 days. If yours expires while you're working, the tool will bounce you
back to the sign-in screen with a message asking you to sign in again — nothing is lost.

---

## 2. The screen at a glance

- **Left sidebar** — pick the client, choose the report settings, and press
  **Generate report**. Once a report exists this area becomes the report's action
  panel (download, slides, new report).
- **Main area** — shows the finished report, rendered exactly as the client will see it.
- **Past reports** — a list of previously generated reports for the selected client.
- **AI spend** — a small meter at the bottom of the sidebar showing this month's AI cost.

Admins additionally see a **Users** button (top) and **Add new client** /
**Offboard a client** options in the client dropdown.

---

## 3. Generating a report

1. **Choose a client** from the dropdown. If the list is empty, an admin needs to add
   one first (see [section 11](#11-admin-managing-clients)).
2. **Report type** — Weekly, Fortnightly, Monthly, Quarterly, YTD, or Custom.
   - Preset types automatically cover the period up to **yesterday** (reports only
     include complete days).
   - **Custom** lets you pick a start and end date. The end date must be before today,
     the start must be on or before the end, and the range can't be longer than a year —
     you'll get a friendly message if it isn't.
3. **Comparison** — None, Previous Period, or Year on Year. When set, the report adds a
   comparison section and shows deltas (↑/↓) against that period.
4. **Model** — Haiku 4.5 (fastest, cheapest), Sonnet 4.6 (recommended), or
   Opus 4.8 (highest quality, slowest, most expensive).
5. **Additional context** (optional) — note anything that explains the numbers (a sale,
   a product launch, a platform change). The AI uses it in the narrative.
6. Press **Generate report**. The tool fetches live Klaviyo data and streams the report
   into the main area in real time. A full report typically takes **60–120 seconds**.

You can press **Cancel** at any time. If the connection stalls (no response for 90
seconds) the tool stops and tells you, so you're never stuck on a frozen progress bar.

> All numbers in the headline cards (revenue, orders, subscribers, etc.) are calculated
> by the tool, not the AI, so they're exact. The AI writes only the words around them.

---

## 4. The "incomplete data" warning

If Klaviyo couldn't return part of the data (for example a missing "Placed Order"
metric, or a temporary error), a banner appears above the report:

> **Incomplete data — review before sending**

It lists exactly what's missing. **Always read it before sending the report** — a
section may be blank or understated. The same notice is baked into the downloaded /
printed report, and it reappears if you reopen the report later from Past reports, so
the warning can't get lost.

If a period has no campaigns, no flows, and no daily activity at all, you'll get a clear
"no data found for this client in this period" warning — double-check you picked the
right client and dates.

---

## 5. Reading the report

Each report contains, in order:

1. **Header** — logo, title, client name, date range, and a Print / Save PDF button.
2. **Executive summary** — the top-line story in a few sentences (editable — see §6).
3. **Period snapshot** — four hero metrics: total revenue, campaigns sent, new
   subscribers, total orders (each with a comparison delta when a comparison is set).
4. **List growth** — new subscribers per day, plus unsubscribes and net growth.
5. **Order volume** — orders per day.
6. **Campaign performance** — a table of email campaigns (opens, clicks, CTOR, CVR,
   revenue). SMS and push campaigns are excluded so the email figures are accurate.
7. **Flow performance** — aggregated per flow.
8. **Key insights** — AI-written analysis grounded in the data (editable — see §6).
9. **Comparison analysis** — shown only when a comparison period is selected (editable — see §6).
10. **Next steps for growth** — prioritised, editable recommendations.
11. **Footer** — branding and a generation timestamp.

Charts render via Chart.js. Calendar events (e.g. Black Friday, paydays) that fall in
the period are marked on the charts where relevant.

---

## 6. Editing the report text

The report is interactive in the preview, so you can fine-tune the AI's wording
before it reaches a client.

**Narrative sections** — the **Executive summary**, **Key insights**, and
**Comparison analysis** each have a small **✎** button in their heading. Click it to
edit that section's text in place (a dashed outline shows it's editable), then click
**✓** to finish. Only the written prose is editable — the metric cards, charts, and
data tables are locked so the figures can't be accidentally changed.

**Next steps** — each recommendation has its own controls:

- **Edit** (✎) a step to change its title or description inline; click ✓ to finish.
- **Priority** — click the "High / Medium / Low priority" label to cycle it.
- **Reorder** — drag a step up or down.
- **Regenerate** (↺) — ask the AI for a fresh, non-duplicate recommendation in that slot.
- **Delete** — remove a step.

Your edits appear in the live preview and in the report's **Print / Save PDF** output
(the button at the top-right of the report), which is what you send to the client. The
separate **Download HTML** button in the sidebar saves the original AI draft, so make
your edits then use **Print / Save PDF** to capture them.

---

## 7. Reviewing and sending (sign-off)

Before a report can be downloaded to send to a client, you must tick:

> ☐ **I've reviewed the figures against Klaviyo — this report is ready to send.**

The **Download HTML** button stays dimmed until you do. This is a deliberate check: the
AI writes the narrative, so a human should confirm the numbers and wording are right
before anything reaches a client. The sign-off resets whenever you generate a new report
or open a different one from history, so each report is vetted on its own.

---

## 8. Exports: HTML, source data, and Speedy Slides

- **Download HTML** — a standalone HTML file of the report. Open it in any browser; it
  needs no server. Use the report's **Print / Save PDF** button to produce a PDF — the
  layout is print-tuned (the print button hides itself and tables don't break across
  pages).
- **Source data (JSON)** — the exact Klaviyo data the report was built from, saved with
  the report. Download it for your records so a disputed number can always be traced back
  to its source.
- **Speedy Slides** — generates a **prompt** to paste into the Speedy Slides tool. It's a
  structured slide-by-slide outline (each slide has `SLIDE`, `TYPE`, `HEADLINE`,
  `CONTENT`, optional `CHART DATA`, and a `SPEAKER NOTE`). Copy it and paste it into
  Speedy Slides — it is **not** a finished deck for Google Slides/PowerPoint on its own.

---

## 9. Past reports

The sidebar lists the saved reports for the selected client (most recent first). Each
entry shows the report type, the date range, when it was generated, and **who generated
it**. Click one to reopen it — its incomplete-data warnings and source data come back
with it. Reports are stored centrally, so they're available from any device. Use the
delete (✕) control to remove one.

---

## 10. AI spend this month

At the bottom of the sidebar is an **AI spend** meter showing how much the agency's
shared AI account has spent this month against a monthly cap. When the cap is reached,
the meter notes it and generating a report asks you to confirm once before proceeding —
it's a budget heads-up, not a hard block. (Admins can change the cap via the
`SPEND_CAP_USD` worker setting.)

---

## 11. Admin: managing clients

Admins see two extra options in the client dropdown.

### Add new client

Opens a form with two fields:

- **Client name** — what staff will see in the dropdown.
- **Klaviyo private API key** — created in Klaviyo → Settings → API Keys → Create
  Private API Key. It needs **read** access to **Campaigns, Flows, and Metrics**. The key
  is validated when you add it and is stored as a server-side secret (never in the browser).

The "Add new client" option only appears for admins; if a non-admin somehow reaches it,
they get a clear "only admins can add clients" message.

### Offboard a client

A permanent cleanup for a client who has left the agency. Pick the client, **type their
exact name to confirm**, and the tool deletes the Klaviyo key, the client-list entry, and
**every saved report (and its source data)** for them. This can't be undone — download
anything you need to keep first.

---

## 12. Admin: managing users

The **Users** button opens the user panel:

- **Pending** — Google sign-ins waiting for approval. Click **Approve** to grant access.
- **Approved** — existing users. Click **Delete** to revoke someone's access (for
  example when a staff member leaves).

Each action confirms success or shows a clear error if it didn't go through.

---

## 13. Troubleshooting

**"Worker URL not configured — contact your admin."**
The tool doesn't know where its backend is. An admin needs to set the worker URL in
Settings (the gear icon, admin only).

**A report stalls or you wait more than ~2 minutes.**
After 90 seconds of silence the tool stops and says the generation stalled — just press
Generate again. If it keeps happening, ask Rowley to check the worker and the client's
Klaviyo key.

**"The report was too long and got cut off."**
The model hit its output limit. Each model has its own ceiling — Haiku and Sonnet allow
64k output tokens, Opus allows 128k — so **switching to Opus** or choosing a **shorter
date range** both help.

**"The report was cut off before it finished" / "didn't finish rendering."**
The connection dropped mid-generation. Nothing partial is saved — just generate again.

**Charts are blank in a downloaded report.**
The report loads Chart.js from `cdnjs.cloudflare.com`. If you're on a network that blocks
that, allow it (or open the report on a normal connection).

**Klaviyo permission / 403 error when adding a client.**
The Klaviyo private API key needs **read** access to Campaigns, Flows, and Metrics.
Regenerate the key with those scopes.

**"Incomplete data — review before sending."**
Not an error — a heads-up that part of the Klaviyo data was missing. Read the list and
decide whether the report is still good to send.

**You're suddenly back at the sign-in screen.**
Your 7-day session expired. Sign in again; your work and saved reports are safe.

**The Download button is dimmed.**
Tick the **"I've reviewed the figures"** sign-off box first.

**The AI spend meter says the cap is reached.**
This month's AI budget is used up. You can still generate (click Generate again to
confirm), but flag it to an admin if you need the cap raised.

---

> **Internal tool — Swanky Agency only. Not publicly released.**
