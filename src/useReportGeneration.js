import { useState, useRef, useEffect } from "react";
import { extractReportHtml, reportCompletionError, embedIncompleteDataNotice } from "./reportHtml.js";
import { friendlyErrorMessage, isRetryableStatus } from "./errors.js";
import { buildReportSystemPrompt, buildReportUserMessage } from "./reportPrompt.js";
import { workerFetch } from "./workerApi.js";
import { readAnthropicSse } from "./anthropicStream.js";
import { getEcommerceEvents } from "./ecommerceEvents.js";

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
  { range: [84, 90], text: "Drafting recommendations, considered" },
  { range: [90, 98], text: "A final, careful proofread", hold: true },
  { range: [90, 98], text: "Adjusting the kerning, by hand", hold: true },
  { range: [90, 98], text: "Triple-checking the conversion rate", hold: true },
  { range: [90, 98], text: "Considering, at length, the comma", hold: true },
  { range: [90, 98], text: "A second opinion on the line break", hold: true },
  { range: [90, 98], text: "Folding the corners of the page", hold: true },
  { range: [90, 98], text: "Letting the ink dry properly", hold: true },
  { range: [90, 98], text: "One more pass for good measure", hold: true },
];

const lineForProgress = (p) => {
  const found = loadingLines.find(({ range, hold }) => !hold && p >= range[0] && p < range[1]);
  return found ? found.text : null;
};

const holdingLines = loadingLines.filter((l) => l.hold);

