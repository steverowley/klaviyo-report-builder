// Pure helpers for finalising a streamed report. Extracted from ReportBuilder so
// the critical "never save or send a truncated report" logic is unit-testable
// without a browser. No imports — keep this module free of React/DOM so it runs
// in the plain vitest (node) environment.

// Pull the HTML document out of the raw model output: drop any preamble before
// <!DOCTYPE html> and any trailing text after </html>. Returns the cleaned html
// plus whether a closing </html> tag was actually present (a missing tag means
// the stream was truncated).
export function extractReportHtml(raw) {
  let html = String(raw ?? "");
  const start = html.search(/<!DOCTYPE\s+html/i);
  if (start > 0) html = html.slice(start);
  const closeIdx = html.search(/<\/html\s*>/i);
  const hasClosingTag = closeIdx !== -1;
  if (hasClosingTag) html = html.slice(0, closeIdx + "</html>".length);
  return { html: html.trim(), hasClosingTag };
}

// Decide whether a streamed report actually finished. A clean Anthropic stream
// ends with a `message_stop` event and a `message_delta` stop_reason of
// 'end_turn' (or 'stop_sequence'), and the document must contain its closing tag.
// Anything else means the connection dropped or the model errored mid-report — we
// must NOT save it or show it as complete. Returns a user-facing error string, or
// null when the report is genuinely complete.
export function reportCompletionError({ sawMessageStop, stopReason, hasClosingTag }) {
  if (stopReason === "max_tokens") {
    return "The report was too long and got cut off (max tokens reached). Try a shorter date range or contact Rowley to increase the output limit.";
  }
  const finishedCleanly =
    sawMessageStop || stopReason === "end_turn" || stopReason === "stop_sequence";
  if (!finishedCleanly) {
    return "The report was cut off before it finished — the connection dropped mid-generation. Please try generating it again.";
  }
  if (!hasClosingTag) {
    return "The report didn't finish rendering (its closing tag is missing). Please try generating it again.";
  }
  return null;
}

// A monochrome, print-safe notice embedded at the top of a report that was
// generated from incomplete Klaviyo data, so the warning travels with the
// downloaded/printed/emailed file — not just the in-app banner. Returns '' when
// there are no warnings. Escapes warning text since it can contain client data.
export function buildIncompleteDataNotice(warnings) {
  if (!Array.isArray(warnings) || warnings.length === 0) return "";
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const items = warnings.map((w) => `<li style="margin:2px 0">${esc(w)}</li>`).join("");
  return (
    `<div style="margin:0 0 16px;border:1px solid #0a0a0a;background:#fff;padding:12px 16px;` +
    `font-family:'DM Sans',sans-serif;color:#2a2a2a">` +
    `<div style="font-size:9px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;` +
    `color:#0a0a0a;margin-bottom:6px">Incomplete data — review before sending</div>` +
    `<ul style="margin:0;padding-left:16px;font-size:11px;font-weight:300;line-height:1.55">${items}</ul>` +
    `</div>`
  );
}

// Inject the incomplete-data notice just after the report's <body> tag (falling
// back to a prefix if there is no body tag). Returns the html unchanged when
// there are no warnings.
export function embedIncompleteDataNotice(html, warnings) {
  const notice = buildIncompleteDataNotice(warnings);
  if (!notice) return html;
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body[^>]*>/i, (m) => m + notice);
  }
  return notice + html;
}
