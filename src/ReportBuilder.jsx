import React, { useState, useRef, useEffect } from "react";

// localStorage key names — never change these without migrating existing users
const ANTHROPIC_KEY = "swanky_anthropic_key";
const KLAVIYO_KEY = "swanky_klaviyo_key";

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

  const buildPrompt = () => {
    const range = computeDateRange();
    const comparison = computeComparisonRange(range.start, range.end);

    const swankyStyleGuide = `
SWANKY REPORT DESIGN SYSTEM (must be followed exactly):

Fonts:
- Display/Headings: 'Cormorant Garamond', serif (weights 300, 400, 500)
- Body/UI: 'Inter', sans-serif (weights 300, 400, 500, 600)
- Load via: <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">

Palette (strictly monochromatic, no other colors):
- --ink: #0a0a0a (primary text, headings)
- --graphite: #2a2a2a (secondary text)
- --ash: #6b6b6b (tertiary text, captions)
- --silver: #b8b8b8 (dividers, subtle borders)
- --bone: #ededed (subtle backgrounds)
- --paper: #f8f6f2 (warm off-white page background)
- --pearl: #ffffff (cards)

Layout:
- Generous whitespace, editorial magazine feel
- Max content width 880px, centered
- Section padding: 64px vertical
- Use thin hairline rules (1px solid var(--silver)) as dividers
- Numbers should feel monumental: large Cormorant Garamond, light weight

Logo header (top of report):
<header style="text-align:center;padding:48px 0 32px;border-bottom:1px solid var(--silver);">
  <img src="https://swankyagency.com/wp-content/uploads/2022/05/swanky-2020-black.png" alt="Swanky" style="height:32px;opacity:0.9;" />
</header>

Required structure:
1. Header with Swanky logo
2. Title block: account name (Cormorant Garamond, 56px, weight 300), date range (Inter, 13px uppercase, letter-spacing 0.15em, var(--ash))
3. Executive Summary: 2-3 paragraphs of editorial prose summarising performance
4. Headline Metrics grid (3-4 columns): big numbers + tiny labels + comparison delta if applicable
5. Campaigns section: table with name, sent, open rate, click rate, revenue
6. Flows section: table with flow name, recipients, conversions, revenue
7. Insights & Recommendations: numbered list of 3-5 strategic observations
8. Footer with Swanky logo and date generated

Tone of writing: confident, editorial, considered. Avoid marketing buzzwords. Write like the Financial Times weekend supplement. Numbers carry the story; prose interprets them.

Comparison rendering: if comparison data present, show delta as small text under each metric. Use up arrow ↑ for positive (no green), down arrow ↓ for negative (no red). Stay monochrome. Format like "↑ 12.4% vs previous period".

Tables: minimal. No vertical lines. Hairline horizontal rules only. Numbers right-aligned in tabular figures (font-variant-numeric: tabular-nums). Headers in Inter 11px uppercase with letter-spacing 0.12em.

Output ONLY a complete HTML document (<!DOCTYPE html>...</html>) with embedded CSS. No markdown fences, no commentary. No JavaScript needed.
`;

    return `You are generating a Klaviyo performance report for the account "${accountName}".

Reporting period: ${range.start} to ${range.end} (${reportType})
${comparison ? `Comparison period: ${comparison.start} to ${comparison.end} (${comparisonMode})` : "No comparison period."}

STEP 1 - PULL DATA via the Klaviyo MCP tools:
- Use klaviyo_get_account_details to confirm account context
- Use klaviyo_get_campaign_report for campaign performance in the reporting period. Query statistics: recipients, delivered, open_rate, click_rate, conversions, conversion_rate. Include valueStatistics: conversion_value, average_order_value, revenue_per_recipient. Use timeframe with explicit start/end ISO datetimes.
- Use klaviyo_get_flow_report for flow performance over the same period with the same statistics
- Use klaviyo_get_metrics if you need to find the conversion metric ID (look for "Placed Order")
${comparison ? `- Repeat the campaign and flow report queries for the comparison period (${comparison.start} to ${comparison.end}) so you can compute deltas` : ""}

STEP 2 - PRODUCE THE REPORT HTML:

${swankyStyleGuide}

Begin pulling data now, then output the final HTML document.`;
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

    // Read keys from localStorage — never log these values
    const anthropicKey = localStorage.getItem(ANTHROPIC_KEY);
    const klaviyoKey = localStorage.getItem(KLAVIYO_KEY);

    if (!anthropicKey || !klaviyoKey) {
      onOpenSettings();
      return;
    }

    setIsGenerating(true);
    setReportHtml("");
    setProgress(0);
    setLoadingLine(loadingLines[0].text);
    setElapsedSeconds(0);
    setStatusMessage("");
    setJustFinished(false);

    requestIdRef.current += 1;
    const myRequestId = requestIdRef.current;

    const startedAt = Date.now();
    const ceiling = 92;
    const expectedDurationMs = 90000;
    let holdingLineIndex = 0;

    progressTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const t = Math.min(elapsed / expectedDurationMs, 1);
      const eased = 1 - Math.pow(1 - t, 2.2);
      const next = Math.min(ceiling, eased * ceiling);
      setProgress(next);
      if (next < ceiling) {
        const climbingLine = lineForProgress(next);
        if (climbingLine) setLoadingLine(climbingLine);
      }
    }, 150);

    lineTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= expectedDurationMs * 0.85) {
        setLoadingLine(holdingLines[holdingLineIndex % holdingLines.length].text);
        holdingLineIndex += 1;
      }
    }, 4000);

    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "mcp-client-2025-11-20",
          "anthropic-dangerous-direct-browser-access": "true",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 32000,
          messages: [{ role: "user", content: buildPrompt() }],
          mcp_servers: [
            {
              type: "url",
              url: "https://mcp.klaviyo.com/mcp",
              name: "klaviyo",
              authorization_token: klaviyoKey,
            },
          ],
          tools: [
            {
              type: "mcp_toolset",
              mcp_server_name: "klaviyo",
            },
          ],
        }),
        signal: abortControllerRef.current.signal,
      });

      if (myRequestId !== requestIdRef.current) return;

      if (!response.ok) {
        let message = `API error ${response.status}`;
        try {
          const errData = await response.json();
          message = errData.error?.message || message;
        } catch (_) {}
        throw new Error(message);
      }

      const data = await response.json();

      if (myRequestId !== requestIdRef.current) return;

      const textBlock = data.content?.find((b) => b.type === "text");
      if (!textBlock?.text) {
        throw new Error(
          "The model returned no report content. This can happen if Klaviyo MCP authentication failed or the context limit was hit. Check your Klaviyo key and try again."
        );
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
      setError(e.message || "Something went wrong. Check your API keys in Settings and try again.");
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
          {/* Only show iframe when generation is complete and overlay is dismissed */}
          {reportHtml && !isGenerating && (
            <iframe
              ref={iframeRef}
              title="Klaviyo report preview"
              style={{ width: "100%", height: "100%", border: "none", background: "#ffffff" }}
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
            <animate attributeName="y" values="32;32;42;42;52;52;82;82;98;98;106;106;114;114;32;32" keyTimes="0;0.08;0.10;0.18;0.20;0.27;0.36;0.46;0.48;0.55;0.57;0.65;0.67;0.72;0.95;1" dur="12s" repeatCount="indefinite" />
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
      <div
        style={{
          position: "absolute",
          left: "10%",
          right: "10%",
          top: "50%",
          height: "1px",
          background: "#0a0a0a",
          transformOrigin: "center",
          transform: "scaleX(0)",
          animation: "drawHairline 0.6s cubic-bezier(0.65, 0, 0.35, 1) 0.1s forwards",
        }}
      />

      <svg
        width="64"
        height="64"
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
        style={{ marginBottom: "28px", zIndex: 2, opacity: 0, animation: "markIn 0.5s ease-out 0.5s forwards" }}
      >
        <circle
          cx="32"
          cy="32"
          r="30"
          fill="none"
          stroke="#0a0a0a"
          strokeWidth="1"
          strokeDasharray="190"
          strokeDashoffset="190"
          style={{ animation: "drawCircle 0.7s cubic-bezier(0.65, 0, 0.35, 1) 0.5s forwards" }}
        />
        <path
          d="M 18 33 L 28 43 L 46 23"
          fill="none"
          stroke="#0a0a0a"
          strokeWidth="1.5"
          strokeLinecap="square"
          strokeLinejoin="miter"
          strokeDasharray="50"
          strokeDashoffset="50"
          style={{ animation: "drawCheck 0.4s cubic-bezier(0.65, 0, 0.35, 1) 1s forwards" }}
        />
      </svg>

      <div
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: "44px",
          fontWeight: 300,
          color: "#0a0a0a",
          letterSpacing: "-0.01em",
          fontStyle: "italic",
          opacity: 0,
          animation: "fadeUp 0.6s ease-out 1.1s forwards",
          zIndex: 2,
        }}
      >
        Ready.
      </div>

      <div
        style={{
          marginTop: "12px",
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.24em",
          color: "#6b6b6b",
          opacity: 0,
          animation: "fadeUp 0.6s ease-out 1.3s forwards",
          zIndex: 2,
        }}
      >
        Your report is rendered below
      </div>

      <div
        style={{
          marginTop: "36px",
          display: "flex",
          gap: "12px",
          opacity: 0,
          animation: "fadeUp 0.6s ease-out 1.5s forwards",
          zIndex: 2,
        }}
      >
        <button
          onClick={onDismiss}
          style={{
            padding: "12px 24px",
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
            padding: "12px 24px",
            background: "transparent",
            color: "#0a0a0a",
            border: "1px solid #0a0a0a",
            fontFamily: "'Inter', sans-serif",
            fontSize: "11px",
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
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
