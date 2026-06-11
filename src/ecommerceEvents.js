// UK-centric ecommerce event calendar — holidays, gifting peaks, Black Friday,
// paydays, and (for school/education brands) term dates that can explain spikes
// or dips in email metrics. Pure date math, no component state.
import { fmtEventDate, parseLocalDate, fmtChartLabel } from "./dateUtils.js";

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

const SCHOOL_KEYWORDS =/school|uniform|schoolwear|education|nursery|academy|college|pupil|student|kids ?wear|childrenswear|children.?s wear/i;

function isSchoolBrand(accountName, context) {
  return SCHOOL_KEYWORDS.test(accountName) || SCHOOL_KEYWORDS.test(context || "");
}

export function getEcommerceEvents(startDate, endDate, accountName, context) {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  const events = [];
  const MS = 86400000;
  const school = isSchoolBrand(accountName, context);

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

    if (school) {
      // UK school terms (England approximate) — only for school/education brands
      add(new Date(y, 6, 22),  "School Summer Holidays",   "school");   // ~22 Jul
      add(new Date(y, 6, 25),  "Uniform buying peak",      "school");   // late Jul — schoolwear peak
      add(new Date(y, 8, 3),   "Autumn Term Starts",       "school");   // ~1st week Sep
      add(new Date(y, 9, 28),  "Autumn Half Term",         "school");   // ~last week Oct
      add(new Date(y, 11, 19), "School Christmas Break",   "school");   // ~3rd week Dec
      add(new Date(y, 0, 7),   "Spring Term Starts",       "school");   // ~7 Jan
      add(new Date(y, 1, 17),  "Spring Half Term",         "school");   // ~3rd week Feb
      const summerTermStart = new Date(easter.getTime() + 14 * MS);
      add(summerTermStart,                                 "Summer Term Starts",  "school");
      add(nthWeekday(y, 4, 1, 4), "May Half Term",        "school");   // ~last Mon May
    }

    add(new Date(y, 7, 28),  "Summer Bank Holiday",      "holiday");
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
