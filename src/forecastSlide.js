// src/forecastSlide.js
// Data for the forecast slide of the Budgey Recap: a line graph of what the user
// spent each week, next to what Budgey's forecast said. Pure functions only
// (no React), so they are easy to test. forecast.js has the schedule rules.
//
// A forecast is made every month (on its "due" date, the 1st; the first one
// after 3 months of history) and covers the next 4 weeks. Every monthly recap
// that has a forecast shows the slide, in one of two modes:
//
//   first   There is no earlier forecast to compare with (the app's first
//           forecast, or the month before was never generated). Left: the past
//           weeks (up to 13) of spending. Right: the 4 weeks Budgey predicts.
//   review  Left: the past weeks, with LAST month's forecast laid over the 4
//           weeks it was about (this is the comparison). Right: the NEW forecast
//           for the next 4 weeks.
//
// Weeks sit on a grid of 7-day blocks that starts on a forecast's due date, the
// same grid the backend used (its first forecast week starts on the due date).
// Week k starts k * 7 days after the due date; k is negative for the weeks
// before it. Only complete weeks that ended before the recap's month are drawn
// as spending, and the first week is the first full week after the user started
// (a week that began earlier would show as a false dip).
//
// A "review" uses two grids: the past weeks sit on last month's grid and the new
// forecast's weeks on its own. A month is 28 to 31 days, not a whole number of
// weeks, so the new grid starts 7 to 10 days after the last full week of the old
// one; the 0 to 3 leftover days belong to no complete week and are left out (the
// backend also drops leftover days).

import { dayDiff, dueDates, toDateKey } from "./forecast.js"; // ".js" so this file runs in plain Node

export const PAST_WEEKS = 13; // how many past weeks the graph shows, at most

// A week far above the usual ones (a phone, tuition) is drawn clipped at the top
// instead of flattening every other week. Same idea as the backend's one-off cap.
const OUTLIER_MULTIPLE = 3;

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const round2 = (n) => Math.round(n * 100) / 100;
const mean = (list) => list.reduce((t, x) => t + x, 0) / list.length;
const median = (list) => {
  const s = [...list].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// Calendar-day arithmetic (not milliseconds), so a daylight-saving change cannot move a week.
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// "2027-04-01" -> local Date
const parseDateKey = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// Spending per week on the grid described above. Returns the totals for weeks
// k = from .. to - 1 (rounded to centavos). Weeks with no spending are 0.
// Entries with an unusable amount or date are skipped, like in forecast.js.
export function weekTotalsOnGrid(entries, origin, from, to) {
  const count = Math.max(0, to - from);
  const totals = new Array(count).fill(0);
  for (const e of entries ?? []) {
    const amount = Number(e?.amount);
    const when = new Date(e?.createdAt);
    if (!Number.isFinite(amount) || amount < 0 || Number.isNaN(when.getTime())) continue;
    const k = Math.floor(dayDiff(origin, when) / 7);
    if (k >= from && k < to) totals[k - from] += amount;
  }
  return totals.map(round2);
}

// A "nice" top for the peso axis and its grid lines: steps of 1, 2, 2.5 or 5
// times a power of ten, with a little headroom above `top`.
export function niceScale(top, maxTicks = 4) {
  const max = top > 0 ? top * 1.08 : 100;
  const raw = max / maxTicks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
  const yMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let i = 0; i * step <= yMax + step / 1e6; i++) ticks.push(round2(i * step));
  return { yMax: round2(yMax), ticks };
}

// Peso label for the axis: in full under 10,000 (₱1,500), compact above (₱12.3k, ₱1.3M)
export function axisPeso(n) {
  const v = Math.abs(n);
  const trim = (x) => String(Math.round(x * 10) / 10);
  if (v >= 1e6) return `₱${trim(n / 1e6)}M`;
  if (v >= 1e4) return `₱${trim(n / 1e3)}k`;
  return `₱${Math.round(n).toLocaleString("en-PH")}`;
}

// Month labels for the bottom axis: at the first week that starts in a new month.
// The very first label is left out when the next month starts right after it,
// so two labels never sit on top of each other.
export function monthTicks(slots) {
  const month = (s) => parseDateKey(s.start).getMonth();
  const ticks = [];
  slots.forEach((s, i) => {
    if (i === 0 || month(s) !== month(slots[i - 1])) {
      ticks.push({ index: i, label: SHORT_MONTHS[month(s)] });
    }
  });
  if (ticks.length > 1 && ticks[1].index - ticks[0].index < 2) ticks.shift();
  return ticks;
}

const pointTotal = (points, k) => {
  const total = points?.[k]?.total;
  return Number.isFinite(total) ? total : null;
};

// Row of the slot list that holds a prediction, as { from, to } (inclusive), or null
function span(slots, field) {
  let from = -1;
  let to = -1;
  slots.forEach((s, i) => {
    if (s[field] !== null) {
      if (from < 0) from = i;
      to = i;
    }
  });
  return from < 0 ? null : { from, to };
}

// How the weeks that have passed compare with the forecast made for them.
// `weeksDone` = complete weeks since the forecast's due date.
function buildReview(record, entries, gridDue, weeksDone) {
  const points = record.result.forecast;
  const weeks = Math.min(weeksDone, points.length);
  if (weeks < 1) return null;
  const predicted = points
    .slice(0, weeks)
    .map((p) => p.total)
    .filter(Number.isFinite);
  if (!predicted.length) return null;

  const actualAvg = round2(mean(weekTotalsOnGrid(entries, gridDue, 0, weeks)));
  const { lower, upper } = record.result;
  return {
    weeks,
    actualAvg,
    predictedAvg: round2(mean(predicted)),
    lower,
    upper,
    status: actualAvg < lower ? "below" : actualAvg > upper ? "above" : "within",
  };
}