// Owns the full report-generation lifecycle: Klaviyo fetch + event filtering,
// the streamed Anthropic call (retry, watchdog, completion checks), progress
// theatre, and cancellation. The component supplies a validated config per
// generate() call and receives the finished report via onComplete — what to do
// with it (render, persist, track spend) stays the caller's business.
export function useReportGeneration({ sessionToken, onSignOut, onComplete }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [loadingLine, setLoadingLine] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [justFinished, setJustFinished] = useState(false);
  const [lastUsage, setLastUsage] = useState(null);
  const [lastDuration, setLastDuration] = useState(null);
  const [dataWarnings, setDataWarnings] = useState([]);

  const progressTimerRef = useRef(null);
  const lineTimerRef = useRef(null);
  const elapsedTimerRef = useRef(null);
  const abortControllerRef = useRef(null);
  const requestIdRef = useRef(0);

  const clearTimers = () => {
    [progressTimerRef, lineTimerRef, elapsedTimerRef].forEach((r) => {
      if (r.current) {
        clearInterval(r.current);
        r.current = null;
      }
    });
  };

  useEffect(() => () => clearTimers(), []);

  // cfg: { workerUrl, clientId, accountName, reportType, comparisonMode,
  //        additionalContext, model, maxOutputTokens, pricing, range, comparison }
  // — already validated by the caller.
  const generate = async (cfg) => {
    const { workerUrl, range, comparison } = cfg;

    setIsGenerating(true);
    setDataWarnings([]);
    setProgress(0);
    setLoadingLine("Knocking politely on Klaviyo's door");
    setElapsedSeconds(0);
    setJustFinished(false);

    requestIdRef.current += 1;
    const myRequestId = requestIdRef.current;

    const startedAt = Date.now();
    let holdingLineIndex = 0;

    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    // Single smooth timer running from t=0 through all phases.
    // Phase 1+1b target: 0→20% (τ=5s — moves visibly during the Klaviyo/Haiku fetches).
    // Hands off to the Anthropic timer once that starts.
    const PRE_TAU_MS = 5000;
    progressTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const next = Math.min(19, 19 * (1 - Math.exp(-elapsed / PRE_TAU_MS)));
      setProgress(next);
      const line = lineForProgress(next);
      if (line) setLoadingLine(line);
    }, 100);

    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    // Idle-stream watchdog: if the SSE goes silent for too long, abort and tell the
    // user it stalled (distinguished from a user cancel via the timedOut flag).
    let timedOut = false;
    let watchdog = null;

    try {
      // ── Phase 1: fetch Klaviyo data + filter ecommerce events in PARALLEL ──
      // The Haiku almanac call doesn't depend on the Klaviyo data — only on the
      // date range, brand name and context — so both round-trips overlap.
      const allEvents = getEcommerceEvents(range.start, range.end, cfg.accountName, cfg.additionalContext);

      setLoadingLine("Consulting the almanac");

      const klaviyoPromise = (async () => {
        const workerRes = await workerFetch(workerUrl, {
          method: "POST",
          token: sessionToken,
          body: {
            clientId: cfg.clientId,
            startDate: range.start,
            endDate: range.end,
            ...(comparison ? { comparisonStart: comparison.start, comparisonEnd: comparison.end } : {}),
          },
          signal,
        });
        if (!workerRes.ok) {
          const errData = await workerRes.json().catch(() => ({}));
          const err = new Error(`Klaviyo data fetch failed: ${errData.error || `HTTP ${workerRes.status}`}`);
          err.status = workerRes.status;
          throw err;
        }
        return workerRes.json();
      })();

      const eventsPromise = (async () => {
        if (allEvents.length === 0) return allEvents;
        try {
          const filterRes = await workerFetch(workerUrl, {
            action: "anthropic",
            method: "POST",
            token: sessionToken,
            body: {
              model: "claude-haiku-4-5-20251001",
              max_tokens: 512,
              messages: [{
                role: "user",
                content: `You are configuring chart annotations for an email marketing report.
Client: "${cfg.accountName}"${cfg.additionalContext.trim() ? `\nContext: ${cfg.additionalContext.trim()}` : ""}
Potential calendar events in this period:
${allEvents.map((e, i) => `${i}: ${e.name} (${e.date}) [${e.type}]`).join("\n")}

Return ONLY a JSON array of the index numbers for events that are commercially relevant to THIS specific brand — events that could plausibly explain a spike or dip in their email metrics. Be inclusive for genuinely relevant events; exclude only what is clearly irrelevant to this business. Example: [0,2,5]`,
              }],
            },
            signal,
          });
          if (filterRes.ok) {
            const filterData = await filterRes.json();
            const text = filterData.content?.[0]?.text || "";
            const match = text.match(/\[[\d,\s]*\]/);
            if (match) {
              const indices = JSON.parse(match[0]);
              const picked = indices.map(i => allEvents[i]).filter(Boolean);
              if (picked.length > 0) return picked;
            }
          }
        } catch (_) {
          // Fall through and use all events
        }
        return allEvents;
      })();

      const [klaviyoData, relevantEvents] = await Promise.all([klaviyoPromise, eventsPromise]);

      if (myRequestId !== requestIdRef.current) return;

      const warnings = Array.isArray(klaviyoData.warnings) ? klaviyoData.warnings : [];
      // Flag a completely empty period so an all-blank report can't be sent unnoticed.
      const agg = klaviyoData.aggregates || {};
      const noActivity = ["subscribers", "orders", "unsubscribes"].every((k) => {
        const counts = agg[k]?.counts;
        return !Array.isArray(counts) || counts.every((v) => !v);
      });
      if (!klaviyoData.period?.campaigns?.length && !klaviyoData.period?.flows?.length && noActivity) {
        warnings.unshift("No campaigns, flows, or daily activity were found for this client in this period — double-check the client and date range before sending.");
      }
      setDataWarnings(warnings);

      // Hand off: clear pre-phase timer. Start a fallback asymptotic timer so progress
      // never freezes even if SSE updates stall. Streaming overrides it via setProgress.
      clearInterval(progressTimerRef.current);
      const preElapsed = Date.now() - startedAt;
      const handoffPct = Math.min(19, 19 * (1 - Math.exp(-preElapsed / PRE_TAU_MS)));
      const anthropicStartedAt = Date.now();
      const TAU_MS = 65000;

      progressTimerRef.current = setInterval(() => {
        const el = Date.now() - anthropicStartedAt;
        const fb = Math.min(96, handoffPct + (96 - handoffPct) * (1 - Math.exp(-el / TAU_MS)));
        setProgress(p => Math.max(p, fb));
        const fl = lineForProgress(fb);
        if (!fl) {
          setLoadingLine(holdingLines[holdingLineIndex % holdingLines.length].text);
        }
      }, 300);

      lineTimerRef.current = setInterval(() => {
        const el = Date.now() - anthropicStartedAt;
        if (el >= TAU_MS * 0.5) {
          setLoadingLine(holdingLines[holdingLineIndex % holdingLines.length].text);
          holdingLineIndex++;
        }
      }, 4000);

      // ── Phase 2: stream HTML from Anthropic ─────────────────────────────────
      const anthropicReqBody = {
        model: cfg.model,
        max_tokens: cfg.maxOutputTokens,
        stream: true,
        system: [{ type: "text", text: buildReportSystemPrompt({ accountName: cfg.accountName, reportType: cfg.reportType }), cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: buildReportUserMessage({ klaviyoData, events: relevantEvents, range, comparison, reportType: cfg.reportType, comparisonMode: cfg.comparisonMode, additionalContext: cfg.additionalContext }) }],
      };

      // Retry the initial request on transient overload (429/5xx/529) with backoff,
      // before any bytes have streamed. Mid-stream failures are handled in the loop.
      let anthropicRes;
      for (let attempt = 0; ; attempt++) {
        anthropicRes = await workerFetch(workerUrl, {
          action: "anthropic",
          method: "POST",
          token: sessionToken,
          body: anthropicReqBody,
          signal,
        });
        if (myRequestId !== requestIdRef.current) return;
        if (anthropicRes.ok) break;
        if (isRetryableStatus(anthropicRes.status) && attempt < 2) {
          const ra = parseInt(anthropicRes.headers.get("retry-after") || "", 10);
          const backoff = Number.isFinite(ra) ? Math.min(ra * 1000, 15000) : 1500 * Math.pow(2, attempt);
          setLoadingLine("The AI service is busy — retrying in a moment");
          await new Promise(r => setTimeout(r, backoff));
          if (myRequestId !== requestIdRef.current) return;
          continue;
        }
        // Non-retryable or out of retries — surface friendly guidance.
        let message = friendlyErrorMessage(anthropicRes.status, `Anthropic API error ${anthropicRes.status}`);
        if (anthropicRes.status < 500 && anthropicRes.status !== 429) {
          try { const errData = await anthropicRes.json(); if (errData.error?.message) message = errData.error.message; } catch (_) {}
        }
        const err = new Error(message);
        err.status = anthropicRes.status;
        throw err;
      }

      // Read the SSE stream — accumulate full HTML, drive progress from real token count
      const reader = anthropicRes.body.getReader();
      const IDLE_MS = 90000;
      let lastActivity = Date.now();
      watchdog = setInterval(() => {
        if (Date.now() - lastActivity > IDLE_MS) {
          timedOut = true;
          try { abortControllerRef.current?.abort(); } catch (_) {}
        }
      }, 5000);
      // Scale progress denominator to the report's actual token budget so the bar
      // doesn't peg early on long ranges or crawl on short ones. Reports typically
      // emit ~70% of max_tokens, with a 10k floor for the bar to feel responsive.
      const EST_OUTPUT = Math.max(10000, Math.round(cfg.maxOutputTokens * 0.7));

      const stream = await readAnthropicSse(reader, {
        onActivity: () => { lastActivity = Date.now(); },
        isCancelled: () => myRequestId !== requestIdRef.current,
        onTextDelta: (_delta, tokensSoFar) => {
          // Update every 50 tokens — more responsive than 100
          if (tokensSoFar % 50 === 0) {
            const pct = Math.min(96, handoffPct + (96 - handoffPct) * Math.min(1, tokensSoFar / EST_OUTPUT));
            setProgress(p => Math.max(p, pct));
            const line2 = lineForProgress(pct);
            if (line2) setLoadingLine(line2);
            else {
              setLoadingLine(holdingLines[holdingLineIndex % holdingLines.length].text);
              if (tokensSoFar % 2000 === 0) holdingLineIndex++;
            }
          }
        },
      });
      // A superseded run must take its watchdog with it: the interval closes
      // over this run's frozen lastActivity, so left alive it would fire ~90s
      // later and abort whatever request abortControllerRef holds by then —
      // killing a NEW generation mid-stream. (Reachable: open a past report
      // while generating, then hit Generate again.)
      if (stream.cancelled) { clearInterval(watchdog); return; }
      let rawHtml = stream.text;
      const { stopReason, sawMessageStop, inputUsage, outputTokens } = stream;

      clearInterval(watchdog);
      if (myRequestId !== requestIdRef.current) return;

      // Pull out the HTML document, then verify the stream actually completed. A
      // mid-stream error, dropped connection, or max-tokens cutoff must NOT be saved
      // or shown as a finished report — staff could otherwise send a client a
      // half-written document that looks complete.
      const extracted = extractReportHtml(rawHtml);
      const completionError = reportCompletionError({
        sawMessageStop,
        stopReason,
        hasClosingTag: extracted.hasClosingTag,
      });
      if (completionError) throw new Error(completionError);
      rawHtml = extracted.html;

      // Build usage object from streaming events (input from message_start, output from message_delta)
      const streamUsage = {
        input_tokens: inputUsage.input_tokens || 0,
        cache_creation_input_tokens: inputUsage.cache_creation_input_tokens || 0,
        cache_read_input_tokens: inputUsage.cache_read_input_tokens || 0,
        output_tokens: outputTokens,
      };

      // Inject event markers script — using JSON.stringify avoids all apostrophe/quote syntax errors
      const eventsForChart = relevantEvents.map(e => ({ label: e.chartLabel, name: e.name }));
      const annotationScript = `<script>
window.CHART_EVENTS=${JSON.stringify(eventsForChart)};
function addEventMarkers(chart,events){
  if(!events||!events.length)return;
  var wrapper=chart.canvas.parentNode;
  wrapper.style.position='relative';
  function place(){
    try{
      wrapper.querySelectorAll('.evt-marker').forEach(function(el){el.remove();});
      events.forEach(function(ev){
        var idx=chart.data.labels.indexOf(ev.label);
        if(idx===-1)return;
        var x=Math.round(chart.scales.x.getPixelForValue(idx));
        var col=document.createElement('div');
        col.className='evt-marker';
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
  place();
  if(typeof ResizeObserver!=='undefined'){
    var ro=new ResizeObserver(function(){place();});
    ro.observe(chart.canvas);
  }
}
<\/script>`;
      rawHtml = rawHtml.replace(/<\/head>/i, annotationScript + '</head>');

      // If the underlying Klaviyo data was incomplete, bake a visible notice into the
      // report itself so the warning travels with the downloaded/printed/sent file —
      // not just the in-app banner that disappears on reload.
      rawHtml = embedIncompleteDataNotice(rawHtml, warnings);

      const u = streamUsage;
      const costUsd =
        (u.input_tokens || 0) * cfg.pricing.input / 1_000_000 +
        (u.cache_creation_input_tokens || 0) * cfg.pricing.cacheWrite / 1_000_000 +
        (u.cache_read_input_tokens || 0) * cfg.pricing.cacheRead / 1_000_000 +
        (u.output_tokens || 0) * cfg.pricing.output / 1_000_000;
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

      // Hand the finished report to the caller (render, persist, track spend).
      // isCurrent lets async follow-ups check the run hasn't been superseded.
      onComplete({
        html: rawHtml,
        warnings,
        costUsd,
        config: cfg,
        relevantEvents,
        klaviyoData,
        isCurrent: () => myRequestId === requestIdRef.current,
      });
      setJustFinished(true);

    } catch (e) {
      clearInterval(watchdog);
      if (myRequestId !== requestIdRef.current) return;
      if (e.name === "AbortError") {
        // The watchdog aborted a stalled stream — tell the user. A genuine user
        // cancel bumps requestIdRef, so it returns above and never reaches here.
        if (timedOut) {
          clearTimers();
          setError("The report generation stalled (no response for 90 seconds) — please try again.");
          setProgress(0);
          setJustFinished(false);
          setIsGenerating(false);
        }
        return;
      }

      clearTimers();
      if ((e.status === 401 || e.status === 403) && onSignOut) {
        onSignOut("Your session has expired — please sign in again.");
        return;
      }
      setError(e.message || "Something went wrong. Check your settings and try again.");
      setProgress(0);
      setJustFinished(false);
      setIsGenerating(false);
    }
  };

  const cancel = () => {
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
  };

  const dismissCompletion = () => {
    setJustFinished(false);
    setIsGenerating(false);
    setProgress(0);
  };

  return {
    isGenerating, setIsGenerating,
    error, setError,
    progress, setProgress,
    loadingLine,
    elapsedSeconds,
    justFinished, setJustFinished,
    lastUsage, setLastUsage,
    lastDuration, setLastDuration,
    dataWarnings, setDataWarnings,
    generate,
    cancel,
    dismissCompletion,
  };
}
