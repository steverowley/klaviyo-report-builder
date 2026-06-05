# Klaviyo Report Builder — User Guide

## Table of Contents

1. [What is Klaviyo Report Builder?](#1-what-is-klaviyo-report-builder)
2. [Getting Started](#2-getting-started)
   - [Signing in](#signing-in)
   - [Settings — entering your API keys](#settings--entering-your-api-keys)
3. [Generating a Report](#3-generating-a-report)
   - [Step 1 — Select a client](#step-1--select-a-client)
   - [Step 2 — Choose a report type](#step-2--choose-a-report-type)
   - [Step 3 — Set a comparison period (optional)](#step-3--set-a-comparison-period-optional)
   - [Step 4 — Choose your AI model](#step-4--choose-your-ai-model)
   - [Step 5 — Add context (optional but recommended)](#step-5--add-context-optional-but-recommended)
   - [Step 6 — Generate](#step-6--generate)
4. [Reading Your Report](#4-reading-your-report)
   - [Report sections](#report-sections)
   - [Understanding the metrics](#understanding-the-metrics)
5. [Editing and Customising Reports](#5-editing-and-customising-reports)
   - [Edit a recommendation](#edit-a-recommendation)
   - [Regenerate a recommendation](#regenerate-a-recommendation)
   - [Reorder recommendations](#reorder-recommendations)
   - [Delete a recommendation](#delete-a-recommendation)
   - [Add a new recommendation](#add-a-new-recommendation)
6. [Exporting Your Report](#6-exporting-your-report)
   - [Download as HTML](#download-as-html)
   - [Speedy Slides — generate a presentation outline](#speedy-slides--generate-a-presentation-outline)
7. [Past Reports](#7-past-reports)
8. [Adding a New Client](#8-adding-a-new-client)
9. [Admin — User Management](#9-admin--user-management)
10. [Understanding Costs](#10-understanding-costs)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. What is Klaviyo Report Builder?

Klaviyo Report Builder is an internal Swanky Agency tool that automatically generates professional email marketing performance reports from your clients' Klaviyo data. It:

- Pulls live campaign and flow data directly from Klaviyo via a secure proxy
- Uses Claude AI to write an editorial-quality HTML report with charts, insights, and recommendations
- Saves reports so they are accessible from any device
- Lets you edit, reorder, and regenerate individual recommendations inside the report

Reports take roughly 1–4 minutes to generate depending on the data volume and AI model selected.

---

## 2. Getting Started

### Signing in

Open the app at `https://steverowley.github.io/klaviyo-report-builder/`.

**Google Sign-In (recommended)**

Click **Sign in with Google** and choose your `@swankyagency.com` Google account. The tool is restricted to Swanky agency email addresses. If your account has not yet been approved by an admin you will see a "pending approval" message — contact an admin to get access.

**Admin sign-in**

If you are the system administrator you can also use the username + password form below the Google button. Admin credentials are set separately in the Cloudflare Worker configuration.

**Worker URL prompt**

If you are signing in for the first time in a new browser and the Worker URL is not pre-configured, a small input field will appear asking for the Worker URL. Enter the Cloudflare Worker URL provided by your admin and click **Continue**. You will not need to enter it again in this browser.

---

### Settings — entering your API keys

Once signed in, click the **gear icon** (top-right of the sidebar) to open Settings.

| Field | What to enter |
|-------|---------------|
| **Anthropic API key** | Your personal Anthropic API key (starts with `sk-ant-…`). This is used to call Claude and generate reports. Get one at [console.anthropic.com](https://console.anthropic.com). |
| **Worker URL** | The Cloudflare Worker URL. Usually pre-configured — only change if instructed by your admin. |

Click **Save**. Your Anthropic key is stored only in your browser's local storage and is never sent anywhere except directly to Anthropic's API.

> **Security note:** Never share your API key in chat, email, or any other channel. The Settings screen is the only place you should ever enter or view it.

---

## 3. Generating a Report

### Step 1 — Select a client

The **Client** dropdown at the top of the sidebar lists all clients connected to the tool. Select one. If you only have one client it will be selected automatically.

If you need to add a new client see [Adding a New Client](#8-adding-a-new-client).

---

### Step 2 — Choose a report type

Click one of the preset report type buttons:

| Button | Date range |
|--------|-----------|
| **Weekly** | Last 7 days |
| **Fortnightly** | Last 14 days |
| **Monthly** | Last 30 days |
| **Quarterly** | Last 90 days |
| **YTD** | 1 January to yesterday |
| **Custom** | You choose start and end dates |

For **Custom**, two date inputs will appear. Enter your start date and end date.

> **Tip:** Klaviyo data has a processing delay of approximately 24–48 hours for attributed revenue. For the most accurate revenue figures, set your end date to at least 2 days before today.

---

### Step 3 — Set a comparison period (optional)

Choose a comparison mode to add delta (change) metrics to the report:

| Option | What it compares |
|--------|-----------------|
| **None** | No comparison — report shows absolute figures only |
| **Previous Period** | Same date range immediately before the current period (e.g. if reporting on June, compares to May) |
| **Year on Year** | Same calendar dates in the previous year |

A comparison adds ↑/↓ percentage change indicators to the Period Snapshot cards and adds a dedicated **Comparison Analysis** section to the report.

---

### Step 4 — Choose your AI model

Three Claude models are available. All produce the same report structure — the difference is quality, detail, and cost:

| Model | Speed | Quality | Cost |
|-------|-------|---------|------|
| **Haiku 4.5** | Fastest (~1 min) | Good | Lowest (~$0.01–0.05 per report) |
| **Sonnet 4.6** | Moderate (~2 min) | Better | Mid (~$0.05–0.20 per report) |
| **Opus 4.7** | Slowest (~3–4 min) | Best | Higher (~$0.20–1.00 per report) |

For regular client reports **Sonnet** is a good default. Use **Haiku** for quick drafts or high-volume batches. Use **Opus** for board-level or pitch-quality reports where depth of insight matters most.

---

### Step 5 — Add context (optional but recommended)

The **Additional context** textarea lets you tell Claude things it cannot see in the Klaviyo data. The more context you provide, the more insightful and accurate the written commentary will be.

Examples of useful context:

- "This brand ran a 20% sitewide sale from 14–16 May."
- "They launched a new product line on 1 June — the Welcome Series was updated to reflect this."
- "Their Black Friday was extended to a full week this year."
- "Subscribers were migrated from Mailchimp at the start of this period — open rates are artificially elevated."
- "The Click-to-Open Rate drop is expected — we moved to plain-text campaigns this month."

This context appears in the Key Insights and Comparison Analysis sections, where Claude will directly reference and explain it.

---

### Step 6 — Generate

Click **Generate report**. The right-hand pane shows a live generation progress indicator with:

- Animated equalizer bars
- A progress percentage
- A rotating status message (e.g. "Knocking politely on Klaviyo's door", "Asking Claude nicely", "Formatting the numbers")
- An elapsed time counter

Generation completes in two phases:
1. **Data fetch** (roughly 5–15 seconds) — the Worker pulls your Klaviyo data
2. **AI generation** (roughly 1–4 minutes) — Claude streams the report HTML token by token

When finished, a completion overlay appears showing the token counts and cost. Click **View Report** to dismiss the overlay and read the report.

---

## 4. Reading Your Report

### Report sections

Every report contains these sections in order:

**1. Header**
Client name, report title, date range generated, and date range covered. A **Print** button is in the top-right corner.

**2. Executive Summary**
3–4 sentences capturing the most important findings: top-line revenue and engagement performance, the single biggest opportunity or risk, and a forward-looking statement.

**3. Period Snapshot**
Four headline cards:
- Total Revenue (£)
- Campaigns Sent
- New Subscribers
- Total Orders

Each card shows the absolute figure and, if a comparison period was selected, a ↑/↓ percentage change vs the comparison period.

**4. List Growth**
A bar chart of new subscribers added each day. Below the chart: total new subscribers, total unsubscribes, and net list growth for the period.

**5. Order Volume**
A line chart of total orders placed each day. Vertical event markers indicate key dates (e.g. Valentine's Day, Black Friday, product launches) so you can visually correlate campaigns to order spikes.

**6. Campaign Performance**
A table of every email campaign sent during the period, with:

| Column | Description |
|--------|-------------|
| Campaign | Campaign name |
| Recipients | Number of profiles the email was sent to |
| Delivered | Number successfully delivered |
| Open Rate | Unique opens ÷ delivered |
| Click Rate | Unique clicks ÷ delivered |
| CTOR | Click-to-open rate: unique clicks ÷ unique opens |
| CVR | Conversion rate: orders attributed ÷ delivered |
| Revenue | Total attributed revenue |

The table footer shows weighted averages across all campaigns.

**7. Flow Performance**
Same structure as Campaign Performance but for automated flows (Welcome Series, Abandoned Cart, Post-Purchase, etc.). The flow trigger (e.g. "Added to list", "Checkout started") is shown in smaller text below the flow name.

**8. Key Insights**
4–5 editorial paragraphs written by Claude, analysing what the data means. Claude correlates ecommerce events (sales, launches, seasonal moments) to the subscriber and order charts, references any context you provided, and calls out meaningful patterns — not just summaries of the numbers.

**9. Comparison Analysis** *(only shown if a comparison period was selected)*
3–5 sentences directly comparing this period to the comparison period, with attention to any structural differences (e.g. one period containing Black Friday and the other not).

**10. Next Steps for Growth**
Six numbered recommendations. Each shows:
- Priority level (High / Medium / Low)
- A short action-oriented title
- A 2–3 sentence explanation
- Supporting metric tags (e.g. "Open Rate 18.4%", "CTOR 2.1%")

See [Editing and Customising Reports](#5-editing-and-customising-reports) for how to edit, reorder, or regenerate these.

**11. Footer**
"Prepared by Swanky Agency for [Client Name]" with the date range.

---

### Understanding the metrics

**Open Rate** — Klaviyo reports *unique* open rate: the percentage of delivered emails opened by at least one unique recipient. Apple Mail Privacy Protection (MPP) inflates this figure for brands with a high proportion of Apple Mail users — treat open rates above ~50% with caution.

**Click Rate vs CTOR** — Click rate (clicks ÷ delivered) is an engagement metric that accounts for the whole audience. CTOR (clicks ÷ opens) measures how compelling the content was *to people who actually opened* — a better signal of content quality.

**CVR (Conversion Rate)** — Klaviyo attributes an order to a campaign or flow if the subscriber placed an order within the attribution window (default: 5 days for email). A high CVR relative to a low open rate can indicate a small but highly motivated segment.

**RPR (Revenue Per Recipient)** — Flow-specific metric: total flow revenue ÷ total flow recipients. Useful for comparing the commercial value of different flows regardless of volume.

**Revenue figures** — All revenue is attributed to Klaviyo using Klaviyo's own attribution model. It does not represent total store revenue — only orders where Klaviyo received credit.

---

## 5. Editing and Customising Reports

The **Next Steps for Growth** section (section 10) is fully interactive. All edits live inside the report iframe and are reflected immediately in any downloaded HTML.

### Edit a recommendation

Click the **pen icon** on any recommendation card. The title, description, and priority level all become editable in-place. Click outside or press Escape to save.

### Regenerate a recommendation

Click the **refresh icon** on any recommendation card. Claude (Haiku) will regenerate just that recommendation based on the surrounding report context. This takes roughly 10–20 seconds.

### Reorder recommendations

Drag any recommendation card up or down by its drag handle (left edge). The numbers update automatically.

### Delete a recommendation

Click the **× icon** on any recommendation card. The remaining cards re-number automatically.

### Add a new recommendation

Click the **+ Add recommendation** button at the bottom of the section. A new blank card appears that you can edit immediately.

---

## 6. Exporting Your Report

### Download as HTML

Click **Download HTML** in the sidebar (visible after a report is generated). A standalone `.html` file is saved to your downloads folder. This file contains all CSS and JavaScript inline — it will render correctly when opened in any browser, even without an internet connection, and can be attached to an email or uploaded to a client portal.

> **Tip:** All edits you made to recommendations in the browser are included in the download.

### Speedy Slides — generate a presentation outline

Click **Speedy Slides** in the sidebar. Claude Haiku reads the report HTML and generates a structured slide-by-slide outline in a format compatible with presentation tools. The outline includes:

- Slide number and title
- Slide type (title slide, data slide, insight slide, recommendations slide)
- Headline text
- Bullet-point content

Click **Copy to clipboard** and paste directly into your slide deck tool (Google Slides, PowerPoint, Keynote). This takes roughly 15–30 seconds.

---

## 7. Past Reports

The **Past reports** list appears in the sidebar below the configuration form (when no report is displayed). It shows the last 10 reports saved for the selected client, most recent first, with the report type and relative timestamp (e.g. "Monthly · 3 hours ago").

Click any entry to reload the full HTML of that report into the right pane. You can then download, edit, or export it exactly as you would a freshly generated report.

Reports are stored on the server for the life of the client account. They are not deleted automatically.

---

## 8. Adding a New Client

> **Admin access required.** Regular users cannot add clients.

In the Client dropdown, select **+ Add new client**. A modal appears with three fields:

1. **Client name** — Display name used in reports (e.g. "Acme Clothing").
2. **Klaviyo private API key** — The client's Klaviyo private API key. This is stored securely in the Cloudflare Worker and never sent to the browser after this point.
3. **Admin password** — Your admin password to authorise the action.

Click **Add client**. The tool validates the Klaviyo key against the real Klaviyo API before saving — if the key is invalid or lacks the required permissions you will see an error.

**Required Klaviyo API key scopes:**

The private API key must have read access to:
- Campaigns
- Flows
- Metrics
- Reports

In Klaviyo, go to **Account → Settings → API Keys → Create Private API Key** and enable read scopes for all four.

---

## 9. Admin — User Management

> **Admin access only.**

Click **Users** in the top-right of the sidebar (visible only to admins). A panel opens showing two lists:

**Pending approval** — Users who have signed in with Google but have not yet been approved. Click **Approve** to grant access or **Delete** to remove them.

**Approved users** — All active users. Click **Delete** to remove a user. Deleted users can re-register but will need approval again.

New `@swankyagency.com` Google sign-ins create a user account automatically, but they remain in the Pending queue until an admin approves them.

---

## 10. Understanding Costs

Every generated report has a cost in USD that comes out of your Anthropic API account. The cost breakdown is shown in the sidebar after generation, and also in the completion overlay.

**What drives cost:**

- **Model selected** — Haiku is cheapest, Opus most expensive (roughly 15× the price of Haiku)
- **Amount of Klaviyo data** — More campaigns and flows = more input tokens = higher cost
- **Report length** — Determined by the amount of data; typical reports are 10,000–20,000 output tokens

**Typical cost ranges:**

| Model | Typical cost per report |
|-------|------------------------|
| Haiku 4.5 | $0.01 – $0.05 |
| Sonnet 4.6 | $0.05 – $0.25 |
| Opus 4.7 | $0.25 – $1.50 |

These are estimates. Reports with many months of data or large campaign lists will cost more.

**Cost is billed to whoever's Anthropic key is configured in Settings.** There is no cost charged by the Report Builder tool itself.

---

## 11. Troubleshooting

### "API keys not configured — contact your admin"

Your Anthropic API key or Worker URL is missing. Open **Settings** (gear icon) and enter both. If you do not have an Anthropic API key, ask your admin — admins can configure a shared key that is distributed automatically on login.

---

### The report never starts generating / "Could not reach the worker"

The Cloudflare Worker URL is either missing or incorrect.

1. Open **Settings** and check the Worker URL. It should start with `https://` and end with `.workers.dev` (or a custom domain).
2. If you do not know the correct URL, ask your admin.
3. If the URL looks correct but the error persists, the Worker may be down — contact your admin.

---

### "Klaviyo data fetch failed" / 403 error

The Klaviyo API key for this client does not have the required permissions, or has been revoked.

1. In Klaviyo, go to **Account → Settings → API Keys**.
2. Find the key used for this client and check it has read access to Campaigns, Flows, Metrics, and Reports.
3. If the key is missing or revoked, create a new one and update the client via **+ Add new client** (this will overwrite the existing key for that client ID).

---

### "The report was too long and got cut off"

Claude reached its maximum output length before finishing the report. This is most common for:

- YTD or Quarterly reports with a very large number of campaigns (100+)
- Accounts with dozens of active flows

**Solutions:**

- Switch to **Sonnet** or **Opus**, which have higher effective output quality and may complete the report at the same token ceiling
- Narrow the date range slightly to reduce data volume
- If this happens consistently for a particular client, let your admin know — the token limit can be adjusted in the code

---

### "The model returned no report content"

Claude responded but without any HTML. This is rare and usually caused by a transient Anthropic API issue.

1. Wait 30 seconds and try generating again.
2. If it happens three times in a row, check [status.anthropic.com](https://status.anthropic.com) for any active incidents.

---

### Report generation is taking more than 5 minutes

After 2 minutes a message will appear in the sidebar: *"This is taking longer than expected…"* This is normal for Opus on large datasets. However, if the progress bar has been completely static (not incrementing at all) for more than 3 minutes, the stream may have stalled:

1. Click **Cancel**.
2. Check your internet connection.
3. Try again. If the same stall happens repeatedly, switch to Haiku or Sonnet as a test — if those work, the issue may be Anthropic's Opus capacity at that moment.

---

### The report charts are blank

Charts are rendered by Chart.js loaded from a CDN (`cdn.jsdelivr.net`). If your network blocks external CDNs, or if there is a brief CDN outage, charts will not render.

1. Reload the report (click the past-reports entry again, or regenerate).
2. If the charts are still blank, try opening the downloaded HTML file in a browser with unrestricted network access.

---

### I edited recommendations but the download does not include the changes

The **Download HTML** button captures the current state of the iframe, including all edits. If your edits are not appearing in the download:

1. Ensure you clicked **outside** the recommendation card after editing (this commits the change).
2. Wait a second after your last edit before clicking **Download HTML** — there is a brief save cycle.

---

### "Pending approval" message after signing in

Your account was auto-created when you signed in with Google but requires an admin to approve it. Contact your manager or admin at Swanky to approve your account. Once approved, sign out and sign back in.

---

### I can't see a client I expect to see

Clients are managed by admins. If a client is missing from your dropdown:

1. Confirm with your admin that the client has been added to the tool.
2. Try signing out and back in — the client list refreshes on sign-in.
3. If you are an admin and have just added the client, refresh the page.

---

### Report content looks wrong / insights reference the wrong brand

Check the **Additional context** field. If you are generating a report for a brand that shares similar campaigns or date ranges with another client you have recently reported on, Claude may weight its insights toward generic patterns. Adding specific brand context (product categories, tone of voice, known events) produces much more accurate and brand-specific insights.

---

### Clearing all keys and starting fresh

If you need to reset your local settings entirely, go to **Settings** and click **Clear all keys**. This removes your Anthropic API key and Worker URL from your browser. You will need to re-enter them before you can generate reports again.

---

*For technical issues not covered here, contact the Swanky development team.*
