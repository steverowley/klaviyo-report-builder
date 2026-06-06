import { describe, it, expect } from "vitest";
import { fmtEventDate, parseLocalDate, shiftYear } from "./dateUtils.js";

describe("parseLocalDate + fmtEventDate round-trip", () => {
  // The whole point: a YYYY-MM-DD string must survive a parse→format round-trip
  // unchanged in ANY timezone. The old toISOString() approach failed this for
  // operators east/west of UTC; local-component parsing/formatting is stable.
  it("round-trips a date string without shifting", () => {
    for (const s of ["2026-01-01", "2026-06-01", "2026-12-31", "2024-02-29"]) {
      expect(fmtEventDate(parseLocalDate(s))).toBe(s);
    }
  });

  it("parses to local midnight (not UTC)", () => {
    const d = parseLocalDate("2026-06-01");
    expect(d.getHours()).toBe(0);
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(5);
  });
});

describe("shiftYear", () => {
  it("shifts a normal date back a year", () => {
    expect(fmtEventDate(shiftYear(parseLocalDate("2025-03-15"), -1))).toBe("2024-03-15");
  });

  it("clamps Feb 29 to Feb 28 in a non-leap target year", () => {
    expect(fmtEventDate(shiftYear(parseLocalDate("2024-02-29"), -1))).toBe("2023-02-28");
  });

  it("keeps Feb 29 when the target year is also a leap year", () => {
    expect(fmtEventDate(shiftYear(parseLocalDate("2024-02-29"), -4))).toBe("2020-02-29");
  });
});
