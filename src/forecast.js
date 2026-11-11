// src/forecast.js
// Schedule and input for the quarterly spending forecast. Pure functions only
// (no React), so they are easy to test.
//
// Team rules:
//  - Months are calendar months.
//  - The forecast is due on the 1st of the 4th month after the user started
//    (first entry any day in January -> April 1), then every 3 months after
//    that (July 1, October 1, ...).
//  - The backend is stateless: the app sends weekly totals and the user's
//    target, and gets back a verdict (POST /v1/forecast).

export const FORECAST_MONTHS = 3;
export const HORIZON_WEEKS = 4;

const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, "0");

// Local YYYY-MM-DD. toISOString() would move the day back for users ahead of
// UTC (midnight in the Philippines is the previous day in UTC).
export const toDateKey = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// First day of the month, `offset` months after the month of `d`
const monthStart = (d, offset = 0) =>
  new Date(d.getFullYear(), d.getMonth() + offset, 1);

// Whole days between two dates, by calendar day (ignores time of day)
const dayDiff = (a, b) =>
  Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
      Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
      DAY_MS
  );

// Every forecast date that has arrived by `now`, oldest first.
// `startedAt` is when the user started (their first entry), as a date or ISO string.
export function dueDates(startedAt, now = new Date()) {
  const start = monthStart(new Date(startedAt));
  const dates = [];
  for (let k = 1; k < 200; k++) {
    const due = monthStart(start, FORECAST_MONTHS * k);
    if (due > now) break;
    dates.push(due);
  }
  return dates;
}

// The forecast to generate now, or null. If several are overdue (the app was
// not opened for months) only the latest matters. `savedKeys` are the
// date keys (toDateKey) of forecasts that were already generated and saved.
export function pendingDue(startedAt, savedKeys = [], now = new Date()) {
  const saved = new Set(savedKeys);
  const open = dueDates(startedAt, now).filter((d) => !saved.has(toDateKey(d)));
  return open.length ? open[open.length - 1] : null;
}

// Weekly spending totals up to `due` (the day the forecast is generated).
// Weeks are 7-day blocks that end on the day before `due`, so the newest
// week is always complete. Days left over at the very start are dropped,
// because recent habits matter more than the first few days. Weeks with no
// spending are 0, not missing. Amounts are raw; the backend caps one-off
// big purchases itself.
export function weeklyTotals(entries, startedAt, due) {
  const start = monthStart(new Date(startedAt));
  const weeks = Math.floor(dayDiff(start, due) / 7);
  if (weeks < 1) return [];

  const first = new Date(due.getFullYear(), due.getMonth(), due.getDate() - 7 * weeks);
  const totals = new Array(weeks).fill(0);

  for (const e of entries) {
    const amount = Number(e?.amount);
    const when = new Date(e?.createdAt);
    if (!Number.isFinite(amount) || amount < 0 || Number.isNaN(when.getTime())) continue;
    const week = Math.floor(dayDiff(first, when) / 7);
    if (week >= 0 && week < weeks) totals[week] += amount;
  }

  return totals.map((total, i) => ({
    week_start: toDateKey(
      new Date(first.getFullYear(), first.getMonth(), first.getDate() + 7 * i)
    ),
    total: Math.round(total * 100) / 100,
  }));
}

// The body for POST /v1/forecast
export function buildForecastRequest(entries, startedAt, due, targetWeekly) {
  const target = Number(targetWeekly);
  if (!(target > 0)) throw new Error("Set a target weekly spending first");
  return {
    weekly_totals: weeklyTotals(entries, startedAt, due),
    horizon: HORIZON_WEEKS,
    target_weekly: target,
  };
}
