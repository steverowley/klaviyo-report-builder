import { describe, it, expect } from "vitest";
import { friendlyErrorMessage, isRetryableStatus } from "./errors.js";

describe("friendlyErrorMessage", () => {
  it("maps overload statuses to a 'busy, retry' message", () => {
    for (const s of [429, 503, 529]) {
      expect(friendlyErrorMessage(s)).toMatch(/busy/i);
    }
  });
  it("maps auth statuses to a session-expired message", () => {
    expect(friendlyErrorMessage(401)).toMatch(/session has expired/i);
    expect(friendlyErrorMessage(403)).toMatch(/session has expired/i);
  });
  it("maps other 5xx to a generic 'our side' message", () => {
    expect(friendlyErrorMessage(500)).toMatch(/our side/i);
  });
  it("falls back for unknown statuses", () => {
    expect(friendlyErrorMessage(418, "custom fallback")).toBe("custom fallback");
    expect(friendlyErrorMessage(undefined)).toMatch(/something went wrong/i);
  });
});

describe("isRetryableStatus", () => {
  it("retries transient overload/upstream statuses", () => {
    for (const s of [429, 500, 502, 503, 529]) expect(isRetryableStatus(s)).toBe(true);
  });
  it("does not retry client/permanent errors", () => {
    for (const s of [400, 401, 403, 404, 422]) expect(isRetryableStatus(s)).toBe(false);
  });
});
