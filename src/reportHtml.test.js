import { describe, it, expect } from "vitest";
import {
  extractReportHtml,
  reportCompletionError,
  buildIncompleteDataNotice,
  embedIncompleteDataNotice,
} from "./reportHtml.js";

describe("extractReportHtml", () => {
  it("strips preamble before <!DOCTYPE html>", () => {
    const raw = "Here is your report:\n<!DOCTYPE html><html><body>x</body></html>";
    const { html, hasClosingTag } = extractReportHtml(raw);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(hasClosingTag).toBe(true);
  });

  it("strips trailing content after </html>", () => {
    const raw = "<!DOCTYPE html><html></html>\n\nLet me know if you want changes!";
    const { html } = extractReportHtml(raw);
    expect(html.endsWith("</html>")).toBe(true);
  });

  it("flags a truncated document with no closing tag", () => {
    const raw = "<!DOCTYPE html><html><body>half a repo";
    const { html, hasClosingTag } = extractReportHtml(raw);
    expect(hasClosingTag).toBe(false);
    expect(html).toContain("half a repo"); // content kept so callers can inspect
  });

  it("handles null/undefined input", () => {
    expect(extractReportHtml(undefined).hasClosingTag).toBe(false);
    expect(extractReportHtml(null).html).toBe("");
  });
});

describe("reportCompletionError", () => {
  it("returns null for a clean, complete stream", () => {
    expect(
      reportCompletionError({ sawMessageStop: true, stopReason: "end_turn", hasClosingTag: true })
    ).toBeNull();
  });

  it("flags a max_tokens cutoff", () => {
    const msg = reportCompletionError({ sawMessageStop: true, stopReason: "max_tokens", hasClosingTag: true });
    expect(msg).toMatch(/cut off/i);
    expect(msg).toMatch(/shorter date range/i);
  });

  it("flags a dropped connection (no terminal signal)", () => {
    const msg = reportCompletionError({ sawMessageStop: false, stopReason: null, hasClosingTag: true });
    expect(msg).toMatch(/cut off before it finished/i);
  });

  it("flags a clean stop that is nonetheless missing its closing tag", () => {
    const msg = reportCompletionError({ sawMessageStop: true, stopReason: "end_turn", hasClosingTag: false });
    expect(msg).toMatch(/didn't finish rendering/i);
  });

  it("accepts stop_sequence as a clean finish", () => {
    expect(
      reportCompletionError({ sawMessageStop: false, stopReason: "stop_sequence", hasClosingTag: true })
    ).toBeNull();
  });
});

describe("buildIncompleteDataNotice", () => {
  it("returns empty string when there are no warnings", () => {
    expect(buildIncompleteDataNotice([])).toBe("");
    expect(buildIncompleteDataNotice(undefined)).toBe("");
  });

  it("lists each warning and escapes HTML", () => {
    const html = buildIncompleteDataNotice(["No <Placed Order> metric", "Revenue & orders partial"]);
    expect(html).toMatch(/Incomplete data/i);
    expect(html).toContain("&lt;Placed Order&gt;");
    expect(html).toContain("Revenue &amp; orders partial");
  });
});

describe("embedIncompleteDataNotice", () => {
  it("inserts the notice right after the <body> tag", () => {
    const out = embedIncompleteDataNotice("<html><body>report</body></html>", ["missing metric"]);
    expect(out).toMatch(/<body>\s*<div[^>]*>[\s\S]*Incomplete data/i);
  });

  it("returns html unchanged when there are no warnings", () => {
    const html = "<html><body>report</body></html>";
    expect(embedIncompleteDataNotice(html, [])).toBe(html);
  });
});