// Everything the forecast slide needs for one monthly recap, or null when the
// recap has no forecast slide.
//
//   recap      from buildRecap()
//   forecasts  the saved forecasts, keyed by due date (forecastStore.js)
//   settings   { startedAt, targetWeekly }
//   entries    all of the user's entries
//
// Returns null, or
//   { state: "ready" | "needs_target", mode: "first" | "review",
//     chart: { slots, splitIndex, bands, target, yMax, ticks, months },
//     review,    how last month's forecast compares with what was spent (or null)
//     outlook }  the new forecast's average, range and verdict (or null)
//
// "needs_target": a forecast is due this month but cannot be made without a
// target, so only the past weeks are drawn. A due forecast that is only waiting
// for the backend returns null (it is retried on the next app open).
export function forecastSlideFor(recap, forecasts, settings = {}, entries = []) {
  if (!recap) return null;
  const { startedAt, targetWeekly } = settings ?? {};

  // The recap is about the month that just ended, so it is shown on the 1st of the next month,
  // which is also the forecast's due date (forecasts are due on the 1st of every month).
  const anchor = new Date(recap.year, recap.month, 1);
  const dues = dueDates(startedAt, anchor);
  if (!dues.length) return null; // fewer than 3 months in: no forecast yet

  const due = dues[dues.length - 1];
  const current = forecasts?.[toDateKey(due)] ?? null;
  const prevDue = dues.length > 1 ? dues[dues.length - 2] : null;
  const previous = prevDue ? forecasts?.[toDateKey(prevDue)] ?? null : null;

  if (!current && targetWeekly) return null; // due, but still waiting for the backend
  const state = current ? "ready" : "needs_target";
  const mode = previous ? "review" : "first";

  // The forecast whose weeks are compared with what happened, and its weekly grid
  const compare = previous;
  const gridDue = previous ? prevDue : due;
  const weeksDone = Math.max(0, Math.floor(dayDiff(gridDue, anchor) / 7));

  // Past weeks: the last 13 complete ones, starting no earlier than the first full week after
  // the user started. A week that began before that holds only a few days of their spending and
  // would show as a dip that never happened.
  const firstWeek = Math.ceil(dayDiff(gridDue, new Date(startedAt)) / 7);
  const left = Math.max(weeksDone - PAST_WEEKS, firstWeek);
  const actual = weekTotalsOnGrid(entries, gridDue, left, weeksDone);
  const comparePoints = compare?.result.forecast ?? [];

  const slots = [];
  for (let k = left; k < weeksDone; k++) {
    slots.push({
      start: toDateKey(addDays(gridDue, 7 * k)),
      actual: actual[k - left],
      predicted: k >= 0 ? pointTotal(comparePoints, k) : null,
      upcoming: null,
      future: false,
    });
  }

  // The 4 weeks still to come: the new forecast, on its own grid
  current?.result.forecast.forEach((_, j) => {
    slots.push({
      start: toDateKey(addDays(due, 7 * j)),
      actual: null,
      predicted: null,
      upcoming: pointTotal(current.result.forecast, j),
      future: true,
    });
  });

  // Scale: weeks far above the usual ones are clipped, so the axis fits the rest
  const spent = slots.map((s) => s.actual).filter((v) => v !== null);
  const typical = median(spent.filter((v) => v > 0));
  const limit = typical > 0 ? OUTLIER_MULTIPLE * typical : Infinity;
  const target = current ? current.result.target_weekly : null;
  const bands = [];
  const predictedSpan = span(slots, "predicted");
  if (predictedSpan && compare) {
    bands.push({ role: "predicted", ...predictedSpan, lower: compare.result.lower, upper: compare.result.upper });
  }
  const upcomingSpan = span(slots, "upcoming");
  if (upcomingSpan && current) {
    bands.push({ role: "upcoming", ...upcomingSpan, lower: current.result.lower, upper: current.result.upper });
  }
  const top = Math.max(
    0,
    ...spent.filter((v) => v <= limit),
    ...slots.flatMap((s) => [s.predicted ?? 0, s.upcoming ?? 0]),
    ...bands.map((b) => b.upper),
    target ?? 0
  );
  const { yMax, ticks } = niceScale(top);
  slots.forEach((s) => {
    s.clipped = s.actual !== null && s.actual > yMax;
  });
  const firstFuture = slots.findIndex((s) => s.future);

  const r = current?.result;
  return {
    state,
    mode,
    chart: {
      slots,
      splitIndex: firstFuture >= 0 ? firstFuture : null, // where the past ends and the forecast begins
      bands,
      target,
      yMax,
      ticks,
      months: monthTicks(slots),
    },
    review: compare ? buildReview(compare, entries, gridDue, weeksDone) : null,
    outlook:
      r
        ? {
            avg: r.forecast_avg_weekly,
            lower: r.lower,
            upper: r.upper,
            target: r.target_weekly,
            verdict: r.verdict,
            method: r.method,
            weeks: r.forecast.length,
          }
        : null,
  };
}
