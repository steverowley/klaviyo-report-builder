import React, { useState, useRef, useEffect } from "react";
import { fmtEventDate, parseLocalDate, shiftYear, validateReportDates } from "./dateUtils.js";
import { friendlyErrorMessage } from "./errors.js";
import { REPORT_PROMPT_VERSION } from "./reportPrompt.js";
import { workerFetch } from "./workerApi.js";
import { useReportGeneration } from "./useReportGeneration.js";
import { inputStyle } from "./theme.js";
import { ActivityBanner, EmptyState, LoadingState } from "./components/ReportStates.jsx";
import { Field, SegmentButton, ContextTextarea, SignOffCheckbox } from "./components/Controls.jsx";
import { AddClientModal, OffboardClientModal } from "./components/ClientModals.jsx";
import { FeedbackModal } from "./components/FeedbackModal.jsx";
import { useFocusTrap } from "./useFocusTrap.js";
import { DEFAULT_WORKER_URL as BAKED_WORKER_URL } from "./config.js";

const WORKER_URL = "swanky_worker_url";
const MODEL_KEY = "swanky_model";
const DEFAULT_MODEL = "claude-sonnet-4-6";

// Model registry. Pricing in USD per million tokens.
const MODELS = {
  "claude-haiku-4-5-20251001": {
    label: "Haiku 4.5",
    blurb: "Fastest, lowest cost",
    pricing: { input: 1, cacheWrite: 1.25, cacheRead: 0.10, output: 5 },
    maxOutputTokens: 64000,
  },
  "claude-sonnet-4-6": {
    label: "Sonnet 4.6",
    blurb: "Balanced — recommended",
    pricing: { input: 3, cacheWrite: 3.75, cacheRead: 0.30, output: 15 },
    maxOutputTokens: 64000,
  },
  "claude-opus-4-8": {
    label: "Opus 4.8",
    blurb: "Highest quality, slowest",
    pricing: { input: 5, cacheWrite: 6.25, cacheRead: 0.50, output: 25 },
    maxOutputTokens: 128000,
  },
};

// ─────────────────────────────────────────────────────────────────────────────

