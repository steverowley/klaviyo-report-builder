import React, { useState, useRef, useEffect } from "react";

// localStorage key names — never change these without migrating existing users
const ANTHROPIC_KEY = "swanky_anthropic_key";
const KLAVIYO_KEY = "swanky_klaviyo_key";
const WORKER_URL = "swanky_worker_url";

export default function KlaviyoReportBuilder({ onOpenSettings }) {
  const [accountName, setAccountName] = useState("");
  const [reportType, setReportType] = useState("Monthly");
  const [comparisonMode, setComparisonMode] = useState("Previous Period");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportHtml, setReportHtml] = useState("");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [loadingLine, setLoadingLine] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [justFinished, setJustFinished] = useState(false);
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
    { range: [60, 68], text: "Setting the table in Cormorant Garamond" },
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

  const buildPrompt = (klaviyoData) => {
    const range = computeDateRange();
    const comparison = computeComparisonRange(range.start, range.end);

    return `You are generating a Klaviyo email marketing performance report for "${accountName}".

Reporting period: ${range.start} to ${range.end} (${reportType})
${comparison ? `Comparison period: ${comparison.start} to ${comparison.end} (${comparisonMode})` : "No comparison period."}

RAW KLAVIYO DATA:
${JSON.stringify(klaviyoData, null, 2)}

Produce a complete, polished HTML report matching the Swanky design system exactly. Follow every instruction below.

━━━ DESIGN SYSTEM ━━━
Fonts (load both via Google Fonts):
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500;1,600&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">

CSS variables — define these in :root and use exclusively:
--ink:#0a0a0a  --graphite:#2a2a2a  --ash:#6b6b6b  --silver:#b8b8b8  --bone:#ededed  --paper:#f8f6f2  --pearl:#ffffff

STRICTLY monochromatic — no green, red, blue, or any colour not in the palette above, including for deltas or priority tags.
Numbers: font-variant-numeric: tabular-nums on all numeric cells.
Deltas: "↑ 12.4% vs prior 14 days" — var(--graphite), no colour.
Section headings: Inter 11px uppercase letter-spacing 0.18em var(--ash), followed by 1px var(--bone) hairline, margin-bottom 24px.
Page: background var(--paper), max-width 1100px, margin 0 auto, padding 48px 40px.

━━━ SECTIONS (produce all 9 in this order) ━━━

**1. HEADER**
Top bar (display:flex justify-content:space-between align-items:center margin-bottom:32px):
  Left: <img src="https://swankyagency.com/wp-content/uploads/2022/05/swanky-2020-black.png" style="height:28px;display:block">
  Right: <button onclick="window.print()" style="background:var(--ink);color:var(--pearl);border:none;padding:8px 16px;font-family:'Inter',sans-serif;font-size:10px;font-weight:500;letter-spacing:0.16em;text-transform:uppercase;cursor:pointer">Print / Save PDF</button>

Below top bar:
  "EMAIL MARKETING REPORT" — Inter 10px uppercase letter-spacing 0.2em var(--ash), margin-bottom 12px
  Title "Klaviyo ${reportType} Performance Report" — Cormorant Garamond italic weight 300, font-size 52px, line-height 1.05, var(--ink), margin-bottom 8px
  Account name "${accountName}" — Inter 13px var(--ash), margin-bottom 24px
  1px var(--bone) hairline
  Two-col row (flex justify-content:space-between): "Generated [format today as D MMM YYYY]" left | "[start date formatted D MMM YYYY] to [end date D MMM YYYY]" right — both Inter 11px var(--ash), margin-top 12px

**2. PERIOD SNAPSHOT**
Heading "Period Snapshot".
4-column grid (gap:1px background:var(--bone) — so grid gaps appear as hairlines). Each card: background var(--pearl), padding 24px 28px.
  Card label: Inter 9px uppercase letter-spacing 0.2em var(--ash) margin-bottom 10px
  Card value: Cormorant Garamond 44px weight 300 var(--ink) line-height 1
  Sub-text / delta: Inter 11px var(--graphite) margin-top 6px

Cards:
  TOTAL REVENUE — sum conversion_value across all flow rows + all campaign rows. Format £X,XXX.XX. Delta vs comparison if available.
  CAMPAIGNS SENT — count of campaign rows in period.data.campaigns.data. If zero, sub-text "No sends this period".
  NEW SUBSCRIBERS — sum counts from aggregates.subscribers (the "data" array contains objects with "measurements" arrays; sum all count values). Show "—" if unavailable.
  TOTAL ORDERS — sum counts from aggregates.orders similarly. Show "—" if unavailable.

**3. LIST GROWTH** (skip entire section if aggregates.subscribers is null)
Heading "List Growth".
Sub-label "NEW SUBSCRIBERS PER DAY" — Inter 9px uppercase var(--ash) margin-bottom 8px.

Render this section using an inline <script> that runs on DOMContentLoaded.
The script reads the subscriber and unsubscribe data embedded as JSON in a <script type="application/json"> tag, then:
  a) Draws a BAR CHART into a <canvas id="subChart"> (width:100% height:160px, devicePixelRatio-aware).
     Chart area: left 40px (y-axis), bottom 28px (x-axis), right 8px, top 8px.
     Background: var(--pearl). Draw 4–5 light horizontal grid lines (1px #ededed) with y-axis labels (Inter 11px #6b6b6b).
     Bars: var(--ink) (#0a0a0a), 1px gap between bars, no rounding. Scale to max value.
     X-axis: show date labels (e.g. "21 Apr", "28 Apr", "4 May") at first, ~midpoint, last — Inter 10px #6b6b6b.
  b) Draws an UNSUBSCRIBES line chart overlaid in #b8b8b8 (silver) if unsubscribe data available.

Below canvas, 3 stat boxes (display:grid grid-template-columns:repeat(3,1fr) gap:1px background:var(--bone)):
  Each box: background var(--pearl) padding 20px 24px.
  Label: Inter 9px uppercase var(--ash). Value: Cormorant Garamond 36px weight 300 var(--ink).
  NEW SUBSCRIBERS | UNSUBSCRIBES | NET GROWTH (prefix "+" if positive, "−" if negative)

**4. ORDER VOLUME** (skip entire section if aggregates.orders is null)
Heading "Order Volume".
Sub-label "ORDERS PER DAY".

Same pattern: embed data as JSON, render via <script> into <canvas id="orderChart"> (width:100% height:130px).
  Chart area: left 40px, bottom 28px, right 8px, top 8px.
  Background: var(--pearl). Grid lines + y-axis labels same as above.
  Draw a SMOOTH AREA CHART: compute a cubic bezier or catmull-rom smooth polyline. Stroke: var(--ink) (#0a0a0a) strokeWidth 1.5. Fill area below line: #0a0a0a at opacity 0.07.
  X-axis date labels at first, mid, last.

**5. CAMPAIGN PERFORMANCE**
Heading "Campaign Performance".
If no campaigns (empty data array): show centred paragraph — Cormorant Garamond italic 18px var(--ash): "No campaigns sent in this period.[If you can infer the most recent send from the data, add: The most recent send was the [name] on [date].]"
If campaigns exist: full-width table.
  Columns: CAMPAIGN | SENT | DELIVERED | OPEN RATE | CLICK RATE | CTOR | REVENUE
  CTOR = click_rate / open_rate × 100 (1dp, show "—" if open_rate is 0)
  Revenue: £X,XXX.XX
  Table style: border-collapse collapse, width 100%. Header: Inter 9px uppercase var(--ash) padding 0 0 10px, border-bottom 1px var(--bone). Rows: Inter 13px, border-bottom 1px var(--bone), padding 12px 0. Number columns right-aligned. First column left-aligned, max-width 280px.
  Last row: "Totals / Weighted Avg" — font-weight 500.

**6. FLOW PERFORMANCE**
Heading "Flow Performance".
Same table style as campaigns.
Columns: FLOW | RECIPIENTS | DELIVERED | OPEN | CLICK | CTOR | CVR | REVENUE | RPR
  CTOR = click_rate / open_rate × 100 (1dp)
  CVR = conversion_rate × 100 (1dp)
  RPR = conversion_value / recipients formatted £X.XX (show "—" if recipients=0 or conversion_value=0)
  Revenue: £X,XXX.XX
  Flow name cell: flow name in Inter 13px var(--ink); below it in Inter 10px var(--ash) show the trigger type if inferable (e.g. "Added to List", "Metric", "Date").
  Totals/Weighted Avg row at bottom.

**7. KEY INSIGHTS**
Heading "Key Insights".
Full-width box: background var(--ink), color var(--pearl), padding 40px 44px, margin-top 8px.
4–5 paragraphs. Inter 13px weight 300, line-height 1.8, color var(--pearl). Margin between paragraphs: 16px.
Each paragraph: 2–4 sentences of confident, specific, data-led analysis (Financial Times weekend style). Cite actual numbers. Use <strong style="color:var(--pearl);font-weight:600"> to bold the single most important figure or phrase per paragraph.
No bullet points — prose only.

**8. NEXT STEPS FOR GROWTH**
Heading "Next Steps for Growth".
5 items. Each item uses a 2-column grid: left col 48px (number), right col auto (content). Border-bottom 1px var(--bone), padding 28px 0.

  Number: Cormorant Garamond 36px weight 300 var(--silver), line-height 1.
  Priority tag: inline-block, background var(--bone), Inter 8px uppercase letter-spacing 0.18em var(--ash), padding 3px 10px, margin-bottom 8px. Format: "[HIGH|MEDIUM|LOW] PRIORITY · [CAMPAIGNS|FLOWS|ACQUISITION|REPORTING|etc]"
  Title: Inter 14px weight 600 var(--ink), margin-bottom 6px, display block.
  Body: Inter 13px weight 300 var(--ash), line-height 1.65, margin-bottom 12px.
  Data pills: flex-wrap gap:6px. Each pill: background var(--bone), Inter 10px var(--ash), padding 3px 10px, border-radius 2px. Show 2–4 pills with the specific metric values that motivate this recommendation.

**9. FOOTER**
1px var(--bone) hairline, margin-top 48px.
Flex row justify-content:space-between, margin-top 20px.
Left: "Prepared by Swanky Agency for ${accountName}" — Inter 11px var(--ash).
Right: "Swanky · [today's date D MMM YYYY]" — Inter 11px var(--ash).

━━━ CHART DATA EMBEDDING PATTERN ━━━
For sections 3 and 4, embed data like this (replace with actual values from the aggregates):
<script type="application/json" id="subData">{"dates":["2024-04-21",...], "counts":[3,5,...], "unsubCounts":[0,1,...]}</script>
<script type="application/json" id="orderData">{"dates":["2024-04-21",...], "counts":[8,12,...]}</script>

The Klaviyo aggregate response has a "data" object with "attributes" containing a "dates" array and a "data" object. The "data" object has keys matching the measurements requested (e.g. "count"). Extract dates and counts from there. If the structure differs, adapt accordingly.

━━━ OUTPUT RULES ━━━
Output ONLY a complete <!DOCTYPE html>…</html> document. All CSS in <style> in <head>. JavaScript (for charts and print button only) in <script> tags.
No markdown fences, no commentary before or after the HTML.
Every metric value must come verbatim from the data — never invent or heavily round numbers.
Show "—" for any genuinely missing value.`;
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

    if (!accountName.trim()) {
      setError("Please enter an account name.");
      return;
    }

    if (reportType === "Custom" && (!customStart || !customEnd)) {
      setError("Custom range requires a start and end date.");
      return;
    }

    // Read all three values from localStorage — never log these
    const anthropicKey = localStorage.getItem(ANTHROPIC_KEY);
    const klaviyoKey = localStorage.getItem(KLAVIYO_KEY);
    const workerUrl = localStorage.getItem(WORKER_URL);

    if (!anthropicKey || !klaviyoKey || !workerUrl) {
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
          klaviyoKey,
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
          "anthropic-dangerous-direct-browser-access": "true",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 32000,
          messages: [{ role: "user", content: buildPrompt(klaviyoData) }],
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

      clearTimers();
      setProgress(100);
      setLoadingLine("Ready");
      setReportHtml(textBlock.text);
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
  };

  useEffect(() => {
    return () => clearTimers();
  }, []);

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

  useEffect(() => {
    if (iframeRef.current && reportHtml) {
      iframeRef.current.srcdoc = reportHtml;
    }
  }, [reportHtml]);

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
        fontFamily: "'Inter', -apple-system, sans-serif",
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
                fontFamily: "'Cormorant Garamond', serif",
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

        <Field label="Account name">
          <input
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="e.g. Acme Skincare"
            style={inputStyle}
          />
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
            fontFamily: "'Inter', sans-serif",
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
                fontFamily: "'Cormorant Garamond', serif",
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
                fontFamily: "'Inter', sans-serif",
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
                fontFamily: "'Inter', sans-serif",
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
                  fontFamily: "'Cormorant Garamond', serif",
                  fontStyle: "italic",
                }}
              >
                This is taking longer than expected. The Klaviyo MCP may not be authenticated, or the request may have stalled. Consider cancelling and checking your Klaviyo key in Settings.
              </div>
            )}
          </div>
        )}

        {reportHtml && !isGenerating && (
          <button
            onClick={handleDownload}
            style={{
              width: "100%",
              padding: "12px 20px",
              background: "transparent",
              color: "#0a0a0a",
              border: "1px solid #0a0a0a",
              fontFamily: "'Inter', sans-serif",
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
              fontFamily: "'Cormorant Garamond', serif",
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
            />
          )}
          {/* Render iframe whenever reportHtml exists so the ref is available for srcdoc */}
          {reportHtml && (
            <iframe
              ref={iframeRef}
              title="Klaviyo report preview"
              style={{ width: "100%", height: "100%", border: "none", background: "#ffffff", display: isGenerating ? "none" : "block" }}
              sandbox="allow-same-origin"
            />
          )}
        </div>
      </main>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #b8b8b8",
  background: "#ffffff",
  fontSize: "13px",
  fontFamily: "'Inter', sans-serif",
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
        fontFamily: "'Inter', sans-serif",
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
          fontFamily: "'Cormorant Garamond', serif",
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

function MiniChart({ index }) {
  const variant = index % 5;

  if (variant === 0) {
    const bars = [8, 12, 10, 18, 16, 24];
    const barW = 7;
    const gap = 2;
    return (
      <g>
        <line x1="0" y1="30" x2="60" y2="30" stroke="#0a0a0a" strokeWidth="0.6" />
        {bars.map((h, i) => (
          <rect key={i} x={i * (barW + gap)} y={30 - h} width={barW} height="0" fill="#0a0a0a">
            <animate attributeName="height" from="0" to={h} dur="0.4s" begin={`${0.1 + i * 0.08}s`} fill="freeze" />
            <animate attributeName="y" from="30" to={30 - h} dur="0.4s" begin={`${0.1 + i * 0.08}s`} fill="freeze" />
          </rect>
        ))}
      </g>
    );
  }

  if (variant === 1) {
    const path = "M 0 22 L 12 18 L 24 20 L 36 12 L 48 8 L 60 4";
    return (
      <g>
        <line x1="0" y1="30" x2="60" y2="30" stroke="#0a0a0a" strokeWidth="0.6" />
        <path d={path} stroke="#0a0a0a" strokeWidth="1.2" fill="none" strokeDasharray="80" strokeDashoffset="80">
          <animate attributeName="stroke-dashoffset" from="80" to="0" dur="1.2s" begin="0.1s" fill="freeze" />
        </path>
        <circle cx="60" cy="4" r="0" fill="#0a0a0a">
          <animate attributeName="r" from="0" to="2" dur="0.3s" begin="1.3s" fill="freeze" />
        </circle>
      </g>
    );
  }

  if (variant === 2) {
    const cx = 30, cy = 15, r = 12;
    const circumference = 2 * Math.PI * r;
    const filled = circumference * 0.68;
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ededed" strokeWidth="3" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#0a0a0a" strokeWidth="3" strokeDasharray={`0 ${circumference}`} transform={`rotate(-90 ${cx} ${cy})`}>
          <animate attributeName="stroke-dasharray" from={`0 ${circumference}`} to={`${filled} ${circumference}`} dur="1.1s" begin="0.2s" fill="freeze" />
        </circle>
        <text x={cx} y={cy + 3} textAnchor="middle" fontFamily="'Cormorant Garamond', serif" fontSize="9" fontWeight="400" fill="#0a0a0a" opacity="0">
          <animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="1.3s" fill="freeze" />
          68%
        </text>
      </g>
    );
  }

  if (variant === 3) {
    const points = [22, 18, 24, 14, 20, 10, 12, 6];
    const stepX = 60 / (points.length - 1);
    const linePath = "M " + points.map((y, i) => `${i * stepX} ${y}`).join(" L ");
    const areaPath = linePath + ` L 60 30 L 0 30 Z`;
    return (
      <g>
        <line x1="0" y1="30" x2="60" y2="30" stroke="#0a0a0a" strokeWidth="0.6" />
        <path d={areaPath} fill="#0a0a0a" opacity="0">
          <animate attributeName="opacity" from="0" to="0.12" dur="0.6s" begin="0.8s" fill="freeze" />
        </path>
        <path d={linePath} stroke="#0a0a0a" strokeWidth="1.2" fill="none" strokeDasharray="100" strokeDashoffset="100">
          <animate attributeName="stroke-dashoffset" from="100" to="0" dur="1.1s" begin="0.1s" fill="freeze" />
        </path>
      </g>
    );
  }

  const pairs = [[10, 14], [16, 12], [12, 20], [18, 22]];
  const pairW = 14, innerBarW = 5, innerGap = 1;
  return (
    <g>
      <line x1="0" y1="30" x2="60" y2="30" stroke="#0a0a0a" strokeWidth="0.6" />
      {pairs.map(([a, b], i) => (
        <g key={i} transform={`translate(${i * pairW + 1}, 0)`}>
          <rect x="0" y={30 - a} width={innerBarW} height="0" fill="#b8b8b8">
            <animate attributeName="height" from="0" to={a} dur="0.4s" begin={`${0.1 + i * 0.1}s`} fill="freeze" />
            <animate attributeName="y" from="30" to={30 - a} dur="0.4s" begin={`${0.1 + i * 0.1}s`} fill="freeze" />
          </rect>
          <rect x={innerBarW + innerGap} y={30 - b} width={innerBarW} height="0" fill="#0a0a0a">
            <animate attributeName="height" from="0" to={b} dur="0.4s" begin={`${0.2 + i * 0.1}s`} fill="freeze" />
            <animate attributeName="y" from="30" to={30 - b} dur="0.4s" begin={`${0.2 + i * 0.1}s`} fill="freeze" />
          </rect>
        </g>
      ))}
    </g>
  );
}

function LoadingState({ progress, line, elapsed, justFinished, onDismissCompletion, onNewReport }) {
  const pct = Math.round(progress);
  const formatTime = (s) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);
  const showPatience = elapsed >= 90 && !justFinished;

  const [chartIndex, setChartIndex] = useState(() => Math.floor(Math.random() * 5));

  useEffect(() => {
    const id = setInterval(() => setChartIndex((i) => (i + 1) % 5), 12000);
    return () => clearInterval(id);
  }, []);

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
        position: "relative",
        overflow: "hidden",
      }}
    >
      <FloatingNumerals />

      <div style={{ position: "relative", width: "120px", height: "150px", marginBottom: "36px", zIndex: 2 }}>
        <svg width="120" height="150" viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
          <rect x="10" y="6" width="100" height="138" fill="#ffffff" stroke="#0a0a0a" strokeWidth="1" />
          <line x1="14" y1="10" x2="14" y2="140" stroke="#ededed" strokeWidth="1" />
          <line x1="22" y1="22" x2="98" y2="22" stroke="#0a0a0a" strokeWidth="0.6" />

          <rect x="22" y="32" width="0" height="2" fill="#0a0a0a">
            <animate attributeName="width" values="0;0;56;56;56;0;0" keyTimes="0;0.02;0.08;0.83;0.92;0.95;1" dur="12s" repeatCount="indefinite" />
          </rect>
          <rect x="22" y="42" width="0" height="2" fill="#0a0a0a">
            <animate attributeName="width" values="0;0;0;68;68;68;0;0" keyTimes="0;0.08;0.10;0.18;0.83;0.92;0.95;1" dur="12s" repeatCount="indefinite" />
          </rect>
          <rect x="22" y="52" width="0" height="2" fill="#0a0a0a">
            <animate attributeName="width" values="0;0;0;48;48;48;0;0" keyTimes="0;0.18;0.20;0.27;0.83;0.92;0.95;1" dur="12s" repeatCount="indefinite" />
          </rect>

          <g transform="translate(30, 62)" opacity="0">
            <animate attributeName="opacity" values="0;0;0;1;1;1;0;0" keyTimes="0;0.27;0.30;0.36;0.83;0.92;0.95;1" dur="12s" repeatCount="indefinite" />
            <MiniChart key={chartIndex} index={chartIndex} />
          </g>

          <rect x="22" y="98" width="0" height="1.5" fill="#0a0a0a">
            <animate attributeName="width" values="0;0;0;76;76;76;0;0" keyTimes="0;0.36;0.38;0.46;0.83;0.92;0.95;1" dur="12s" repeatCount="indefinite" />
          </rect>
          <rect x="22" y="106" width="0" height="1.5" fill="#0a0a0a">
            <animate attributeName="width" values="0;0;0;62;62;62;0;0" keyTimes="0;0.46;0.48;0.55;0.83;0.92;0.95;1" dur="12s" repeatCount="indefinite" />
          </rect>
          <rect x="22" y="114" width="0" height="1.5" fill="#0a0a0a">
            <animate attributeName="width" values="0;0;0;70;70;70;0;0" keyTimes="0;0.55;0.57;0.65;0.83;0.92;0.95;1" dur="12s" repeatCount="indefinite" />
          </rect>
          <rect x="22" y="122" width="0" height="1.5" fill="#0a0a0a">
            <animate attributeName="width" values="0;0;0;44;44;44;0;0" keyTimes="0;0.65;0.67;0.72;0.83;0.92;0.95;1" dur="12s" repeatCount="indefinite" />
          </rect>

          <rect x="22" y="32" width="2" height="9" fill="#0a0a0a">
            <animate attributeName="x" values="22;78;22;90;22;70;22;98;22;84;22;92;22;66;22;22" keyTimes="0;0.08;0.10;0.18;0.20;0.27;0.36;0.46;0.48;0.55;0.57;0.65;0.67;0.72;0.95;1" dur="12s" repeatCount="indefinite" />
            <animate attributeName="y" values="32;32;42;42;52;52;98;98;106;106;114;114;122;122;32;32" keyTimes="0;0.08;0.10;0.18;0.20;0.27;0.36;0.46;0.48;0.55;0.57;0.65;0.67;0.72;0.95;1" dur="12s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0;1;0;1;0;1;0" keyTimes="0;0.07;0.14;0.21;0.28;0.35;0.42;1" dur="0.9s" repeatCount="indefinite" />
          </rect>
        </svg>
      </div>

      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "32px", fontWeight: 300, color: "#0a0a0a", fontStyle: "italic", marginBottom: "8px", zIndex: 2 }}>
        Composing your report
      </div>

      <div
        key={line}
        style={{
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.22em",
          color: "#6b6b6b",
          marginBottom: "40px",
          minHeight: "14px",
          animation: "fadeLine 0.5s ease-out",
          zIndex: 2,
        }}
      >
        {line}
      </div>

      <div style={{ width: "min(440px, 70%)", display: "flex", flexDirection: "column", gap: "10px", zIndex: 2 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            fontFamily: "'Inter', sans-serif",
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: "#6b6b6b",
          }}
        >
          <span>Progress · {formatTime(elapsed)} elapsed</span>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "22px", fontWeight: 300, color: "#0a0a0a", letterSpacing: "0", fontVariantNumeric: "tabular-nums" }}>
            {pct}<span style={{ fontSize: "12px", color: "#6b6b6b", marginLeft: "2px" }}>%</span>
          </span>
        </div>

        <div style={{ width: "100%", height: "2px", background: "#ededed", position: "relative", overflow: "hidden" }}>
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
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: "100%",
              width: `${progress}%`,
              background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)",
              animation: "shimmer 1.8s ease-in-out infinite",
              transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </div>

        {showPatience && (
          <div
            style={{
              marginTop: "20px",
              fontSize: "12px",
              color: "#6b6b6b",
              fontStyle: "italic",
              fontFamily: "'Cormorant Garamond', serif",
              lineHeight: 1.5,
              animation: "fadeLine 0.6s ease-out",
            }}
          >
            Still working. Long date ranges and many campaigns can take a couple of minutes.
          </div>
        )}
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes fadeLine {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {justFinished && <CompletionOverlay onDismiss={onDismissCompletion} onNewReport={onNewReport} />}
    </div>
  );
}

function CompletionOverlay({ onDismiss, onNewReport }) {
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
        fontFamily: "'Cormorant Garamond', serif",
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
            fontFamily: "'Inter', sans-serif",
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
            fontFamily: "'Inter', sans-serif",
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
    { text: "12.4%", left: "8%", delay: 0, duration: 11, size: 22 },
    { text: "£48,290", left: "18%", delay: 3, duration: 13, size: 18 },
    { text: "0.84", left: "82%", delay: 1.5, duration: 12, size: 24 },
    { text: "↑ 6.2%", left: "88%", delay: 5, duration: 10, size: 16 },
    { text: "1,247", left: "5%", delay: 7, duration: 14, size: 20 },
    { text: "31.7%", left: "92%", delay: 8.5, duration: 11, size: 18 },
    { text: "£12.40", left: "12%", delay: 4.5, duration: 12, size: 16 },
    { text: "0.421", left: "78%", delay: 2.5, duration: 13, size: 22 },
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
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: `${n.size}px`,
            fontWeight: 300,
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
          15% { opacity: 0.12; }
          85% { opacity: 0.12; }
          100% { transform: translateY(-100vh); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
