import React, { useState, useRef, useEffect } from "react";

const ANTHROPIC_KEY = "swanky_anthropic_key";
const WORKER_URL = "swanky_worker_url";
const REPORT_CACHE_KEY = "swanky_report_cache";
const MAX_CACHE = 20;

// ── Ecommerce event calendar ─────────────────────────────────────────────────

function easterDate(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function nthWeekday(year, month, weekday, n) {
  const d = new Date(year, month, 1);
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(1 + diff + (n - 1) * 7);
  return d;
}

function lastWorkingDay(year, month) {
  const d = new Date(year, month + 1, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

function fmtEventDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fmtChartLabel(d) {
  const day = d.getDate();
  const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  return `${day} ${month}`;
}

function getEcommerceEvents(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const events = [];
  const MS = 86400000;

  const add = (d, name, type) => {
    if (d >= start && d <= end) events.push({ date: fmtEventDate(d), chartLabel: fmtChartLabel(d), name, type });
  };

  for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
    add(new Date(y, 0, 1),   "New Year's Day",          "holiday");
    add(new Date(y, 1, 14),  "Valentine's Day",          "ecommerce");
    add(new Date(y, 2, 8),   "International Women's Day","ecommerce");

    const easter = easterDate(y);
    add(new Date(easter.getTime() - 2 * MS), "Good Friday",          "holiday");
    add(easter,                               "Easter Sunday",        "holiday");
    // UK Mothering Sunday = 3 Sundays before Easter
    add(new Date(easter.getTime() - 21 * MS), "UK Mother's Day",      "ecommerce");

    add(nthWeekday(y, 5, 0, 3), "Father's Day",          "ecommerce"); // 3rd Sunday June
    add(new Date(y, 6, 15),  "Amazon Prime Day (approx)","ecommerce");
    add(new Date(y, 7, 28),  "Bank Holiday (approx)",    "holiday");
    add(new Date(y, 8, 1),   "Back to School",           "ecommerce");
    add(new Date(y, 9, 31),  "Halloween",                "ecommerce");
    add(new Date(y, 10, 11), "Singles' Day",             "ecommerce");

    // Black Friday = day after 4th Thursday of November
    const blackFriday = new Date(nthWeekday(y, 10, 4, 4).getTime() + MS);
    add(blackFriday,                                "Black Friday",     "ecommerce");
    add(new Date(blackFriday.getTime() + MS),       "Black Friday Weekend","ecommerce");
    add(new Date(blackFriday.getTime() + 2 * MS),   "Black Friday Weekend","ecommerce");
    add(new Date(blackFriday.getTime() + 3 * MS),   "Cyber Monday",     "ecommerce");

    add(new Date(y, 11, 24), "Christmas Eve",     "holiday");
    add(new Date(y, 11, 25), "Christmas Day",     "holiday");
    add(new Date(y, 11, 26), "Boxing Day",        "ecommerce");
    add(new Date(y, 11, 27), "Post-Christmas sale","ecommerce");
    add(new Date(y, 11, 31), "New Year's Eve",    "holiday");

    // End-of-month payday (last working day each month)
    for (let m = 0; m < 12; m++) {
      const pd = lastWorkingDay(y, m);
      if (pd >= start && pd <= end) {
        const mname = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m];
        events.push({ date: fmtEventDate(pd), chartLabel: fmtChartLabel(pd), name: `${mname} payday`, type: "payday" });
      }
    }
  }

  return events
    .filter((e, i, arr) => arr.findIndex(x => x.date === e.date && x.name === e.name) === i)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ─────────────────────────────────────────────────────────────────────────────

function writeSlidesCache(key, slidesPrompt) {
  try {
    const store = JSON.parse(localStorage.getItem(REPORT_CACHE_KEY) || "{}");
    if (store[key]) {
      store[key].slidesPrompt = slidesPrompt;
      localStorage.setItem(REPORT_CACHE_KEY, JSON.stringify(store));
    }
  } catch {}
}

function cacheKey(clientId, start, end, comparisonMode) {
  return `${clientId}|${start}|${end}|${comparisonMode}`;
}
function readCache(key) {
  try { return JSON.parse(localStorage.getItem(REPORT_CACHE_KEY) || "{}")[key] || null; }
  catch { return null; }
}
function writeCache(key, html, meta) {
  try {
    const store = JSON.parse(localStorage.getItem(REPORT_CACHE_KEY) || "{}");
    store[key] = { html, generatedAt: new Date().toISOString(), ...meta };
    const entries = Object.entries(store).sort((a, b) => new Date(b[1].generatedAt) - new Date(a[1].generatedAt));
    localStorage.setItem(REPORT_CACHE_KEY, JSON.stringify(Object.fromEntries(entries.slice(0, MAX_CACHE))));
  } catch {}
}
function relativeTime(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function KlaviyoReportBuilder({ onOpenSettings, settingsVersion }) {
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientsError, setClientsError] = useState("");
  const [reportType, setReportType] = useState("Monthly");
  const [comparisonMode, setComparisonMode] = useState("Previous Period");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [cachedInfo, setCachedInfo] = useState(null); // {generatedAt, key} when showing cached
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportHtml, setReportHtml] = useState("");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [loadingLine, setLoadingLine] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [justFinished, setJustFinished] = useState(false);
  const [lastUsage, setLastUsage] = useState(null);
  const [lastDuration, setLastDuration] = useState(null);
  const [slidesPrompt, setSlidesPrompt] = useState("");
  const [isCreatingSlides, setIsCreatingSlides] = useState(false);
  const [slidesProgress, setSlidesProgress] = useState(0);
  const [showSlidesModal, setShowSlidesModal] = useState(false);
  const [slidesCopied, setSlidesCopied] = useState(false);
  const [regenSid, setRegenSid] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [regenProgress, setRegenProgress] = useState(0);
  const slidesProgressTimerRef = useRef(null);
  const regenProgressTimerRef = useRef(null);
  const iframeRef = useRef(null);
  const progressTimerRef = useRef(null);
  const lineTimerRef = useRef(null);
  const elapsedTimerRef = useRef(null);
  const abortControllerRef = useRef(null);
  const requestIdRef = useRef(0);

  // Loading lines, paired with the progress range during which they appear.
  // Tone: dry, editorial, faintly amused, never marketing-speak.
  const loadingLines = [
    { range: [0, 6], text: "Knocking politely on Klaviyo's door" },
    { range: [6, 12], text: "Producing credentials, removing hat" },
    { range: [12, 20], text: "Locating the campaign ledger" },
    { range: [20, 28], text: "Counting open rates by candlelight" },
    { range: [28, 36], text: "Tallying clicks, one by one" },
    { range: [36, 44], text: "Asking the flows how they've been" },
    { range: [44, 52], text: "Reconciling revenue against expectation" },
    { range: [52, 60], text: "Comparing this period to its former self" },
    { range: [60, 68], text: "Setting the table in Ovo" },
    { range: [68, 76], text: "Polishing the numerals until they gleam" },
    { range: [76, 84], text: "Composing the executive summary" },
    { range: [84, 92], text: "Drafting recommendations, considered" },
    { range: [92, 100], text: "A final, careful proofread", hold: true },
    { range: [92, 100], text: "Adjusting the kerning, by hand", hold: true },
    { range: [92, 100], text: "Triple-checking the conversion rate", hold: true },
    { range: [92, 100], text: "Considering, at length, the comma", hold: true },
    { range: [92, 100], text: "A second opinion on the line break", hold: true },
    { range: [92, 100], text: "Folding the corners of the page", hold: true },
    { range: [92, 100], text: "Letting the ink dry properly", hold: true },
    { range: [92, 100], text: "One more pass for good measure", hold: true },
  ];

  const lineForProgress = (p) => {
    const found = loadingLines.find(({ range, hold }) => !hold && p >= range[0] && p < range[1]);
    return found ? found.text : null;
  };

  const holdingLines = loadingLines.filter((l) => l.hold);

  const reportTypes = ["Fortnightly", "Monthly", "YTD", "Custom"];
  const comparisonModes = ["None", "Previous Period", "Year on Year"];

  const computeDateRange = () => {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() - 1);
    let start = new Date(end);

    if (reportType === "Fortnightly") {
      start.setDate(end.getDate() - 13);
    } else if (reportType === "Monthly") {
      start.setDate(end.getDate() - 29);
    } else if (reportType === "YTD") {
      start = new Date(today.getFullYear(), 0, 1);
    } else if (reportType === "Custom") {
      if (customStart && customEnd) {
        start = new Date(customStart);
        end.setTime(new Date(customEnd).getTime());
      }
    }

    return {
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    };
  };

  const computeComparisonRange = (start, end) => {
    if (comparisonMode === "None") return null;
    const startDate = new Date(start);
    const endDate = new Date(end);
    const days = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

    let compStart, compEnd;
    if (comparisonMode === "Previous Period") {
      compEnd = new Date(startDate);
      compEnd.setDate(compEnd.getDate() - 1);
      compStart = new Date(compEnd);
      compStart.setDate(compStart.getDate() - (days - 1));
    } else {
      compStart = new Date(startDate);
      compStart.setFullYear(compStart.getFullYear() - 1);
      compEnd = new Date(endDate);
      compEnd.setFullYear(compEnd.getFullYear() - 1);
    }

    return {
      start: compStart.toISOString().split("T")[0],
      end: compEnd.toISOString().split("T")[0],
    };
  };

  const accountName = clients.find(c => c.id === selectedClientId)?.name ?? "";

  const buildSystemPrompt = () => `You are generating a Klaviyo email marketing performance report for "${accountName}".
Produce a complete, self-contained HTML report. Follow every instruction below exactly.

━━━ FONTS ━━━
Load via Google Fonts:
<link href="https://fonts.googleapis.com/css2?family=Ovo&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300;1,9..40,400&display=swap" rel="stylesheet">
Also load Chart.js in <head> (not body): <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
Headings (h2), card values, step titles: Ovo. All other text: DM Sans.

━━━ COLOURS (use these exact hex values) ━━━
Page bg: #fff. Primary: #0a0a0a. Body text: #1a1a1a. Muted: #555. Label: #999. Very muted: #aaa.
Card bg: #f7f6f3. Divider: #e0e0da. Row divider: #f0f0ec. Section rule: #e8e8e4.
Delta positive: #2a7a4f (inline text only). Delta negative: #a33 (inline text only). Delta neutral: #999.

━━━ PAGE ━━━
body { margin:0; padding:40px 48px; background:#fff; font-family:'DM Sans',sans-serif; color:#1a1a1a; font-size:13px; }
font-variant-numeric:tabular-nums on all numeric table cells.

━━━ SECTION HEADINGS ━━━
h2 { font-family:'Ovo',serif; font-size:22px; font-weight:400; color:#0a0a0a; margin:36px 0 16px; border-bottom:1px solid #e8e8e4; padding-bottom:8px; }

━━━ SECTIONS (all 11, in this order) ━━━

**1. HEADER**
White bg, border-bottom:2px solid #0a0a0a, padding-bottom:32px, margin-bottom:36px.
Top row flex space-between:
  Left: <img src="https://swankyagency.com/wp-content/uploads/2022/05/swanky-2020-black.png" style="height:40px;display:block">
  Right: <button onclick="window.print()" style="position:fixed;top:16px;right:16px;background:#0a0a0a;color:#fff;border:none;padding:8px 18px;font-family:'DM Sans',sans-serif;font-size:10px;font-weight:500;letter-spacing:0.16em;text-transform:uppercase;cursor:pointer;z-index:100">Print / Save PDF</button>
Then: "Email Marketing Report" — DM Sans 10px weight 500 letter-spacing:0.14em uppercase #888 margin-bottom:10px
Title: Ovo 40px weight 400 #0a0a0a line-height:1.15 margin-bottom:6px — "Klaviyo ${reportType}<br>Performance Report"
Client: DM Sans 12px weight 300 #888 margin-bottom:20px — "${accountName}"
Meta bar: border-top:0.5px solid #e0e0da padding-top:10px flex space-between —
  Left: "Generated [D MMM YYYY]" DM Sans 11px #aaa
  Right: "[start D MMM YYYY] to [end D MMM YYYY]" DM Sans 12px #555

**2. EXECUTIVE SUMMARY**
<h2>Executive Summary</h2>
3–4 sentences of top-line narrative a time-pressed reader can absorb in 20 seconds. Lead with the single most important number or finding, then the key opportunity or risk, then one forward-looking sentence. Plain <p> tags: font-size:15px;line-height:1.8;color:#2a2a2a;font-weight:300;margin:0 0 36px. Bold key figures with <strong style="font-weight:500">.

**3. PERIOD SNAPSHOT**
<h2>Period Snapshot</h2>

4-col grid gap:12px margin-bottom:32px. Each card: background:#f7f6f3; border-radius:3px; padding:16px 18px; border-left:2px solid #0a0a0a.
  Label: DM Sans 10px weight 500 letter-spacing:0.08em uppercase #999 margin-bottom:8px
  Value: Ovo 26px weight 400 #0a0a0a line-height:1
  Delta: DM Sans 11px margin-top:4px — #2a7a4f if positive, #a33 if negative, #999 neutral
  Sub-text: DM Sans 11px #aaa margin-top:2px
Delta format for all cards: compute pct = ((current − prev) / prev × 100). Show "↑ +X.X% vs prev" (#2a7a4f) or "↓ −X.X% vs prev" (#a33). Sub-text shows absolute: "X vs Y prev". If prev is 0 show absolute change only (no division).
Cards:
  TOTAL REVENUE — sum period.flows[].conversion_value + campaign conversion values. £X,XXX.XX. If comparison available: delta % vs comparison total revenue.
  CAMPAIGNS SENT — period.campaigns.length. Delta: show count change vs comparison ("+X vs prev"). Sub "No sends this period" if zero.
  NEW SUBSCRIBERS — sum(aggregates.subscribers.counts) or "—". Delta % if comparison.aggregates?.subscribers available.
  TOTAL ORDERS — sum(aggregates.orders.counts) or "—". Delta % if comparison.aggregates?.orders available.

**4. LIST GROWTH** (skip entirely if aggregates.subscribers is null)
<h2>List Growth</h2>
Sub-label "New Subscribers Per Day" DM Sans 10px weight 500 uppercase #999 margin-bottom:8px.
Container div: position:relative; height:180px; margin-bottom:16px. <canvas id="subChart"></canvas>
3-col grid gap:12px. Each stat card (same card style as Period Snapshot):
  NEW SUBSCRIBERS — sum(aggregates.subscribers.counts)
    Delta: if comparison.aggregates?.subscribers non-null: pct = ((period_subs − comp_subs) / comp_subs × 100); show "↑ +X.X%" or "↓ −X.X%" with sub-text "X vs Y prev"
  UNSUBSCRIBES — sum(aggregates.unsubscribes.counts) or "—"
    Delta: same percentage pattern using comparison.aggregates?.unsubscribes if available
  NET GROWTH — (period_subs − period_unsubs); prefix "+" if positive
    Delta: if comparison available: pct vs comp_net; show with arrow and sub-text

**5. ORDER VOLUME** (skip entirely if aggregates.orders is null)
<h2>Order Volume</h2>
Sub-label "Orders Per Day". Container height:180px. <canvas id="orderChart"></canvas>
Line chart: { data: aggregates.orders.counts, borderColor:'#555', backgroundColor:'rgba(80,80,80,0.08)', fill:true, tension:0.4, pointRadius:3, pointBackgroundColor:'#555', pointBorderColor:'#fff', pointBorderWidth:1.5 }
Same scale options as bar chart.

━━━ CHART INITIALISATION ━━━
At the very bottom of <body>, after ALL html sections, place ONE <script> block (no DOMContentLoaded wrapper needed — all canvas elements already exist at this point).
Wrap EACH chart in its own independent try/catch so a failure in one cannot affect the other:
try{
  var subChart=new Chart(document.getElementById('subChart'),{type:'bar',data:{labels:[/*"D MMM" dates*/],datasets:[{data:[/*counts*/],backgroundColor:'#0a0a0a',borderRadius:2,barPercentage:0.7}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#aaa',font:{size:10}}},y:{beginAtZero:true,grid:{color:'rgba(0,0,0,0.06)'},ticks:{color:'#aaa',font:{size:10}}}}}});
  try{addEventMarkers(subChart,window.CHART_EVENTS||[]);}catch(e){}
}catch(e){}
try{
  var orderChart=new Chart(document.getElementById('orderChart'),{type:'line',data:{labels:[/*"D MMM" dates*/],datasets:[{data:[/*counts*/],borderColor:'#555',backgroundColor:'rgba(80,80,80,0.08)',fill:true,tension:0.4,pointRadius:3,pointBackgroundColor:'#555',pointBorderColor:'#fff',pointBorderWidth:1.5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#aaa',font:{size:10}}},y:{beginAtZero:true,grid:{color:'rgba(0,0,0,0.06)'},ticks:{color:'#aaa',font:{size:10}}}}}});
  try{addEventMarkers(orderChart,window.CHART_EVENTS||[]);}catch(e){}
}catch(e){}
Fill in the actual labels and data from the Klaviyo data. The addEventMarkers function and window.CHART_EVENTS are pre-injected — do NOT define them yourself.

**6. CAMPAIGN PERFORMANCE**
<h2>Campaign Performance</h2>
period.campaigns is a pre-normalised flat array: [{campaign_name, send_channel, recipients, delivered, open_rate, click_rate, conversions, conversion_rate, conversion_value}]. Empty array = no campaigns.
If empty: dashed placeholder div (border:0.5px dashed #e0e0da; border-radius:3px; padding:20px; text-align:center; color:#999; font-size:13px; font-style:italic) — "No campaigns sent in this period."
If rows exist: table (CSS below). Columns: CAMPAIGN | SENT | DELIVERED | OPEN RATE | CLICK RATE | CTOR | CVR | REVENUE
  CTOR = click_rate/open_rate×100 formatted X.X% (or "—")
  CVR = conversion_rate×100 formatted X.X%
  Revenue: £X,XXX.XX (or "—" if zero)
  tfoot "Totals / Weighted Avg" — weighted averages

**7. FLOW PERFORMANCE**
<h2>Flow Performance</h2>
period.flows is pre-aggregated per flow: [{name, trigger, recipients, delivered, open_rate, click_rate, ctor, conversion_rate, conversion_value, rpr}]
Table (same CSS). Columns: FLOW | RECIPIENTS | DELIVERED | OPEN | CLICK | CTOR | CVR | REVENUE | RPR
  open_rate×100 = X.X%, click_rate×100 = X.X%, ctor×100 = X.X%, conversion_rate×100 = X.X%
  Revenue: £X,XXX.XX (or "—" if zero). RPR (rpr field): £X.XX (or "—" if zero).
  Flow name: DM Sans 13px #0a0a0a weight 500; below it trigger in #999 11px.
  tfoot "Totals / Weighted Avg" — recalculate from raw fields.

TABLE CSS (apply to both tables):
table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:12px}
thead th{font-size:10px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#999;padding:8px 10px;text-align:right;border-bottom:1px solid #e0e0da}
thead th:first-child{text-align:left}
tbody td{padding:10px;border-bottom:0.5px solid #f0f0ec;color:#1a1a1a;text-align:right}
tbody td:first-child{text-align:left}
tfoot td{padding:10px;font-size:11px;font-weight:600;background:#f7f6f3;border-top:1px solid #e0e0da;color:#0a0a0a;text-align:right}
tfoot td:first-child{text-align:left}
Revenue cells: font-family:'Ovo',serif;font-size:14px;font-weight:600

**8. KEY INSIGHTS**
<h2>Key Insights</h2>
4–5 paragraphs as plain <p> tags (font-size:13px;line-height:1.9;color:#1a1a1a;margin:0 0 14px). No wrapper div, no background, no inline colours. Bold key figures with <strong style="font-weight:600">. NO bullets, NO icons, NO emojis.
Where ecommerce events are provided, actively look for correlations in the data: revenue or order spikes near payday windows, subscriber lifts around gifting holidays, open-rate changes around sale events. Name the event and the observed metric movement explicitly (e.g. "Order volume lifted <strong>34%</strong> in the 3 days surrounding Valentine's Day…"). If the data shows no notable correlation, note that too briefly.

**9. COMPARISON ANALYSIS** (omit if no comparison data)
<h2>Comparison Analysis</h2>
Same: plain <p> tags only. 4–5 sentences. What changed, why, what to watch.
Reference ecommerce events where they explain year-on-year or period-on-period differences (e.g. "The prior period included Black Friday; the current period did not, which partly explains the revenue decline").

**10. NEXT STEPS FOR GROWTH**
<h2>Next Steps for Growth</h2>
Wrap all steps in <div id="stepsContainer">.
Each step is a <div class="step-wrapper" style="position:relative;cursor:grab"> containing the flex row:
  display:flex;gap:14px;padding:16px 0;border-bottom:0.5px solid #f0f0ec (last step: no border)
  .num: width:28px;height:28px;border-radius:50%;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:500;flex-shrink:0;margin-top:2px
  .pri: font-size:9px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:4px — contains TWO spans:
    <span class="pri-level" style="cursor:pointer;color:#0a0a0a">High priority</span><span style="color:#888"> — </span><span class="pri-area" style="color:#888">[Area]</span>
    (pri-level colour: #0a0a0a=High, #555=Medium, #999=Low)
  .stitle: font-family:'Ovo',serif;font-size:17px;font-weight:400;color:#0a0a0a;margin-bottom:4px
  .sdesc: font-size:12px;color:#606060;line-height:1.6;font-weight:300;margin-bottom:8px
  .tag: display:inline-block;font-size:10px;color:#555;background:#f7f6f3;border:1px solid #e0e0da;border-radius:3px;padding:2px 8px;margin:2px 4px 2px 0
  Each step: 2–4 .tag pills with specific supporting metrics.
  Controls div (position:absolute;top:14px;right:0;display:flex;gap:8px): three buttons (background:none;border:none;cursor:pointer;font-size:13px;color:#b8b8b8;padding:2px 4px):
    <button class="btn-edit" title="Edit">✎</button>
    <button class="btn-regen" title="Regenerate">↺</button>
    <button class="btn-del" title="Delete">×</button>

After stepsContainer:
<button id="addStep" style="margin-top:16px;background:none;border:1px solid #e0e0da;padding:8px 16px;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:#6b6b6b;cursor:pointer">+ Add recommendation</button>

Each .step-wrapper must have a unique data-sid attribute: data-sid="s0", "s1", etc. (assigned at render time, incrementing from 0).

In the same script block at the bottom of <body> (after the chart try/catch blocks), include this JS verbatim:
var dragSrc=null,sidSeq=document.querySelectorAll('#stepsContainer .step-wrapper').length;
var LEVELS=['High priority','Medium priority','Low priority'];
var LEVEL_COLORS={'High priority':'#0a0a0a','Medium priority':'#555','Low priority':'#999'};
function renum(){document.querySelectorAll('#stepsContainer .step-wrapper').forEach(function(w,i){w.querySelector('.num').textContent=i+1;});}
function selAll(el){if(!el)return;el.addEventListener('focus',function(){try{var r=document.createRange();r.selectNodeContents(this);var s=window.getSelection();s.removeAllRanges();s.addRange(r);}catch(e){}});}
function makeDraggable(w){
  w.setAttribute('draggable','true');
  w.addEventListener('dragstart',function(e){dragSrc=w;e.dataTransfer.effectAllowed='move';setTimeout(function(){w.style.opacity='0.4';},0);});
  w.addEventListener('dragend',function(){w.style.opacity='';document.querySelectorAll('#stepsContainer .step-wrapper').forEach(function(el){el.style.borderTop='';});});
  w.addEventListener('dragover',function(e){e.preventDefault();document.querySelectorAll('#stepsContainer .step-wrapper').forEach(function(el){el.style.borderTop='';});if(dragSrc!==w)w.style.borderTop='2px solid #0a0a0a';return false;});
  w.addEventListener('drop',function(e){e.stopPropagation();if(dragSrc&&dragSrc!==w){document.getElementById('stepsContainer').insertBefore(dragSrc,w);renum();}document.querySelectorAll('#stepsContainer .step-wrapper').forEach(function(el){el.style.borderTop='';});return false;});
}
function bindStep(w){
  var pl=w.querySelector('.pri-level');
  if(pl){pl.onclick=function(){var i=LEVELS.indexOf(pl.textContent.trim());pl.textContent=LEVELS[(i+1)%3];pl.style.color=LEVEL_COLORS[pl.textContent]||'#888';};}
  w.querySelector('.btn-edit').onclick=function(){
    var t=w.querySelector('.stitle'),d=w.querySelector('.sdesc'),pa=w.querySelector('.pri-area'),editing=t.isContentEditable==='true';
    [t,d,pa].forEach(function(el){if(el){el.contentEditable=editing?'false':'true';el.style.outline=editing?'':'1px dashed #ccc';}});
    if(!editing)t.focus();
    this.textContent=editing?'✎':'✓';
  };
  w.querySelector('.btn-regen').onclick=function(){
    var sid=w.dataset.sid;
    this.textContent='↺';this.disabled=true;this.classList.add('spinning');
    w.querySelector('.stitle').style.opacity='0.35';w.querySelector('.sdesc').style.opacity='0.35';
    var allSteps=Array.from(document.querySelectorAll('#stepsContainer .step-wrapper')).map(function(s){return s.querySelector('.stitle').textContent.trim()+': '+s.querySelector('.sdesc').textContent.trim();});
    window.parent.postMessage({type:'regenerate-step',sid:sid,title:w.querySelector('.stitle').textContent.trim(),desc:w.querySelector('.sdesc').textContent.trim(),allSteps:allSteps},'*');
  };
  w.querySelector('.btn-del').onclick=function(){w.remove();renum();};
  selAll(w.querySelector('.stitle'));selAll(w.querySelector('.sdesc'));selAll(w.querySelector('.pri-area'));
  makeDraggable(w);
}
document.querySelectorAll('#stepsContainer .step-wrapper').forEach(bindStep);
window.addEventListener('message',function(e){
  if(e.data&&e.data.type==='step-regenerated'){
    var w=document.querySelector('#stepsContainer .step-wrapper[data-sid="'+e.data.sid+'"]');
    if(!w)return;
    w.querySelector('.stitle').textContent=e.data.title;w.querySelector('.sdesc').textContent=e.data.desc;
    w.querySelector('.stitle').style.opacity='';w.querySelector('.sdesc').style.opacity='';
    var rb=w.querySelector('.btn-regen');rb.textContent='↺';rb.disabled=false;rb.classList.remove('spinning');
  }
});
document.getElementById('addStep').onclick=function(){
  var idx=document.querySelectorAll('#stepsContainer .step-wrapper').length;
  var sid='s'+(sidSeq++);
  var w=document.createElement('div');w.className='step-wrapper';w.style.cssText='position:relative;cursor:grab';w.dataset.sid=sid;
  w.innerHTML='<div style="display:flex;gap:14px;padding:16px 0;border-bottom:0.5px solid #f0f0ec"><div class="num" style="width:28px;height:28px;border-radius:50%;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:500;flex-shrink:0;margin-top:2px">'+(idx+1)+'</div><div style="flex:1"><div class="pri" style="font-size:9px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:4px"><span class="pri-level" style="cursor:pointer;color:#555">Medium priority</span><span style="color:#888"> — </span><span class="pri-area" contenteditable="true" style="color:#888;outline:1px dashed #ccc">New</span></div><div class="stitle" contenteditable="true" style="font-family:\'Ovo\',serif;font-size:17px;font-weight:400;color:#0a0a0a;margin-bottom:4px;outline:1px dashed #ccc">New recommendation</div><div class="sdesc" contenteditable="true" style="font-size:12px;color:#606060;line-height:1.6;font-weight:300;margin-bottom:8px;outline:1px dashed #ccc">Describe this recommendation…</div></div><div style="position:absolute;top:14px;right:0;display:flex;gap:8px"><button class="btn-edit" style="background:none;border:none;cursor:pointer;font-size:13px;color:#b8b8b8;padding:2px 4px" title="Edit">✓</button><button class="btn-regen" style="background:none;border:none;cursor:pointer;font-size:13px;color:#b8b8b8;padding:2px 4px" title="Regenerate">↺</button><button class="btn-del" style="background:none;border:none;cursor:pointer;font-size:13px;color:#b8b8b8;padding:2px 4px" title="Delete">×</button></div></div>';
  document.getElementById('stepsContainer').appendChild(w);bindStep(w);w.querySelector('.stitle').focus();
};

**11. FOOTER**
background:#0a0a0a;color:#555;padding:18px 48px;display:flex;justify-content:space-between;font-size:11px;margin:48px -48px -40px
Left: "Prepared by Swanky Agency for ${accountName}"
Right: "[start D MMM YYYY] to [end D MMM YYYY]"

Add to <style>: @keyframes spin{to{transform:rotate(-360deg)}} .spinning{display:inline-block;animation:spin 0.8s linear infinite;transform-origin:center center;line-height:1;vertical-align:middle;}

━━━ SCROLLBAR ━━━
In the <style> block: ::-webkit-scrollbar{width:5px;height:5px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:#c8c6c0;border-radius:0} ::-webkit-scrollbar-thumb:hover{background:#6b6b6b} *{scrollbar-width:thin;scrollbar-color:#c8c6c0 transparent}

━━━ OUTPUT RULES ━━━
Output ONLY a complete <!DOCTYPE html>…</html>. CSS in <style> in <head>. Chart.js CDN in <head>. Chart init script at bottom of <body> (direct execution, no DOMContentLoaded).
No markdown fences. No commentary before or after. Show "—" for missing values. Never invent numbers.`;

  const buildUserMessage = (klaviyoData) => {
    const range = computeDateRange();
    const comparison = computeComparisonRange(range.start, range.end);
    const events = getEcommerceEvents(range.start, range.end);
    const eventsBlock = events.length > 0
      ? `\nECOMMERCE EVENTS IN THIS PERIOD (use these for chart annotations and insight correlation):\n${events.map(e => `• ${e.date} (chart label: "${e.chartLabel}") — ${e.name} [${e.type}]`).join('\n')}\n`
      : "\nNo major ecommerce events fall within this period.\n";
    return `IMPORTANT: Read ALL data carefully before writing any HTML. Every number you output must come from the data.

Reporting period: ${range.start} to ${range.end} (${reportType})
${comparison ? `Comparison period: ${comparison.start} to ${comparison.end} (${comparisonMode})` : "No comparison period."}
${eventsBlock}
RAW KLAVIYO DATA:
${JSON.stringify(klaviyoData)}`;
  };

  const clearTimers = () => {
    [progressTimerRef, lineTimerRef, elapsedTimerRef].forEach((r) => {
      if (r.current) {
        clearInterval(r.current);
        r.current = null;
      }
    });
  };

  const handleGenerate = async () => {
    setError("");
    setStatusMessage("");

    if (!selectedClientId) {
      setError("Please select a client.");
      return;
    }

    if (reportType === "Custom" && (!customStart || !customEnd)) {
      setError("Custom range requires a start and end date.");
      return;
    }

    const anthropicKey = localStorage.getItem(ANTHROPIC_KEY);
    const workerUrl = localStorage.getItem(WORKER_URL);

    if (!anthropicKey || !workerUrl) {
      onOpenSettings();
      return;
    }

    setIsGenerating(true);
    setReportHtml("");
    setProgress(0);
    setLoadingLine("Knocking politely on Klaviyo's door");
    setElapsedSeconds(0);
    setStatusMessage("");
    setJustFinished(false);

    requestIdRef.current += 1;
    const myRequestId = requestIdRef.current;

    const startedAt = Date.now();
    let holdingLineIndex = 0;

    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    try {
      // ── Phase 1: fetch Klaviyo data via the Worker ──────────────────────────
      const range = computeDateRange();
      const comparison = computeComparisonRange(range.start, range.end);

      setLoadingLine("Producing credentials, removing hat");
      setProgress(5);

      const workerRes = await fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClientId,
          startDate: range.start,
          endDate: range.end,
          ...(comparison ? { comparisonStart: comparison.start, comparisonEnd: comparison.end } : {}),
        }),
        signal,
      });

      if (myRequestId !== requestIdRef.current) return;

      if (!workerRes.ok) {
        const errData = await workerRes.json().catch(() => ({}));
        throw new Error(`Klaviyo data fetch failed: ${errData.error || `HTTP ${workerRes.status}`}`);
      }

      const klaviyoData = await workerRes.json();

      if (myRequestId !== requestIdRef.current) return;

      // Worker succeeded — jump to 20% and start the composing phase timers
      setProgress(20);
      setLoadingLine("Locating the campaign ledger");

      const anthropicStartedAt = Date.now();
      const ceiling = 92;
      const expectedAnthropicMs = 115000;

      progressTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - anthropicStartedAt;
        const t = Math.min(elapsed / expectedAnthropicMs, 1);
        const eased = 1 - Math.pow(1 - t, 2.2);
        const next = Math.min(ceiling, 20 + eased * (ceiling - 20));
        setProgress(next);
        if (next < ceiling) {
          const line = lineForProgress(next);
          if (line) setLoadingLine(line);
        }
      }, 150);

      lineTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - anthropicStartedAt;
        if (elapsed >= expectedAnthropicMs * 0.85) {
          setLoadingLine(holdingLines[holdingLineIndex % holdingLines.length].text);
          holdingLineIndex += 1;
        }
      }, 4000);

      // ── Phase 2: send data to Anthropic, get back HTML ──────────────────────
      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "prompt-caching-2024-07-31,output-128k-2025-02-19",
          "anthropic-dangerous-direct-browser-access": "true",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 32000,
          system: [
            {
              type: "text",
              text: buildSystemPrompt(),
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: buildUserMessage(klaviyoData) }],
        }),
        signal,
      });

      if (myRequestId !== requestIdRef.current) return;

      if (!anthropicRes.ok) {
        let message = `Anthropic API error ${anthropicRes.status}`;
        try {
          const errData = await anthropicRes.json();
          message = errData.error?.message || message;
        } catch (_) {}
        throw new Error(message);
      }

      const data = await anthropicRes.json();

      if (myRequestId !== requestIdRef.current) return;

      const textBlock = data.content?.find((b) => b.type === "text");
      if (!textBlock?.text) {
        throw new Error("The model returned no report content. The prompt may have exceeded the context limit — try a shorter date range.");
      }
      if (data.stop_reason === "max_tokens") {
        throw new Error("The report was too long and got cut off (max tokens reached). Try a shorter date range or contact Rowley to increase the output limit.");
      }

      let rawHtml = textBlock.text;
      // Extract the HTML document — discard any preamble/reasoning text and trailing content
      const htmlStart = rawHtml.search(/<!DOCTYPE\s+html/i);
      if (htmlStart > 0) rawHtml = rawHtml.slice(htmlStart);
      const htmlEnd = rawHtml.search(/<\/html\s*>/i);
      if (htmlEnd > 0) rawHtml = rawHtml.slice(0, htmlEnd + "</html>".length);
      rawHtml = rawHtml.trim();

      // Inject event markers script — using JSON.stringify avoids all apostrophe/quote syntax errors
      const eventsForChart = getEcommerceEvents(range.start, range.end)
        .map(e => ({ label: e.chartLabel, name: e.name }));
      const annotationScript = `<script>
window.CHART_EVENTS=${JSON.stringify(eventsForChart)};
function addEventMarkers(chart,events){
  try{
    var wrapper=chart.canvas.parentNode;
    wrapper.style.position='relative';
    events.forEach(function(ev){
      var idx=chart.data.labels.indexOf(ev.label);
      if(idx===-1)return;
      var x=Math.round(chart.scales.x.getPixelForValue(idx));
      var col=document.createElement('div');
      col.style.cssText='position:absolute;top:0;bottom:0;left:'+x+'px;width:0;z-index:5;pointer-events:none';
      var rule=document.createElement('div');
      rule.style.cssText='position:absolute;inset:0;border-left:1px dashed rgba(10,10,10,0.15)';
      var pin=document.createElement('div');
      pin.style.cssText='position:absolute;top:3px;left:-4px;width:8px;height:8px;background:#fff;border:1px solid #0a0a0a;transform:rotate(45deg);pointer-events:auto;transition:background 0.1s;z-index:6;cursor:default';
      var tip=document.createElement('div');
      tip.style.cssText='display:none;position:absolute;top:18px;left:0;transform:translateX(-50%);background:#0a0a0a;color:#fff;font-size:10px;font-family:"DM Sans",sans-serif;font-weight:400;letter-spacing:0.08em;padding:5px 10px;white-space:nowrap;pointer-events:none;z-index:20';
      tip.textContent=ev.name;
      pin.addEventListener('mouseenter',function(){tip.style.display='block';pin.style.background='#0a0a0a';});
      pin.addEventListener('mouseleave',function(){tip.style.display='none';pin.style.background='#fff';});
      pin.appendChild(tip);col.appendChild(rule);col.appendChild(pin);wrapper.appendChild(col);
    });
  }catch(e){}
}
<\/script>`;
      rawHtml = rawHtml.replace(/<\/head>/i, annotationScript + '</head>');

      const u = data.usage || {};
      const costUsd =
        (u.input_tokens || 0) * 3 / 1_000_000 +
        (u.cache_creation_input_tokens || 0) * 3.75 / 1_000_000 +
        (u.cache_read_input_tokens || 0) * 0.30 / 1_000_000 +
        (u.output_tokens || 0) * 15 / 1_000_000;
      setLastUsage({
        inputTokens: u.input_tokens || 0,
        cacheCreationTokens: u.cache_creation_input_tokens || 0,
        cacheReadTokens: u.cache_read_input_tokens || 0,
        outputTokens: u.output_tokens || 0,
        costUsd,
      });

      clearTimers();
      setProgress(100);
      setLoadingLine("Ready");
      setLastDuration(Math.round((Date.now() - startedAt) / 1000));
      const key = cacheKey(selectedClientId, range.start, range.end, comparisonMode);
      writeCache(key, rawHtml, { clientId: selectedClientId, reportType });
      setCachedInfo(null);
      setReportHtml(rawHtml);
      setSlidesPrompt("");
      setJustFinished(true);

    } catch (e) {
      if (myRequestId !== requestIdRef.current) return;
      if (e.name === "AbortError") return;

      clearTimers();
      setError(e.message || "Something went wrong. Check your settings and try again.");
      setProgress(0);
      setJustFinished(false);
      setIsGenerating(false);
    }
  };

  const handleDismissCompletion = () => {
    setJustFinished(false);
    setIsGenerating(false);
    setProgress(0);
  };

  const handleNewReport = () => {
    setJustFinished(false);
    setIsGenerating(false);
    setProgress(0);
    setReportHtml("");
    setStatusMessage("");
    setError("");
    setLastUsage(null);
  };

  useEffect(() => {
    return () => clearTimers();
  }, []);

  // Listen for regenerate-step messages from the report iframe
  useEffect(() => {
    const handler = async (event) => {
      if (event.data?.type === 'cursor-move') {
        const iframe = iframeRef.current;
        if (iframe) {
          const rect = iframe.getBoundingClientRect();
          window.dispatchEvent(new CustomEvent('iframe-cursor-move', {
            detail: { x: rect.left + event.data.x, y: rect.top + event.data.y },
          }));
        }
        return;
      }
      if (event.data?.type !== 'regenerate-step') return;
      const { sid } = event.data;
      const anthropicKey = localStorage.getItem(ANTHROPIC_KEY);
      if (!anthropicKey) {
        setError("Anthropic key missing — open Settings to add it.");
        return;
      }

      setRegenSid(sid);
      setRegenProgress(0);
      const regenStartedAt = Date.now();
      const expectedRegenMs = 8000;
      regenProgressTimerRef.current = setInterval(() => {
        const t = Math.min((Date.now() - regenStartedAt) / expectedRegenMs, 1);
        setRegenProgress(Math.min(90, (1 - Math.pow(1 - t, 2)) * 90));
      }, 80);

      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 300,
            messages: [{
              role: 'user',
              content: `You are improving a set of email marketing growth recommendations. Here are all the current recommendations:\n${event.data.allSteps?.map((s,i)=>`${i+1}. ${s}`).join('\n')}\n\nOne recommendation is being replaced. Generate the single best NEW recommendation that would be most impactful for this account AND does not duplicate any of the others. Be specific and actionable. Reply with ONLY valid JSON: {"title":"...","desc":"..."}`,
            }],
          }),
        });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const data = await res.json();
        const text = data.content?.[0]?.text ?? '{}';
        const parsed = JSON.parse(text);
        clearInterval(regenProgressTimerRef.current);
        setRegenProgress(100);
        if (parsed.title && parsed.desc) {
          // Post back to iframe — try contentWindow first, fall back to srcdoc reload
          const iwin = iframeRef.current?.contentWindow;
          if (iwin) {
            iwin.postMessage({ type: 'step-regenerated', sid, title: parsed.title, desc: parsed.desc }, '*');
          }
        } else {
          throw new Error("Model returned unexpected format for recommendation.");
        }
      } catch (e) {
        clearInterval(regenProgressTimerRef.current);
        setError("Recommendation regeneration failed: " + (e.message || "unknown error"));
      } finally {
        setTimeout(() => { setRegenSid(null); setRegenProgress(0); }, 600);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Fetch client list from worker whenever settings change or on first load
  useEffect(() => {
    const workerUrl = localStorage.getItem(WORKER_URL);
    if (!workerUrl) return;
    setClientsError("");
    fetch(workerUrl)
      .then(r => r.json())
      .then(data => {
        setClients(Array.isArray(data) ? data : []);
        // Auto-select if only one client
        if (Array.isArray(data) && data.length === 1) {
          setSelectedClientId(data[0].id);
        }
      })
      .catch(() => setClientsError("Could not load clients from worker."));
  }, [settingsVersion]);

  // Auto-load from cache when params change
  useEffect(() => {
    if (!selectedClientId || isGenerating) return;
    if (reportType === "Custom" && (!customStart || !customEnd)) return;
    const range = computeDateRange();
    const key = cacheKey(selectedClientId, range.start, range.end, comparisonMode);
    const cached = readCache(key);
    if (cached) {
      setReportHtml(cached.html);
      setSlidesPrompt(cached.slidesPrompt || "");
      setCachedInfo({ generatedAt: cached.generatedAt, key });
    } else {
      setReportHtml("");
      setSlidesPrompt("");
      setCachedInfo(null);
    }
  }, [selectedClientId, reportType, comparisonMode, customStart, customEnd]);

  const handleCancel = () => {
    requestIdRef.current += 1;

    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch (_) {}
      abortControllerRef.current = null;
    }

    clearTimers();
    setIsGenerating(false);
    setProgress(0);
    setLoadingLine("");
    setJustFinished(false);
    setError("Request cancelled.");
    setStatusMessage("");
  };

  const handleCreateSlidesPrompt = async () => {
    const anthropicKey = localStorage.getItem(ANTHROPIC_KEY);
    if (!anthropicKey || !reportHtml) return;
    setIsCreatingSlides(true);
    setSlidesProgress(0);
    setSlidesPrompt("");
    const slidesStartedAt = Date.now();
    const expectedSlidesMs = 18000;
    slidesProgressTimerRef.current = setInterval(() => {
      const t = Math.min((Date.now() - slidesStartedAt) / expectedSlidesMs, 1);
      const eased = 1 - Math.pow(1 - t, 2);
      setSlidesProgress(Math.min(92, eased * 92));
    }, 100);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 4000,
          messages: [{
            role: "user",
            content: `You are converting an email marketing performance report into a structured presentation slide outline for a slide generation tool.

PRESENTATION BEST PRACTICES:
- One clear message per slide — never cram multiple ideas onto a single slide
- Maximum 4 bullet points per slide; each bullet max 10 words
- Hero metrics get their own slide with a big number and a single sentence of context
- Charts: extract the underlying data (labels + values) as a compact data block that the slide tool can render as a chart
- Executive summary → 2 slides max
- Recommendations → 1 slide per recommendation (or group 2 short ones if very similar)
- Opening slide: title, client name, period
- Closing slide: single strong takeaway + next step

FORMAT each slide exactly like this:
---
SLIDE [N]: [Slide Title]
TYPE: [title | metric | chart | bullets | comparison | recommendation | closing]
HEADLINE: [one punchy sentence — the single message of this slide]
CONTENT:
• [bullet or data line]
• [bullet or data line]
CHART DATA (only if TYPE is chart):
Labels: [comma-separated]
Series A "[label]": [comma-separated values]
Series B "[label]": [comma-separated values — only if comparison data exists]
SPEAKER NOTE: [one sentence of extra context for the presenter]
---

Now convert the following HTML report into slides. Extract all chart data from the JavaScript in the HTML. Do not invent numbers.

${reportHtml}`,
          }],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text ?? "";
      clearInterval(slidesProgressTimerRef.current);
      setSlidesProgress(100);
      setSlidesPrompt(text);
      setShowSlidesModal(true);
      // Persist alongside the report in cache
      const range = computeDateRange();
      const ck = cacheKey(selectedClientId, range.start, range.end, comparisonMode);
      writeSlidesCache(ck, text);
    } catch (e) {
      clearInterval(slidesProgressTimerRef.current);
      setError("Could not generate slides prompt: " + (e.message || "unknown error"));
    } finally {
      setIsCreatingSlides(false);
    }
  };

  useEffect(() => {
    if (!iframeRef.current || !reportHtml) return;
    // Inject cursor:none and a postMessage relay so the custom cursor works
    // inside the iframe (sandbox without allow-same-origin blocks contentDocument)
    const relayScript = `<script>document.addEventListener('mousemove',function(e){window.parent.postMessage({type:'cursor-move',x:e.clientX,y:e.clientY},'*');});<\/script>`;
    const injected = reportHtml.replace(
      /<\/head>/i,
      `<style>*{cursor:none!important}</style>${relayScript}</head>`
    );
    iframeRef.current.srcdoc = injected;
  }, [reportHtml]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onDown = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [dropdownOpen]);

  const handleDownload = () => {
    if (!reportHtml) return;
    const blob = new Blob([reportHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = accountName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    a.href = url;
    a.download = `${safeName}-${reportType.toLowerCase()}-report.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        height: "100vh",
        width: "100%",
        display: "flex",
        fontFamily: "'DM Sans', -apple-system, sans-serif",
        background: "#f8f6f2",
        color: "#0a0a0a",
        overflow: "hidden",
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: "340px",
          minWidth: "340px",
          height: "100%",
          background: "#ffffff",
          borderRight: "1px solid #ededed",
          padding: "32px 28px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header row: logo/title + gear icon */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px" }}>
          <div>
            <img
              src="https://swankyagency.com/wp-content/uploads/2022/05/swanky-2020-black.png"
              alt="Swanky"
              style={{ height: "24px", opacity: 0.9 }}
            />
            <div
              style={{
                fontFamily: "'Ovo', serif",
                fontSize: "26px",
                fontWeight: 400,
                marginTop: "20px",
                lineHeight: 1.15,
                letterSpacing: "-0.01em",
              }}
            >
              Klaviyo Report Builder
            </div>
            <div
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: "#6b6b6b",
                marginTop: "8px",
              }}
            >
              Performance, considered
            </div>
          </div>

          {/* Gear icon — opens Settings */}
          <button
            onClick={onOpenSettings}
            title="API key settings"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              color: "#b8b8b8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              marginTop: "2px",
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#6b6b6b")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#b8b8b8")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>

        <div style={{ height: "1px", background: "#ededed", margin: "0 0 24px" }} />

        <Field label="Client">
          {clientsError ? (
            <div style={{ fontSize: "11px", color: "#6b6b6b", fontStyle: "italic", fontFamily: "'Ovo', serif" }}>
              {clientsError}
            </div>
          ) : clients.length === 0 ? (
            <div style={{ fontSize: "11px", color: "#b8b8b8", fontStyle: "italic", fontFamily: "'Ovo', serif" }}>
              No clients configured in worker yet.
            </div>
          ) : (
            <div ref={dropdownRef} style={{ position: "relative" }}>
              <button
                onClick={() => setDropdownOpen(o => !o)}
                style={{
                  ...inputStyle,
                  width: "100%",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "#fff",
                }}
              >
                <span style={{ color: selectedClientId ? "#0a0a0a" : "#b8b8b8" }}>
                  {selectedClientId ? (clients.find(c => c.id === selectedClientId)?.name ?? "—") : "— select client —"}
                </span>
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink: 0, transform: dropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}>
                  <path d="M0 0l5 6 5-6z" fill="#6b6b6b" />
                </svg>
              </button>
              {dropdownOpen && (
                <div style={{
                  position: "absolute",
                  top: "calc(100% + 2px)",
                  left: 0,
                  right: 0,
                  background: "#fff",
                  border: "1px solid #ededed",
                  zIndex: 200,
                  maxHeight: "220px",
                  overflowY: "auto",
                }}>
                  {clients.length > 1 && (
                    <button
                      onClick={() => { setSelectedClientId(""); setDropdownOpen(false); }}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "9px 12px", background: selectedClientId === "" ? "#f8f6f2" : "transparent",
                        border: "none", borderBottom: "1px solid #f4f4f4",
                        fontFamily: "'DM Sans', sans-serif", fontSize: "12px",
                        color: "#b8b8b8", fontWeight: 400,
                      }}
                    >
                      — select client —
                    </button>
                  )}
                  {clients.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedClientId(c.id); setDropdownOpen(false); }}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "9px 12px", background: selectedClientId === c.id ? "#f8f6f2" : "transparent",
                        border: "none", borderBottom: "1px solid #f4f4f4",
                        fontFamily: "'DM Sans', sans-serif", fontSize: "12px",
                        color: "#0a0a0a", fontWeight: selectedClientId === c.id ? 500 : 400,
                      }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Field>

        <Field label="Report type">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            {reportTypes.map((t) => (
              <SegmentButton key={t} active={reportType === t} onClick={() => setReportType(t)}>
                {t}
              </SegmentButton>
            ))}
          </div>
        </Field>

        {reportType === "Custom" && (
          <>
            <Field label="Start date">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="End date">
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={inputStyle} />
            </Field>
          </>
        )}

        <Field label="Comparison">
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {comparisonModes.map((c) => (
              <SegmentButton key={c} active={comparisonMode === c} onClick={() => setComparisonMode(c)} fullWidth>
                {c}
              </SegmentButton>
            ))}
          </div>
        </Field>

        <div style={{ flex: 1 }} />

        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          style={{
            width: "100%",
            padding: "14px 20px",
            background: isGenerating ? "#6b6b6b" : "#0a0a0a",
            color: "#ffffff",
            border: "none",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "12px",
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            cursor: isGenerating ? "wait" : "pointer",
            transition: "background 0.2s ease",
            marginTop: "24px",
          }}
          onMouseEnter={(e) => { if (!isGenerating) e.currentTarget.style.background = "#2a2a2a"; }}
          onMouseLeave={(e) => { if (!isGenerating) e.currentTarget.style.background = "#0a0a0a"; }}
        >
          {isGenerating ? `Generating · ${Math.round(progress)}%` : "Generate report"}
        </button>

        {isGenerating && (
          <div style={{ marginTop: "12px" }}>
            <div style={{ width: "100%", height: "1px", background: "#ededed", position: "relative", overflow: "hidden" }}>
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  height: "100%",
                  width: `${progress}%`,
                  background: "#0a0a0a",
                  transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
            </div>
            <div
              style={{
                marginTop: "10px",
                fontSize: "10px",
                color: "#6b6b6b",
                fontStyle: "italic",
                fontFamily: "'Ovo', serif",
                lineHeight: 1.4,
                minHeight: "14px",
              }}
            >
              {loadingLine}
            </div>
            <div
              style={{
                marginTop: "8px",
                fontSize: "10px",
                color: "#6b6b6b",
                textTransform: "uppercase",
                letterSpacing: "0.16em",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {elapsedSeconds < 60 ? `${elapsedSeconds}s elapsed` : `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s elapsed`}
            </div>

            <button
              onClick={handleCancel}
              style={{
                marginTop: "16px",
                width: "100%",
                padding: "10px 16px",
                background: "transparent",
                color: "#0a0a0a",
                border: "1px solid #0a0a0a",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "10px",
                fontWeight: 500,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Cancel request
            </button>

            {elapsedSeconds >= 120 && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "10px 12px",
                  background: "#ededed",
                  fontSize: "11px",
                  lineHeight: 1.5,
                  color: "#2a2a2a",
                  fontFamily: "'Ovo', serif",
                  fontStyle: "italic",
                }}
              >
                This is taking longer than expected. The request may have stalled — consider cancelling and trying again. If it keeps happening, ask Rowley to check the Cloudflare Worker and verify the client's Klaviyo key is configured correctly.
              </div>
            )}
          </div>
        )}

        {reportHtml && !isGenerating && (
          <>
            <button
              onClick={handleDownload}
              style={{
                width: "100%",
                padding: "12px 20px",
                background: "transparent",
                color: "#0a0a0a",
                border: "1px solid #0a0a0a",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "11px",
                fontWeight: 500,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                cursor: "pointer",
                marginTop: "10px",
              }}
            >
              Download HTML
            </button>
            <button
              onClick={slidesPrompt && !isCreatingSlides ? () => setShowSlidesModal(true) : handleCreateSlidesPrompt}
              disabled={isCreatingSlides}
              style={{
                width: "100%",
                padding: "12px 20px",
                background: "transparent",
                color: isCreatingSlides ? "#b8b8b8" : "#0a0a0a",
                border: `1px solid ${isCreatingSlides ? "#ededed" : "#0a0a0a"}`,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "11px",
                fontWeight: 500,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                cursor: isCreatingSlides ? "wait" : "pointer",
                marginTop: "6px",
              }}
            >
              {isCreatingSlides ? "Generating…" : slidesPrompt ? "View Speedy Slides prompt" : "Speedy Slides prompt"}
            </button>
            {isCreatingSlides && (
              <div style={{ marginTop: "8px" }}>
                <div style={{ width: "100%", height: "1px", background: "#ededed", position: "relative", overflow: "hidden" }}>
                  <div style={{
                    position: "absolute", top: 0, left: 0, height: "100%",
                    width: `${slidesProgress}%`,
                    background: "#0a0a0a",
                    transition: "width 0.3s cubic-bezier(0.4,0,0.2,1)",
                  }} />
                </div>
                <div style={{ marginTop: "5px", fontSize: "10px", color: "#6b6b6b", fontStyle: "italic", fontFamily: "'Ovo', serif" }}>
                  Structuring for Speedy Slides…
                </div>
              </div>
            )}
          </>
        )}

        {lastUsage && !isGenerating && (
          <div style={{
            marginTop: "12px",
            padding: "10px 12px",
            borderTop: "0.5px solid #ededed",
            fontSize: "10px",
            color: "#6b6b6b",
            fontFamily: "'DM Sans', sans-serif",
            lineHeight: 1.8,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
              <span style={{ letterSpacing: "0.10em", textTransform: "uppercase" }}>Cost</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: "#0a0a0a", fontWeight: 500 }}>
                ${lastUsage.costUsd.toFixed(4)}
              </span>
            </div>
            {lastDuration != null && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                <span style={{ letterSpacing: "0.10em", textTransform: "uppercase" }}>Time taken</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {lastDuration < 60 ? `${lastDuration}s` : `${Math.floor(lastDuration / 60)}m ${lastDuration % 60}s`}
                </span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
              <span style={{ letterSpacing: "0.10em", textTransform: "uppercase" }}>Output tokens</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{lastUsage.outputTokens.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
              <span style={{ letterSpacing: "0.10em", textTransform: "uppercase" }}>Input tokens</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{lastUsage.inputTokens.toLocaleString()}</span>
            </div>
            {lastUsage.cacheReadTokens > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                <span style={{ letterSpacing: "0.10em", textTransform: "uppercase" }}>Cache read</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{lastUsage.cacheReadTokens.toLocaleString()}</span>
              </div>
            )}
            {lastUsage.cacheCreationTokens > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ letterSpacing: "0.10em", textTransform: "uppercase" }}>Cache write</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{lastUsage.cacheCreationTokens.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px 14px",
              border: "1px solid #0a0a0a",
              background: "#ededed",
              fontSize: "12px",
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}

        {statusMessage && !error && (
          <div
            style={{
              marginTop: "16px",
              fontSize: "11px",
              color: "#6b6b6b",
              letterSpacing: "0.05em",
              fontStyle: "italic",
              fontFamily: "'Ovo', serif",
            }}
          >
            {statusMessage}
          </div>
        )}
      </aside>

      {/* Right pane */}
      <main
        style={{
          flex: 1,
          height: "100%",
          background: "#f8f6f2",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {cachedInfo && !isGenerating && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 14px",
              marginBottom: "8px",
              background: "#ffffff",
              border: "1px solid #ededed",
              fontSize: "11px",
              color: "#6b6b6b",
              fontFamily: "'DM Sans', sans-serif",
              flexShrink: 0,
            }}
          >
            <span>
              <span style={{ textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 500, fontSize: "10px" }}>
                Cached
              </span>
              {" · Generated "}
              {relativeTime(cachedInfo.generatedAt)}
            </span>
            <button
              onClick={handleGenerate}
              style={{
                background: "none",
                border: "1px solid #b8b8b8",
                padding: "4px 12px",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "10px",
                fontWeight: 500,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#2a2a2a",
                cursor: "pointer",
              }}
            >
              Regenerate fresh
            </button>
          </div>
        )}

        {(regenSid || isCreatingSlides) && (
          <ActivityBanner
            label={isCreatingSlides ? "Generating Speedy Slides prompt…" : "Regenerating recommendation…"}
            progress={isCreatingSlides ? slidesProgress : regenProgress}
          />
        )}

        <div
          style={{
            flex: 1,
            background: "#ffffff",
            border: "1px solid #ededed",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {!reportHtml && !isGenerating && <EmptyState />}
          {isGenerating && (
            <LoadingState
              progress={progress}
              line={loadingLine}
              elapsed={elapsedSeconds}
              justFinished={justFinished}
              onDismissCompletion={handleDismissCompletion}
              onNewReport={handleNewReport}
              lastUsage={lastUsage}
            />
          )}
          {/* Render iframe whenever reportHtml exists so the ref is available for srcdoc */}
          {reportHtml && (
            <iframe
              ref={iframeRef}
              title="Klaviyo report preview"
              style={{ width: "100%", height: "100%", border: "none", background: "#ffffff", display: isGenerating ? "none" : "block" }}
              sandbox="allow-scripts allow-modals"
            />
          )}
        </div>
      </main>

      {/* Slides prompt modal */}
      {showSlidesModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10,10,10,0.55)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "32px",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowSlidesModal(false); }}
        >
          <div style={{
            background: "#ffffff",
            width: "min(760px, 100%)",
            height: "min(880px, 90vh)",
            display: "flex",
            flexDirection: "column",
            border: "1px solid #e0e0da",
          }}>
            {/* Modal header */}
            <div style={{
              padding: "18px 24px",
              borderBottom: "1px solid #ededed",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontFamily: "'Ovo', serif", fontSize: "22px", fontWeight: 400, color: "#0a0a0a" }}>
                  Speedy Slides Prompt
                </div>
                <div style={{ fontSize: "11px", color: "#999", marginTop: "2px", letterSpacing: "0.06em" }}>
                  Paste this into Speedy Slides
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => { setShowSlidesModal(false); handleCreateSlidesPrompt(); }}
                  style={{
                    padding: "8px 14px",
                    background: "transparent",
                    color: "#6b6b6b",
                    border: "1px solid #e0e0da",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: "10px",
                    fontWeight: 500,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  Regenerate
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(slidesPrompt).then(() => {
                      setSlidesCopied(true);
                      setTimeout(() => setSlidesCopied(false), 2000);
                    });
                  }}
                  style={{
                    padding: "8px 18px",
                    background: slidesCopied ? "#2a2a2a" : "#0a0a0a",
                    color: "#ffffff",
                    border: "none",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: "10px",
                    fontWeight: 500,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                >
                  {slidesCopied ? "Copied" : "Copy"}
                </button>
                <button
                  onClick={() => setShowSlidesModal(false)}
                  style={{
                    padding: "8px 14px",
                    background: "transparent",
                    color: "#6b6b6b",
                    border: "1px solid #e0e0da",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: "10px",
                    fontWeight: 500,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            {/* Modal body */}
            <textarea
              readOnly
              value={slidesPrompt}
              style={{
                flex: 1,
                padding: "20px 24px",
                border: "none",
                outline: "none",
                resize: "none",
                fontFamily: "'DM Sans', monospace, sans-serif",
                fontSize: "12px",
                lineHeight: 1.7,
                color: "#1a1a1a",
                background: "#fafaf8",
                overflowY: "auto",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityBanner({ label, progress }) {
  return (
    <div style={{
      padding: "10px 14px",
      marginBottom: "8px",
      background: "#ffffff",
      border: "1px solid #ededed",
      flexShrink: 0,
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "8px",
        fontFamily: "'DM Sans', sans-serif",
        fontSize: "11px",
        color: "#6b6b6b",
      }}>
        <span style={{ fontStyle: "italic", fontFamily: "'Ovo', serif" }}>{label}</span>
        <span style={{ fontVariantNumeric: "tabular-nums", fontSize: "10px", letterSpacing: "0.06em" }}>
          {Math.round(progress)}%
        </span>
      </div>
      <div style={{ width: "100%", height: "2px", background: "#ededed", position: "relative", overflow: "hidden" }}>
        <div style={{
          position: "absolute", top: 0, left: 0, height: "100%",
          width: `${progress}%`,
          background: "#0a0a0a",
          transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)",
        }} />
        <div style={{
          position: "absolute", top: 0, left: 0, height: "100%",
          width: `${progress}%`,
          background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
          animation: "shimmer 1.8s ease-in-out infinite",
          transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)",
        }} />
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #b8b8b8",
  background: "#ffffff",
  fontSize: "13px",
  fontFamily: "'DM Sans', sans-serif",
  color: "#0a0a0a",
  outline: "none",
  boxSizing: "border-box",
  borderRadius: 0,
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <div
        style={{
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.16em",
          color: "#6b6b6b",
          marginBottom: "8px",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function SegmentButton({ active, onClick, children, fullWidth }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "9px 10px",
        background: active ? "#0a0a0a" : "#ffffff",
        color: active ? "#ffffff" : "#2a2a2a",
        border: `1px solid ${active ? "#0a0a0a" : "#b8b8b8"}`,
        fontSize: "11px",
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: 500,
        letterSpacing: "0.06em",
        cursor: "pointer",
        transition: "all 0.15s ease",
        width: fullWidth ? "100%" : "auto",
        textAlign: "center",
      }}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "40px",
        color: "#6b6b6b",
      }}
    >
      <img
        src="https://swankyagency.com/wp-content/uploads/2022/05/swanky-2020-black.png"
        alt="Swanky"
        style={{ height: "28px", opacity: 0.5, marginBottom: "32px" }}
      />
      <div
        style={{
          fontFamily: "'Ovo', serif",
          fontSize: "44px",
          fontWeight: 300,
          color: "#0a0a0a",
          lineHeight: 1.1,
          maxWidth: "480px",
          letterSpacing: "-0.01em",
        }}
      >
        A quiet space, awaiting your numbers.
      </div>
      <div
        style={{
          marginTop: "20px",
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          color: "#6b6b6b",
        }}
      >
        Configure parameters &nbsp;·&nbsp; Generate report
      </div>
    </div>
  );
}

const BAR_HEIGHTS = [6,14,22,30,36,40,36,30,22,14,6,10,18,28,38,42,38,28,18,10,6,14];

function LoadingState({ progress, line, elapsed, justFinished, onDismissCompletion, onNewReport, lastUsage }) {
  const pct = Math.round(progress);
  const formatTime = (s) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);
  const showPatience = elapsed >= 90 && !justFinished;
  const containerRef = useRef(null);
  const barRefs = useRef([]);
  const [ripples, setRipples] = useState([]);

  // Mouse move → opacity spotlight (bars near cursor bright, far bars dim)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      barRefs.current.forEach((bar, i) => {
        if (!bar) return;
        const br = bar.getBoundingClientRect();
        const bx = br.left + br.width / 2 - rect.left;
        const dist = Math.abs(mx - bx);
        const opacity = 0.12 + 0.88 * Math.exp(-(dist * dist) / (2 * 85 * 85));
        bar.style.opacity = opacity;
      });
    };
    const onLeave = () => {
      barRefs.current.forEach(bar => { if (bar) bar.style.opacity = 1; });
    };
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => { el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave); };
  }, []);

  // Click → crosshair registration mark
  const handleClick = (e) => {
    if (justFinished) return;
    const rect = containerRef.current.getBoundingClientRect();
    const id = Date.now() + Math.random();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setRipples(r => [...r, { id, x, y }]);
    setTimeout(() => setRipples(r => r.filter(rip => rip.id !== id)), 700);
  };

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "48px 40px",
        position: "relative",
        overflow: "hidden",
        background: "#ffffff",
        animation: "loadIn 0.6s ease-out",
      }}
    >
      <FloatingNumerals />

      {/* Crosshair registration marks — SVG layer, pointer-events none */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 4, overflow: "visible" }}>
        {ripples.map(r => (
          <g key={r.id} transform={`translate(${r.x},${r.y})`} style={{ animation: "crossFade 0.6s ease-out forwards" }}>
            {/* Centre dot */}
            <circle cx="0" cy="0" r="1" fill="#0a0a0a" />
            {/* Vertical arm — draws from centre outward */}
            <line x1="0" y1="-16" x2="0" y2="16" stroke="#0a0a0a" strokeWidth="0.5"
              style={{ transformOrigin: "0px 0px", animation: "armV 0.18s ease-out forwards" }} />
            {/* Horizontal arm — draws from centre outward */}
            <line x1="-16" y1="0" x2="16" y2="0" stroke="#0a0a0a" strokeWidth="0.5"
              style={{ transformOrigin: "0px 0px", animation: "armH 0.18s ease-out forwards" }} />
          </g>
        ))}
      </svg>

      {/* Equalizer bars — mouse-reactive + continuously looping */}
      <div style={{
        display: "flex",
        alignItems: "flex-end",
        gap: "3px",
        height: "48px",
        marginBottom: "44px",
        zIndex: 2,
        animation: "loadIn 0.5s ease-out both",
      }}>
        {BAR_HEIGHTS.map((maxH, i) => (
          <div
            key={i}
            ref={el => barRefs.current[i] = el}
            style={{
              width: "2px",
              background: "#0a0a0a",
              borderRadius: "1px",
              height: "3px",
              animationName: "barPulse",
              animationDuration: `${1.1 + (i % 4) * 0.09}s`,
              animationDelay: `${(i / BAR_HEIGHTS.length) * 1.1}s`,
              animationTimingFunction: "ease-in-out",
              animationIterationCount: "infinite",
              animationDirection: "alternate",
              "--bar-max": `${maxH}px`,
            }}
          />
        ))}
      </div>

      {/* Title */}
      <div style={{
        fontFamily: "'Ovo', serif",
        fontSize: "36px",
        fontWeight: 400,
        color: "#0a0a0a",
        fontStyle: "italic",
        lineHeight: 1.15,
        marginBottom: "8px",
        zIndex: 2,
        animation: "loadIn 0.7s ease-out 0.15s both",
      }}>
        Composing your report
      </div>

      {/* Rotating loading line */}
      <div
        key={line}
        style={{
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.24em",
          color: "#b8b8b8",
          marginBottom: "44px",
          minHeight: "14px",
          fontFamily: "'DM Sans', sans-serif",
          animation: "fadeLine 0.5s ease-out",
          zIndex: 2,
        }}
      >
        {line}
      </div>

      {/* Progress section */}
      <div style={{ width: "min(360px, 60%)", zIndex: 2, animation: "loadIn 0.7s ease-out 0.25s both" }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "10px",
        }}>
          <span style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: "#c8c6c0",
          }}>
            {formatTime(elapsed)} elapsed
          </span>
          <span style={{
            fontFamily: "'Ovo', serif",
            fontSize: "28px",
            fontWeight: 400,
            color: "#0a0a0a",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}>
            {pct}<span style={{ fontSize: "13px", color: "#c8c6c0", marginLeft: "2px" }}>%</span>
          </span>
        </div>

        {/* Hairline progress bar */}
        <div style={{ width: "100%", height: "1px", background: "#ededed", position: "relative", overflow: "hidden" }}>
          <div style={{
            position: "absolute", top: 0, left: 0, height: "100%",
            width: `${progress}%`,
            background: "#0a0a0a",
            transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          }} />
          <div style={{
            position: "absolute", top: 0, left: 0, height: "100%",
            width: `${progress}%`,
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.8) 50%, transparent 100%)",
            animation: "shimmer 2.4s ease-in-out infinite",
            transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          }} />
        </div>

        {showPatience && (
          <div style={{
            marginTop: "28px",
            fontSize: "13px",
            color: "#aaa",
            fontStyle: "italic",
            fontFamily: "'Ovo', serif",
            lineHeight: 1.6,
            animation: "fadeLine 0.8s ease-out",
          }}>
            Still composing. Long periods with many flows can take a moment.
          </div>
        )}
      </div>

      <style>{`
        @keyframes barPulse {
          from { height: 3px; opacity: 0.2; }
          to { height: var(--bar-max); opacity: 0.85; }
        }
        @keyframes armV {
          from { transform: scaleY(0); }
          to   { transform: scaleY(1); }
        }
        @keyframes armH {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        @keyframes crossFade {
          0%   { opacity: 0; }
          15%  { opacity: 0.65; }
          55%  { opacity: 0.65; }
          100% { opacity: 0; }
        }
        @keyframes shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes fadeLine {
          from { opacity: 0; transform: translateY(2px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes loadIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {justFinished && <CompletionOverlay onDismiss={onDismissCompletion} onNewReport={onNewReport} lastUsage={lastUsage} />}
    </div>
  );
}

function CompletionOverlay({ onDismiss, onNewReport, lastUsage }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#f8f6f2",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
        animation: "overlayFadeIn 0.4s ease-out",
      }}
    >
      {/* Checkmark */}
      <svg
        width="48"
        height="48"
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
        style={{ marginBottom: "40px", opacity: 0, animation: "markIn 0.5s ease-out 0.3s forwards" }}
      >
        <circle
          cx="32" cy="32" r="30"
          fill="none" stroke="#0a0a0a" strokeWidth="1"
          strokeDasharray="190" strokeDashoffset="190"
          style={{ animation: "drawCircle 0.7s cubic-bezier(0.65, 0, 0.35, 1) 0.3s forwards" }}
        />
        <path
          d="M 18 33 L 28 43 L 46 23"
          fill="none" stroke="#0a0a0a" strokeWidth="1.5"
          strokeLinecap="square" strokeLinejoin="miter"
          strokeDasharray="50" strokeDashoffset="50"
          style={{ animation: "drawCheck 0.4s cubic-bezier(0.65, 0, 0.35, 1) 0.8s forwards" }}
        />
      </svg>

      {/* Hairline above title */}
      <div style={{
        width: "min(480px, 60%)",
        height: "1px",
        background: "#0a0a0a",
        transformOrigin: "left",
        transform: "scaleX(0)",
        animation: "drawHairline 0.5s cubic-bezier(0.65, 0, 0.35, 1) 1s forwards",
      }} />

      {/* Title */}
      <div style={{
        fontFamily: "'Ovo', serif",
        fontSize: "52px",
        fontWeight: 300,
        color: "#0a0a0a",
        letterSpacing: "-0.01em",
        fontStyle: "italic",
        lineHeight: 1.1,
        padding: "16px 0 12px",
        opacity: 0,
        animation: "fadeUp 0.6s ease-out 1.1s forwards",
      }}>
        Ready.
      </div>

      {/* Hairline below title */}
      <div style={{
        width: "min(480px, 60%)",
        height: "1px",
        background: "#0a0a0a",
        transformOrigin: "right",
        transform: "scaleX(0)",
        animation: "drawHairline 0.5s cubic-bezier(0.65, 0, 0.35, 1) 1.05s forwards",
      }} />

      {/* Subtitle */}
      <div style={{
        marginTop: "20px",
        fontSize: "10px",
        textTransform: "uppercase",
        letterSpacing: "0.24em",
        color: "#6b6b6b",
        opacity: 0,
        animation: "fadeUp 0.6s ease-out 1.3s forwards",
      }}>
        Your report is rendered below
      </div>

      {/* Buttons */}
      <div style={{
        marginTop: "36px",
        display: "flex",
        gap: "12px",
        opacity: 0,
        animation: "fadeUp 0.6s ease-out 1.5s forwards",
      }}>
        <button
          onClick={onDismiss}
          style={{
            padding: "12px 28px",
            background: "#0a0a0a",
            color: "#ffffff",
            border: "1px solid #0a0a0a",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "11px",
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "background 0.2s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2a2a")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#0a0a0a")}
        >
          View report
        </button>
        <button
          onClick={onNewReport}
          style={{
            padding: "12px 28px",
            background: "transparent",
            color: "#0a0a0a",
            border: "1px solid #0a0a0a",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "11px",
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "background 0.2s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#ededed")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          New report
        </button>
      </div>

      {lastUsage && (
        <div style={{
          marginTop: "28px",
          display: "flex",
          gap: "24px",
          opacity: 0,
          animation: "fadeUp 0.6s ease-out 1.7s forwards",
        }}>
          {[
            ["Cost", `$${lastUsage.costUsd.toFixed(4)}`],
            ["Output", lastUsage.outputTokens.toLocaleString() + " tk"],
            ...(lastUsage.cacheReadTokens > 0 ? [["Cache hit", lastUsage.cacheReadTokens.toLocaleString() + " tk"]] : []),
            ...(lastUsage.cacheCreationTokens > 0 ? [["Cache write", lastUsage.cacheCreationTokens.toLocaleString() + " tk"]] : []),
          ].map(([label, value]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.2em", color: "#b8b8b8", marginBottom: "3px" }}>{label}</div>
              <div style={{ fontSize: "11px", fontVariantNumeric: "tabular-nums", color: "#6b6b6b", letterSpacing: "0.04em" }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes overlayFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes drawHairline { to { transform: scaleX(1); } }
        @keyframes markIn { to { opacity: 1; } }
        @keyframes drawCircle { to { stroke-dashoffset: 0; } }
        @keyframes drawCheck { to { stroke-dashoffset: 0; } }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function FloatingNumerals() {
  const numerals = [
    { text: "12.4%", left: "8%", delay: 0, duration: 18, size: 22 },
    { text: "£48,290", left: "18%", delay: 5, duration: 22, size: 18 },
    { text: "0.84", left: "82%", delay: 2.5, duration: 20, size: 24 },
    { text: "↑ 6.2%", left: "88%", delay: 9, duration: 17, size: 16 },
    { text: "1,247", left: "5%", delay: 13, duration: 21, size: 20 },
    { text: "31.7%", left: "92%", delay: 7, duration: 19, size: 18 },
    { text: "£12.40", left: "12%", delay: 16, duration: 22, size: 16 },
    { text: "0.421", left: "78%", delay: 4, duration: 20, size: 22 },
  ];

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 1 }}>
      {numerals.map((n, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: n.left,
            bottom: "-40px",
            fontFamily: "'Ovo', serif",
            fontSize: `${n.size}px`,
            fontWeight: 400,
            color: "#0a0a0a",
            opacity: 0,
            fontVariantNumeric: "tabular-nums",
            animation: `floatUp ${n.duration}s ease-in-out ${n.delay}s infinite`,
            whiteSpace: "nowrap",
          }}
        >
          {n.text}
        </span>
      ))}
      <style>{`
        @keyframes floatUp {
          0% { transform: translateY(0); opacity: 0; }
          15% { opacity: 0.05; }
          85% { opacity: 0.05; }
          100% { transform: translateY(-100vh); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
