// Pure date helpers, extracted from ReportBuilder so the timezone-sensitive logic
// is unit-testable. Report date windows must be computed entirely in LOCAL calendar
// terms: parse strings with parseLocalDate, format Dates back with fmtEventDate, and
// never round-trip through toISOString() (which converts to UTC and can shift the
// date by a day for non-UTC operators).

export function fmtEventDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Parse a YYYY-MM-DD string as LOCAL midnight. `new Date("2026-06-01")` parses as
// UTC midnight, which shifts the date by a day for non-UTC operators.
export function parseLocalDate(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

// Shift a date by whole years, clamping the Feb-29 → Mar-1 overflow back to Feb 28
// so a year-on-year comparison window keeps the same calendar anchor.
export function shiftYear(date, delta) {
  const month = date.getMonth();
  const nd = new Date(date);
  nd.setFullYear(nd.getFullYear() + delta);
  if (nd.getMonth() !== month) nd.setDate(0); // overflowed into the next month → last day of intended month
  return nd;
}

export function fmtChartLabel(d) {
  const day = d.getDate();
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
  return `${day} ${month}`;
}

// Validate a report date window (YYYY-MM-DD strings). `todayStr` is the operator's
// local today. Reports cover complete days only (up to yesterday), so the end must
// be before today. Returns a friendly error string, or null when the range is fine.
export function validateReportDates(start, end, todayStr) {
  if (!start || !end) return "Please choose a start and end date.";
  if (end < start) return "The end date can’t be before the start date.";
  if (end >= todayStr) return "The end date must be before today — reports only cover complete days (up to yesterday).";
  const span = (parseLocalDate(end) - parseLocalDate(start)) / 86400000;
  if (span > 366) return "That date range is too long — please choose a year or less.";
  return null;
}