function relativeTime(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDateDisplay(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.getDate() + " " + ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
}


export default function KlaviyoReportBuilder({ onOpenSettings, settingsVersion, sessionToken, session, onSignOut, onOpenAdmin, adminPanelOpen }) {
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientsError, setClientsError] = useState("");
  const [reportType, setReportType] = useState("Monthly");
  const [comparisonMode, setComparisonMode] = useState("Previous Period");
  const [selectedModel, setSelectedModel] = useState(
    () => (MODELS[localStorage.getItem(MODEL_KEY)] ? localStorage.getItem(MODEL_KEY) : DEFAULT_MODEL)
  );
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [cachedInfo, setCachedInfo] = useState(null);
  const [reportHtml, setReportHtml] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [slidesPrompt, setSlidesPrompt] = useState("");
  const [isCreatingSlides, setIsCreatingSlides] = useState(false);
  const [slidesProgress, setSlidesProgress] = useState(0);
  const [showSlidesModal, setShowSlidesModal] = useState(false);
  const [slidesCopied, setSlidesCopied] = useState(false);
  const [regenSid, setRegenSid] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [showOffboardModal, setShowOffboardModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [savedReports, setSavedReports] = useState([]);
  const [currentReportMeta, setCurrentReportMeta] = useState(null);
  const [loadingSavedReport, setLoadingSavedReport] = useState(false);
  const [spendStatus, setSpendStatus] = useState(null); // { month, spentUsd, capUsd, ratio }
  const [signedOff, setSignedOff] = useState(false); // human review confirmed before download/send
  const dropdownRef = useRef(null);
  const [regenProgress, setRegenProgress] = useState(0);
  const slidesProgressTimerRef = useRef(null);
  const regenProgressTimerRef = useRef(null);
  const iframeRef = useRef(null);
  const overCapAckRef = useRef(false); // one-time-per-session ack of the spend-cap warning
  const slidesModalRef = useRef(null);
  useFocusTrap(slidesModalRef, showSlidesModal);

  const reportTypes = ["Weekly", "Fortnightly", "Monthly", "Quarterly", "YTD", "Custom"];
  const comparisonModes = ["None", "Previous Period", "Year on Year"];

  // Always request the model's full output ceiling so reports are never cut off mid-generation.
  // Haiku 4.5 / Sonnet 4.6: 64k · Opus 4.8: 128k.
  // Cost is based on tokens actually generated, not the ceiling, so there's no penalty for
  // requesting the maximum.
  const maxTokensForReport = () =>
    (MODELS[selectedModel] || MODELS[DEFAULT_MODEL]).maxOutputTokens;

  const computeDateRange = () => {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() - 1);
    let start = new Date(end);

    if (reportType === "Weekly") {
      start.setDate(end.getDate() - 6);
    } else if (reportType === "Fortnightly") {
      start.setDate(end.getDate() - 13);
    } else if (reportType === "Monthly") {
      start.setDate(end.getDate() - 29);
    } else if (reportType === "Quarterly") {
      start.setDate(end.getDate() - 89);
    } else if (reportType === "YTD") {
      start = new Date(today.getFullYear(), 0, 1);
    } else if (reportType === "Custom") {
      if (customStart && customEnd) {
        start = parseLocalDate(customStart);
        end.setTime(parseLocalDate(customEnd).getTime());
      }
    }

    return {
      start: fmtEventDate(start),
      end: fmtEventDate(end),
    };
  };

  const computeComparisonRange = (start, end) => {
    if (comparisonMode === "None") return null;
    const startDate = parseLocalDate(start);
    const endDate = parseLocalDate(end);
    const days = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

    let compStart, compEnd;
    if (comparisonMode === "Previous Period") {
      compEnd = new Date(startDate);
      compEnd.setDate(compEnd.getDate() - 1);
      compStart = new Date(compEnd);
      compStart.setDate(compStart.getDate() - (days - 1));
    } else {
      compStart = shiftYear(startDate, -1);
      compEnd = shiftYear(endDate, -1);
    }

    return {
      start: fmtEventDate(compStart),
      end: fmtEventDate(compEnd),
    };
  };

  const accountName = clients.find(c => c.id === selectedClientId)?.name ?? "";

  // Past reports are scoped to the selected client — never show one client's
  // reports while another is selected. (savedReports holds all clients' reports.)
  const clientReports = selectedClientId
    ? savedReports.filter(r => r.clientId === selectedClientId)
    : [];

  // What to do with a finished report: record the spend, persist it with full
  // metadata (+ reproducibility snapshot), and render it. Receives the config
  // that produced the report, so metadata can't be corrupted by settings
  // changed mid-generation.
  const handleGenerationComplete = ({ html, warnings, costUsd, config, relevantEvents, klaviyoData, isCurrent }) => {
    trackSpend(costUsd);
    const generatedNow = new Date().toISOString();
    const reportMeta = { clientId: config.clientId, reportType: config.reportType, dateStart: config.range.start, dateEnd: config.range.end, accountName: config.accountName, generatedAt: generatedNow, warnings, promptVersion: REPORT_PROMPT_VERSION };
    setCurrentReportMeta({ ...reportMeta });
    // Reproducibility snapshot: the exact inputs that produced this report.
    const inputSnapshot = {
      generatedAt: generatedNow, reportType: config.reportType, comparisonMode: config.comparisonMode, model: config.model,
      promptVersion: REPORT_PROMPT_VERSION,
      range: config.range, comparison: config.comparison, accountName: config.accountName,
      additionalContext: config.additionalContext, events: relevantEvents, klaviyo: klaviyoData,
    };
    // Persist, then adopt the server-assigned key so this report highlights as
    // "current" in the Past reports list and the list shows it.
    saveReportToWorker(html, reportMeta, inputSnapshot).then((key) => {
      if (key && isCurrent()) {
        setCurrentReportMeta((prev) => (prev ? { ...prev, key } : prev));
        refreshSavedReports();
      }
    });
    setCachedInfo(null);
    setReportHtml(html);
    setSlidesPrompt("");
  };

  const generation = useReportGeneration({ sessionToken, onSignOut, onComplete: handleGenerationComplete });
  const {
    isGenerating, setIsGenerating,
    error, setError,
    progress, setProgress,
    loadingLine,
    elapsedSeconds,
    justFinished, setJustFinished,
    lastUsage, setLastUsage,
    lastDuration, setLastDuration,
    dataWarnings, setDataWarnings,
  } = generation;

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

    // Block nonsensical windows (future / reversed / absurdly long) before spending
    // a generation on them — they'd otherwise render as a plausible-looking but
    // mostly-empty report that could reach a client.
    const range = computeDateRange();
    const dateError = validateReportDates(range.start, range.end, fmtEventDate(new Date()));
    if (dateError) {
      setError(dateError);
      return;
    }

    // Soft spend-cap gate: warn once when this month's AI spend is over the cap, but
    // let staff proceed (it's the agency's budget call) on the next click.
    if (spendStatus && spendStatus.spentUsd >= spendStatus.capUsd && !overCapAckRef.current) {
      overCapAckRef.current = true;
      setError(`This month's AI spend ($${spendStatus.spentUsd.toFixed(2)}) has reached the $${spendStatus.capUsd} cap. Click Generate again to proceed anyway.`);
      return;
    }

    const workerUrl = localStorage.getItem(WORKER_URL) || BAKED_WORKER_URL;

    if (!workerUrl) {
      if (onOpenSettings) onOpenSettings();
      else setError("Worker URL not configured — contact your admin.");
      return;
    }

    setReportHtml("");
    await generation.generate({
      workerUrl,
      clientId: selectedClientId,
      accountName,
      reportType,
      comparisonMode,
      additionalContext,
      model: selectedModel,
      maxOutputTokens: maxTokensForReport(),
      pricing: (MODELS[selectedModel] || MODELS[DEFAULT_MODEL]).pricing,
      range,
      comparison: computeComparisonRange(range.start, range.end),
    });
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
    setDataWarnings([]);
    setStatusMessage("");
    setError("");
    setLastUsage(null);
    setCurrentReportMeta(null);
  };

  // Route an authenticated fetch's 401/403 to a clean re-login prompt (matching the
  // generate path). Returns true if it handled an auth failure — the caller stops.
  const handleAuthFailure = (res) => {
    if ((res?.status === 401 || res?.status === 403) && onSignOut) {
      onSignOut("Your session has expired — please sign in again.");
      return true;
    }
    return false;
  };

  // Fetch this month's Anthropic spend vs the cap, for the sidebar meter.
  const refreshSpendStatus = async () => {
    const workerUrl = localStorage.getItem(WORKER_URL) || BAKED_WORKER_URL;
    if (!workerUrl) return;
    try {
      const res = await workerFetch(workerUrl, { action: "spend-status", token: sessionToken });
      if (res.ok) setSpendStatus(await res.json());
    } catch {}
  };

  // Record a finished report's cost against the monthly total.
  const trackSpend = async (costUsd) => {
    const workerUrl = localStorage.getItem(WORKER_URL) || BAKED_WORKER_URL;
    if (!workerUrl || !(costUsd > 0)) return;
    try {
      await workerFetch(workerUrl, { action: "track-spend", method: "POST", token: sessionToken, body: { costUsd } });
    } catch {}
    refreshSpendStatus();
  };

  // Refresh the past-reports list from worker KV.
  const refreshSavedReports = async () => {
    const workerUrl = localStorage.getItem(WORKER_URL);
    if (!workerUrl) return;
    try {
      const res = await workerFetch(workerUrl, {
        action: "list-reports",
        // Scope server-side to the selected client; unscoped only before a
        // client is chosen (the UI shows nothing in that case anyway).
        params: selectedClientId ? { clientId: selectedClientId } : {},
        token: sessionToken,
      });
      if (handleAuthFailure(res)) return;
      if (res.ok) {
        const entries = await res.json();
        if (Array.isArray(entries)) setSavedReports(entries);
      }
    } catch {}
  };

  // Save a freshly generated report to KV for cross-device access. Returns the
  // server-assigned key (or null) so the caller can highlight it as the current report.
  const saveReportToWorker = async (html, metadata, inputData) => {
    const workerUrl = localStorage.getItem(WORKER_URL);
    if (!workerUrl) return null;
    try {
      const res = await workerFetch(workerUrl, {
        action: "save-report", method: "POST", token: sessionToken,
        body: { html, metadata, inputData },
      });
      if (handleAuthFailure(res)) return null;
      if (res.ok) { const d = await res.json().catch(() => ({})); return d.key || null; }
    } catch {}
    return null;
  };

  // Delete a report from KV, refresh the list.
  const deleteReport = async (key, e) => {
    e.stopPropagation();
    // Optimistically remove from state immediately
    setSavedReports(prev => prev.filter(r => r.key !== key));
    if (currentReportMeta?.key === key) handleNewReport();
    const workerUrl = localStorage.getItem(WORKER_URL);
    if (workerUrl) {
      try {
        const res = await workerFetch(workerUrl, { action: "delete-report", params: { key }, method: "POST", token: sessionToken });
        handleAuthFailure(res);
      } catch {}
    }
  };

  // Load a past report from worker KV.
  const loadSavedReport = async (key) => {
    setLoadingSavedReport(true);
    try {
      const workerUrl = localStorage.getItem(WORKER_URL);
      if (!workerUrl) return;
      let html, meta;
      try {
        const res = await workerFetch(workerUrl, { action: "get-report", params: { key }, token: sessionToken });
        if (handleAuthFailure(res)) return;
        if (res.ok) { const d = await res.json(); html = d.html; meta = d.metadata; }
      } catch {}
      if (!html) { setError("Couldn’t open that report — please try again."); return; }
      setReportHtml(html);
      // Restore the incomplete-data warnings so the "review before sending" banner
      // reappears when a report is reopened from history.
      setDataWarnings(Array.isArray(meta?.warnings) ? meta.warnings : []);
      setSlidesPrompt("");
      setCurrentReportMeta({ key, ...meta });
      setCachedInfo({ generatedAt: meta.generatedAt, key });
      setLastUsage(null);
      setLastDuration(null);
      setError("");
      setStatusMessage("");
      setIsGenerating(false);
      setJustFinished(false);
      setProgress(0);
      if (meta.clientId) setSelectedClientId(meta.clientId);
      if (meta.reportType) setReportType(meta.reportType);
    } finally {
      setLoadingSavedReport(false);
    }
  };

  useEffect(() => {
    // One-time cleanup: remove old localStorage report cache (superseded by KV)
    localStorage.removeItem("swanky_report_cache");
    refreshSpendStatus();
  }, []);

  // Refresh past-reports list when a client is selected or report mode becomes visible.
  useEffect(() => {
    if (selectedClientId) refreshSavedReports();
  }, [selectedClientId]);

  useEffect(() => {
    if (reportHtml && !isGenerating) refreshSavedReports();
  }, [reportHtml, isGenerating]);

  // Any time the displayed report changes (new generation or one loaded from
  // history), require a fresh review sign-off before it can be downloaded/sent.
  useEffect(() => { setSignedOff(false); }, [reportHtml]);

  // Escape closes the open slides modal or client dropdown, like a standard dialog.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (showSlidesModal) setShowSlidesModal(false);
      else if (dropdownOpen) setDropdownOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSlidesModal, dropdownOpen]);

  // Listen for regenerate-step messages from the report iframe
  useEffect(() => {
    const handler = async (event) => {
      // Defence-in-depth: only trust messages from our own report iframe.
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
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
      const workerUrl = localStorage.getItem(WORKER_URL) || BAKED_WORKER_URL;
      if (!workerUrl) {
        setError("Worker URL missing — open Settings to add it.");
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
        const res = await workerFetch(workerUrl, {
          action: 'anthropic',
          method: 'POST',
          token: sessionToken,
          body: {
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 300,
            messages: [{
              role: 'user',
              content: `You are improving a set of email marketing growth recommendations. Here are all the current recommendations:\n${event.data.allSteps?.map((s,i)=>`${i+1}. ${s}`).join('\n')}\n\nOne recommendation is being replaced. Generate the single best NEW recommendation that would be most impactful for this account AND does not duplicate any of the others. Be specific and actionable. Reply with ONLY valid JSON: {"title":"...","desc":"..."}`,
            }],
          },
        });
        if (handleAuthFailure(res)) { clearInterval(regenProgressTimerRef.current); return; }
        if (!res.ok) throw new Error(friendlyErrorMessage(res.status, `API error ${res.status}`));
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
    workerFetch(workerUrl, { token: sessionToken })
      .then(r => {
        if ((r.status === 401 || r.status === 403) && onSignOut) {
          onSignOut("Your session has expired — please sign in again.");
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (!data) return;
        setClients(Array.isArray(data) ? data : []);
        // Auto-select if only one client
        if (Array.isArray(data) && data.length === 1) {
          setSelectedClientId(data[0].id);
        }
      })
      .catch(() => setClientsError("Could not load clients from worker."));
  }, [settingsVersion]);


  const handleCancel = () => {
    generation.cancel();
    setStatusMessage("");
  };

  const handleCreateSlidesPrompt = async () => {
    const workerUrl = localStorage.getItem(WORKER_URL) || BAKED_WORKER_URL;
    if (!workerUrl || !reportHtml) return;
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
      const res = await workerFetch(workerUrl, {
        action: "anthropic",
        method: "POST",
        token: sessionToken,
        body: {
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
        },
      });
      if (handleAuthFailure(res)) { clearInterval(slidesProgressTimerRef.current); return; }
      if (!res.ok) throw new Error(friendlyErrorMessage(res.status, `API error ${res.status}`));
      const data = await res.json();
      const text = data.content?.[0]?.text ?? "";
      clearInterval(slidesProgressTimerRef.current);
      setSlidesProgress(100);
      setSlidesPrompt(text);
      setShowSlidesModal(true);
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
    // Block data exfiltration from the sandboxed report (fetch/XHR/WebSocket/beacon)
    // without affecting how the report renders or its print button.
    const csp = `<meta http-equiv="Content-Security-Policy" content="connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">`;
    const headInjection = `${csp}<style>*{cursor:none!important}</style>${relayScript}`;
    // Always land the CSP inside a <head>; if a report has none, prepend one so the
    // exfiltration guard can never silently fail open.
    const injected = /<\/head>/i.test(reportHtml)
      ? reportHtml.replace(/<\/head>/i, `${headInjection}</head>`)
      : `<head>${headInjection}</head>${reportHtml}`;
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
    if (!signedOff) {
      setError("Please tick “I’ve reviewed the figures” before downloading the report to send.");
      return;
    }
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

  // Download the exact Klaviyo inputs that produced a saved report, so a disputed
  // number can be reconstructed. Only available once a report has been saved (has a key).
  const handleDownloadData = async () => {
    const key = currentReportMeta?.key;
    const workerUrl = localStorage.getItem(WORKER_URL) || BAKED_WORKER_URL;
    if (!key || !workerUrl) { setError("Source data is available once the report has saved — try again in a moment."); return; }
    try {
      const res = await workerFetch(workerUrl, { action: "get-report-data", params: { key }, token: sessionToken });
      if (handleAuthFailure(res)) return;
      if (!res.ok) { setError("No saved source data for this report."); return; }
      const json = await res.text();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = accountName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      a.href = url;
      a.download = `${safeName}-${reportType.toLowerCase()}-source-data.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError("Couldn’t download the source data — please try again.");
    }
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px", gap: "16px" }}>
          <div style={{ minWidth: 0 }}>
            <img
              src="https://swankyagency.com/wp-content/uploads/2022/05/swanky-2020-black.png"
              alt="Swanky"
              style={{ height: "24px", opacity: 1 }}
            />
            <div
              style={{
                fontFamily: "'Ovo', serif",
                fontSize: "26px",
                fontWeight: 400,
                marginTop: "20px",
                lineHeight: 1.15,
                letterSpacing: "-0.01em",
                whiteSpace: "nowrap",
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
                whiteSpace: "nowrap",
              }}
            >
              Performance, considered
            </div>
          </div>

          {/* Right-side controls: session links + gear */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "2px", flexShrink: 0 }}>
            {session?.admin && onOpenAdmin && (
              <button
                onClick={onOpenAdmin}
                style={{
                  background: "none", border: "none", padding: 0,
                  fontFamily: "'Inter', sans-serif", fontSize: "9px", fontWeight: 500,
                  letterSpacing: "0.18em", textTransform: "uppercase",
                  color: adminPanelOpen ? "#0a0a0a" : "#b8b8b8",
                  cursor: "pointer", transition: "color 0.15s ease",
                }}
                onMouseEnter={e => e.currentTarget.style.color = "#6b6b6b"}
                onMouseLeave={e => e.currentTarget.style.color = adminPanelOpen ? "#0a0a0a" : "#b8b8b8"}
              >
                Users
              </button>
            )}
            {onSignOut && (
              <>
                <div style={{ width: "1px", height: "12px", background: "#ededed" }} />
                <button
                  onClick={onSignOut}
                  style={{
                    background: "none", border: "none", padding: 0,
                    fontFamily: "'Inter', sans-serif", fontSize: "9px", fontWeight: 500,
                    letterSpacing: "0.18em", textTransform: "uppercase",
                    color: "#b8b8b8", cursor: "pointer", transition: "color 0.15s ease",
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = "#6b6b6b"}
                  onMouseLeave={e => e.currentTarget.style.color = "#b8b8b8"}
                >
                  Sign out
                </button>
                <div style={{ width: "1px", height: "12px", background: "#ededed" }} />
              </>
            )}
            <button
              onClick={() => setShowFeedbackModal(true)}
              title="Report a bug or request a feature"
              aria-label="Send feedback"
              style={{
                background: "transparent", border: "none", cursor: "pointer", padding: "4px",
                color: "#b8b8b8", display: "flex", alignItems: "center", justifyContent: "center",
                transition: "color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#6b6b6b")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#b8b8b8")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m8 2 1.88 1.88" />
                <path d="M14.12 3.88 16 2" />
                <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
                <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
                <path d="M12 20v-9" />
                <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
                <path d="M6 13H2" />
                <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
                <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
                <path d="M22 13h-4" />
                <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
              </svg>
            </button>
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                title="API key settings"
                aria-label="Open settings"
                style={{
                  background: "transparent", border: "none", cursor: "pointer", padding: "4px",
                  color: "#b8b8b8", display: "flex", alignItems: "center", justifyContent: "center",
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
            )}
          </div>
        </div>

        <div style={{ height: "1px", background: "#ededed", margin: "0 0 24px" }} />

        {reportHtml && !isGenerating ? (
          /* ── Report mode: condensed action sidebar ── */
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

            <button
              onClick={handleNewReport}
              style={{
                display: "flex", alignItems: "center", gap: "8px",
                background: "transparent", border: "1px solid #ededed",
                padding: "11px 14px", width: "100%",
                fontFamily: "'DM Sans', sans-serif", fontSize: "11px",
                fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase",
                cursor: "pointer", color: "#0a0a0a", marginBottom: "20px",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#f8f6f2"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <svg width="12" height="10" viewBox="0 0 12 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="5,1 1,5 5,9" />
                <line x1="1" y1="5" x2="11" y2="5" />
              </svg>
              New report
            </button>

            {currentReportMeta && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontFamily: "'Ovo', serif", fontSize: "20px", fontWeight: 400, color: "#0a0a0a", lineHeight: 1.2, marginBottom: "5px" }}>
                  {currentReportMeta.accountName || accountName}
                </div>
                <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.14em", color: "#6b6b6b", fontWeight: 500, marginBottom: "2px" }}>
                  {currentReportMeta.reportType} report
                </div>
                {currentReportMeta.dateStart && (
                  <div style={{ fontSize: "11px", color: "#b8b8b8" }}>
                    {fmtDateDisplay(currentReportMeta.dateStart)} – {fmtDateDisplay(currentReportMeta.dateEnd)}
                  </div>
                )}
                {currentReportMeta.generatedAt && (
                  <div style={{ marginTop: "3px", fontSize: "10px", color: "#b8b8b8", textTransform: "uppercase", letterSpacing: "0.10em" }}>
                    Generated {relativeTime(currentReportMeta.generatedAt)}
                  </div>
                )}
              </div>
            )}

            <div style={{ height: "1px", background: "#ededed", marginBottom: "16px" }} />

            <SignOffCheckbox checked={signedOff} onChange={setSignedOff} />

            <button
              onClick={handleDownload}
              style={{
                width: "100%", padding: "11px 16px", background: "transparent",
                color: "#0a0a0a", border: "1px solid #0a0a0a",
                fontFamily: "'DM Sans', sans-serif", fontSize: "11px",
                fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase",
                cursor: "pointer", marginBottom: "8px", marginTop: "10px",
                opacity: signedOff ? 1 : 0.45,
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#f8f6f2"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              Download HTML
            </button>

            <button
              onClick={slidesPrompt && !isCreatingSlides ? () => setShowSlidesModal(true) : handleCreateSlidesPrompt}
              disabled={isCreatingSlides}
              style={{
                width: "100%", padding: "11px 16px", background: "transparent",
                color: isCreatingSlides ? "#b8b8b8" : "#0a0a0a",
                border: `1px solid ${isCreatingSlides ? "#ededed" : "#0a0a0a"}`,
                fontFamily: "'DM Sans', sans-serif", fontSize: "11px",
                fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase",
                cursor: isCreatingSlides ? "wait" : "pointer", marginBottom: "8px",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={e => { if (!isCreatingSlides) e.currentTarget.style.background = "#f8f6f2"; }}
              onMouseLeave={e => { if (!isCreatingSlides) e.currentTarget.style.background = "transparent"; }}
            >
              {isCreatingSlides ? "Generating…" : slidesPrompt ? "View Speedy Slides prompt" : "Speedy Slides prompt"}
            </button>

            {isCreatingSlides && (
              <div style={{ marginBottom: "8px" }}>
                <div style={{ width: "100%", height: "1px", background: "#ededed", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${slidesProgress}%`, background: "#0a0a0a", transition: "width 0.3s cubic-bezier(0.4,0,0.2,1)" }} />
                </div>
                <div style={{ marginTop: "5px", fontSize: "10px", color: "#6b6b6b", fontStyle: "italic", fontFamily: "'Ovo', serif" }}>
                  Structuring for Speedy Slides…
                </div>
              </div>
            )}

            {lastUsage && (
              <div style={{ marginTop: "4px", padding: "10px 0", borderTop: "0.5px solid #ededed", fontSize: "10px", color: "#6b6b6b", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                  <span style={{ letterSpacing: "0.10em", textTransform: "uppercase" }}>Cost</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: "#0a0a0a", fontWeight: 500 }}>${lastUsage.costUsd.toFixed(4)}</span>
                </div>
                {lastDuration != null && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                    <span style={{ letterSpacing: "0.10em", textTransform: "uppercase" }}>Time taken</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{lastDuration < 60 ? `${lastDuration}s` : `${Math.floor(lastDuration / 60)}m ${lastDuration % 60}s`}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ letterSpacing: "0.10em", textTransform: "uppercase" }}>Output tokens</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{lastUsage.outputTokens.toLocaleString()}</span>
                </div>
              </div>
            )}

            {error && (
              <div style={{ marginTop: "12px", padding: "12px 14px", border: "1px solid #0a0a0a", background: "#ededed", fontSize: "12px", lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            <div style={{ flex: 1, minHeight: "16px" }} />

            {clientReports.length > 0 && (
              <>
                <div style={{ height: "1px", background: "#ededed", marginBottom: "14px" }} />
                <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.16em", color: "#6b6b6b", marginBottom: "10px", fontWeight: 500 }}>
                  Past reports
                </div>
                <div style={{ overflowY: "auto", maxHeight: "240px", marginRight: "-8px", paddingRight: "8px" }}>
                  {loadingSavedReport ? (
                    <div style={{ padding: "10px", fontSize: "10px", color: "#b8b8b8", fontStyle: "italic", fontFamily: "'Ovo', serif" }}>
                      Loading…
                    </div>
                  ) : clientReports.map(entry => {
                    const entryName = entry.accountName || clients.find(c => c.id === entry.clientId)?.name || "Unknown";
                    const isCurrent = entry.key === currentReportMeta?.key;
                    return (
                      <div
                        key={entry.key}
                        style={{
                          display: "flex", alignItems: "stretch",
                          borderBottom: "0.5px solid #f0f0ec",
                          background: isCurrent ? "#f8f6f2" : "transparent",
                        }}
                        onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = "#fafaf8"; }}
                        onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = "transparent"; }}
                      >
                        <button
                          onClick={() => loadSavedReport(entry.key)}
                          style={{
                            flex: 1, textAlign: "left", padding: "8px 10px",
                            background: "transparent", border: "none",
                            cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          <div style={{ fontSize: "11px", fontWeight: 500, color: "#0a0a0a", marginBottom: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {entryName}
                          </div>
                          <div style={{ fontSize: "10px", color: "#6b6b6b", display: "flex", justifyContent: "space-between" }}>
                            <span style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>{entry.reportType}</span>
                            <span>{relativeTime(entry.generatedAt)}</span>
                          </div>
                        </button>
                        <button
                          onClick={(e) => deleteReport(entry.key, e)}
                          title="Delete report"
                          aria-label="Delete report"
                          style={{
                            background: "transparent", border: "none",
                            cursor: "pointer", color: "#d0d0d0",
                            padding: "0 8px", flexShrink: 0,
                            fontSize: "14px", lineHeight: 1,
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = "#0a0a0a"}
                          onMouseLeave={e => e.currentTarget.style.color = "#d0d0d0"}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : (
          /* ── Configure mode: report builder form ── */
          <>

        <Field label="Client">
          {clientsError ? (
            <div style={{ fontSize: "11px", color: "#6b6b6b", fontStyle: "italic", fontFamily: "'Ovo', serif" }}>
              {clientsError}
            </div>
          ) : null}
          <div ref={dropdownRef} style={{ position: "relative" }}>
            <button
              onClick={() => setDropdownOpen(o => !o)}
              aria-haspopup="listbox"
              aria-expanded={dropdownOpen}
              aria-label="Select client"
              style={{
                ...inputStyle,
                width: "100%",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#fff",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#f8f6f2"}
              onMouseLeave={e => e.currentTarget.style.background = "#fff"}
            >
              <span style={{ color: selectedClientId ? "#0a0a0a" : "#b8b8b8" }}>
                {selectedClientId ? (clients.find(c => c.id === selectedClientId)?.name ?? "—") : (clients.length === 0 ? "— no clients yet —" : "— select client —")}
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
                maxHeight: "260px",
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
                      color: "#b8b8b8", fontWeight: 400, transition: "background 0.15s ease",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8f6f2"}
                    onMouseLeave={e => e.currentTarget.style.background = selectedClientId === "" ? "#f8f6f2" : "transparent"}
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
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8f6f2"}
                    onMouseLeave={e => e.currentTarget.style.background = selectedClientId === c.id ? "#f8f6f2" : "transparent"}
                  >
                    {c.name}
                  </button>
                ))}
                {clients.length === 0 && (
                  <div style={{
                    padding: "10px 12px", fontFamily: "'DM Sans', sans-serif",
                    fontSize: "11px", fontWeight: 300, color: "#6b6b6b", lineHeight: 1.5,
                  }}>
                    {session?.admin
                      ? "No clients configured yet — add one with the + below."
                      : "No clients configured yet — ask a Swanky admin to add one."}
                  </div>
                )}
                {session?.admin && (
                  <button
                    onClick={() => { setDropdownOpen(false); setShowAddClientModal(true); }}
                    style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      width: "100%", textAlign: "left",
                      padding: "9px 12px", background: "transparent",
                      border: "none", borderTop: clients.length > 0 ? "1px solid #ededed" : "none",
                      fontFamily: "'DM Sans', sans-serif", fontSize: "11px",
                      color: "#6b6b6b", fontWeight: 400, cursor: "pointer",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = "#0a0a0a"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "#6b6b6b"; }}
                  >
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <line x1="5.5" y1="1" x2="5.5" y2="10" />
                      <line x1="1" y1="5.5" x2="10" y2="5.5" />
                    </svg>
                    Add new client
                  </button>
                )}
                {session?.admin && clients.length > 0 && (
                  <button
                    onClick={() => { setDropdownOpen(false); setShowOffboardModal(true); }}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "7px 12px", background: "transparent", border: "none",
                      fontFamily: "'DM Sans', sans-serif", fontSize: "10px",
                      color: "#b8b8b8", fontWeight: 400, cursor: "pointer",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = "#6b6b6b"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "#b8b8b8"; }}
                  >
                    Offboard a client…
                  </button>
                )}
              </div>
            )}
          </div>
        </Field>

        <Field label="Report type">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
            {reportTypes.map((t) => (
              <SegmentButton key={t} active={reportType === t} onClick={() => setReportType(t)}>
                {t}
              </SegmentButton>
            ))}
          </div>
        </Field>

        {reportType === "Custom" && (
          <Field label="Date range">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                aria-label="Start date"
                style={{ ...inputStyle, flex: "1 1 120px", minWidth: 0 }}
              />
              <span style={{ color: "#b8b8b8", fontSize: "11px", flexShrink: 0 }}>→</span>
              <input
                type="date"
                value={customEnd}
                min={customStart || undefined}
                onChange={(e) => setCustomEnd(e.target.value)}
                aria-label="End date"
                style={{ ...inputStyle, flex: "1 1 120px", minWidth: 0 }}
              />
            </div>
          </Field>
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

        <Field label="Model">
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {Object.entries(MODELS).map(([id, m]) => (
              <SegmentButton
                key={id}
                active={selectedModel === id}
                onClick={() => { setSelectedModel(id); localStorage.setItem(MODEL_KEY, id); }}
                fullWidth
              >
                {m.label}
              </SegmentButton>
            ))}
          </div>
          <div style={{ marginTop: "8px", fontSize: "10px", color: "#6b6b6b", fontFamily: "'Ovo', serif", fontStyle: "italic", lineHeight: 1.4 }}>
            {MODELS[selectedModel]?.blurb}
          </div>
        </Field>

        <Field label="Additional context">
          <ContextTextarea value={additionalContext} onChange={setAdditionalContext} />
        </Field>

        {clientReports.length > 0 && (
          <>
            <div style={{ height: "1px", background: "#ededed", margin: "8px 0 14px" }} />
            <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.16em", color: "#6b6b6b", marginBottom: "8px", fontWeight: 500 }}>
              Past reports
            </div>
            <div style={{ overflowY: "auto", maxHeight: "180px", marginRight: "-8px", paddingRight: "8px", marginBottom: "8px" }}>
              {clientReports.map(entry => (
                <button
                  key={entry.key}
                  onClick={() => loadSavedReport(entry.key)}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    width: "100%", textAlign: "left", padding: "7px 10px",
                    background: "transparent", border: "none",
                    borderBottom: "0.5px solid #f0f0ec",
                    cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "#fafaf8"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: 500, color: "#0a0a0a", marginBottom: "1px" }}>
                      {entry.reportType}{entry.dateStart ? ` · ${fmtDateDisplay(entry.dateStart)}–${fmtDateDisplay(entry.dateEnd)}` : ""}
                    </div>
                    <div style={{ fontSize: "10px", color: "#b8b8b8" }}>
                      {relativeTime(entry.generatedAt)}{entry.generatedBy ? ` · ${entry.generatedBy}` : ""}
                    </div>
                  </div>
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#b8b8b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <polyline points="1,4 7,4" /><polyline points="4,1 7,4 4,7" />
                  </svg>
                </button>
              ))}
            </div>
          </>
        )}

        <div style={{ flex: 1 }} />

        {spendStatus && (
          <div style={{ marginTop: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontFamily: "'DM Sans', sans-serif", fontSize: "9px", fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6b6b6b", marginBottom: "5px" }}>
              <span>AI spend · {spendStatus.month}</span>
              <span style={{ color: "#0a0a0a", fontWeight: spendStatus.ratio >= 1 ? 600 : 500 }}>
                ${spendStatus.spentUsd.toFixed(2)} / ${spendStatus.capUsd}
              </span>
            </div>
            <div style={{ height: "3px", background: "#ededed", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, (spendStatus.ratio || 0) * 100)}%`, background: "#0a0a0a", transition: "width 0.3s ease" }} />
            </div>
            {spendStatus.ratio >= 1 && (
              <div style={{ fontFamily: "'Ovo', serif", fontStyle: "italic", fontSize: "10px", color: "#6b6b6b", marginTop: "5px" }}>
                Monthly cap reached — further reports exceed it.
              </div>
            )}
          </div>
        )}

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
                transition: "background 0.15s ease",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#f8f6f2"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
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
            <SignOffCheckbox checked={signedOff} onChange={setSignedOff} />
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
                opacity: signedOff ? 1 : 0.45,
                transition: "background 0.15s ease",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#f8f6f2"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              Download HTML
            </button>
            <button
              onClick={handleDownloadData}
              title="Download the exact Klaviyo data this report was built from, for your records"
              style={{
                width: "100%", padding: "8px 20px", background: "transparent",
                color: "#6b6b6b", border: "none",
                fontFamily: "'DM Sans', sans-serif", fontSize: "9px", fontWeight: 500,
                letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer",
                marginTop: "4px",
              }}
              onMouseEnter={e => e.currentTarget.style.color = "#0a0a0a"}
              onMouseLeave={e => e.currentTarget.style.color = "#6b6b6b"}
            >
              Source data (JSON)
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
                transition: "background 0.15s ease",
              }}
              onMouseEnter={e => { if (!isCreatingSlides) e.currentTarget.style.background = "#f8f6f2"; }}
              onMouseLeave={e => { if (!isCreatingSlides) e.currentTarget.style.background = "transparent"; }}
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
          </>
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

        {(regenSid || isCreatingSlides) && (
          <ActivityBanner
            label={isCreatingSlides ? "Generating Speedy Slides prompt…" : "Regenerating recommendation…"}
            progress={isCreatingSlides ? slidesProgress : regenProgress}
          />
        )}

        {dataWarnings.length > 0 && (reportHtml || isGenerating) && (
          <div
            style={{
              marginBottom: "12px",
              border: "1px solid #0a0a0a",
              background: "#ffffff",
              padding: "12px 16px",
            }}
          >
            <div
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "9px",
                fontWeight: 600,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "#0a0a0a",
                marginBottom: "8px",
              }}
            >
              Incomplete data — review before sending
            </div>
            <ul style={{ margin: 0, paddingLeft: "16px" }}>
              {dataWarnings.map((w, i) => (
                <li
                  key={i}
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: "11px",
                    fontWeight: 300,
                    color: "#2a2a2a",
                    lineHeight: 1.55,
                  }}
                >
                  {w}
                </li>
              ))}
            </ul>
          </div>
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

      {/* Add client modal */}
      {showAddClientModal && (
        <AddClientModal
          onClose={() => setShowAddClientModal(false)}
          sessionToken={sessionToken}
          onAdded={(newClients) => {
            setClients(newClients);
            setShowAddClientModal(false);
            if (newClients.length === 1) setSelectedClientId(newClients[0].id);
          }}
        />
      )}

      {showOffboardModal && (
        <OffboardClientModal
          clients={clients}
          sessionToken={sessionToken}
          onClose={() => setShowOffboardModal(false)}
          onSignOut={onSignOut}
          onOffboarded={(updatedClients, removedId) => {
            setClients(updatedClients);
            setShowOffboardModal(false);
            if (selectedClientId === removedId) {
              setSelectedClientId("");
              handleNewReport();
            }
            refreshSavedReports();
          }}
        />
      )}

      {/* Bug report / feature request modal */}
      {showFeedbackModal && (
        <FeedbackModal
          onClose={() => setShowFeedbackModal(false)}
          sessionToken={sessionToken}
          onSignOut={onSignOut}
        />
      )}

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
          <div ref={slidesModalRef} role="dialog" aria-modal="true" aria-label="Speedy Slides prompt" style={{
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
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f8f6f2"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
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
                  onMouseEnter={e => { if (!slidesCopied) e.currentTarget.style.background = "#2a2a2a"; }}
                  onMouseLeave={e => { if (!slidesCopied) e.currentTarget.style.background = "#0a0a0a"; }}
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
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f8f6f2"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
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
