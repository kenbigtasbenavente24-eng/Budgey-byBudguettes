// Tests for the forecast graph data. Run with: npm test
// (Node's built-in test runner, no extra packages.)
//
// The example user starts on Tue 2027-01-12, so the first forecast is due Apr 1 and a
// new one on the 1st of every month after that (May 1, Jun 1 ...). Each covers 4 weeks.
// Weeks are counted from the due date: week k starts k * 7 days after it.

import assert from "node:assert/strict";
import { test } from "node:test";
import { dayDiff, dueDates, toDateKey, weeklyTotals } from "./forecast.js";
import {
  PAST_WEEKS,
  axisPeso,
  forecastSlideFor,
  monthTicks,
  niceScale,
  weekTotalsOnGrid,
} from "./forecastChart.js";

const day = (y, m, d) => new Date(y, m - 1, d, 12); // noon, local time
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
const key = (y, m, d) => toDateKey(day(y, m, d));

// One entry per day from `from` to `to` (inclusive); amount = perDay(date)
function dailyEntries(from, to, perDay) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    out.push({ id: String(out.length), amount: perDay(d), createdAt: d.toISOString() });
  }
  return out;
}

// What POST /v1/forecast returns: 4 flat weeks starting on the due date
function record(dueKey, { level = 100, h = 4, lower = 80, upper = 130, target = 120, method = "arima" } = {}) {
  const [y, m, d] = dueKey.split("-").map(Number);
  return {
    generatedAt: "2027-01-01T00:00:00.000Z",
    result: {
      method,
      weeks_used: 12,
      forecast: Array.from({ length: h }, (_, i) => ({
        week_start: toDateKey(addDays(day(y, m, d), 7 * i)),
        total: level,
      })),
      forecast_avg_weekly: level,
      lower,
      upper,
      target_weekly: target,
      verdict: level > target ? "warn" : "keep_it_up",
    },
  };
}

const STARTED = day(2027, 1, 12).toISOString();
const settings = { startedAt: STARTED, targetWeekly: 120 };
// 10 a day until the end of March, 20 a day from Apr 1: weekly totals 70, then 140
const perDay = (d) => (d < day(2027, 4, 1) ? 10 : 20);
const entries = dailyEntries(day(2027, 1, 12), day(2027, 7, 20), perDay);

// ---------- weekTotalsOnGrid ----------

test("weekTotalsOnGrid: weeks run from the origin, negative weeks go back", () => {
  const origin = day(2027, 4, 1);
  assert.deepEqual(weekTotalsOnGrid(entries, origin, -2, 2), [70, 70, 140, 140]);
  assert.deepEqual(weekTotalsOnGrid(entries, origin, 3, 3), []);
});

test("weekTotalsOnGrid: skips bad entries and entries outside the range", () => {
  const origin = day(2027, 4, 1);
  const messy = [
    { amount: 50, createdAt: day(2027, 4, 2).toISOString() },
    { amount: -5, createdAt: day(2027, 4, 2).toISOString() },
    { amount: "abc", createdAt: day(2027, 4, 2).toISOString() },
    { amount: 5, createdAt: "not a date" },
    { amount: 7 },
    { amount: 9, createdAt: day(2027, 3, 31).toISOString() }, // week -1
    { amount: 11, createdAt: day(2027, 4, 8).toISOString() }, // week 1
  ];
  assert.deepEqual(weekTotalsOnGrid(messy, origin, 0, 1), [50]);
  assert.deepEqual(weekTotalsOnGrid(null, origin, 0, 1), [0]);
});

test("weekTotalsOnGrid agrees with weeklyTotals (the numbers sent to the backend)", () => {
  const due = day(2027, 4, 1);
  const sent = weeklyTotals(entries, STARTED, due);
  const drawn = weekTotalsOnGrid(entries, due, -sent.length, 0);
  assert.equal(sent.length, 12);
  assert.deepEqual(drawn, sent.map((w) => w.total));
});

// ---------- which recaps get a slide ----------

const FC = (...dues) =>
  Object.fromEntries(dues.map(([y, m, d, opts]) => [key(y, m, d), record(key(y, m, d), opts)]));

test("no slide without a recap, a start date, or 3 months of history", () => {
  const forecasts = FC([2027, 4, 1]);
  assert.equal(forecastSlideFor(null, forecasts, settings, entries), null);
  assert.equal(forecastSlideFor({ year: 2027, month: 3 }, forecasts, { targetWeekly: 120 }, entries), null);
  // recaps shown Feb 1 (for January) and Mar 1 (for February)
  assert.equal(forecastSlideFor({ year: 2027, month: 1 }, forecasts, settings, entries), null);
  assert.equal(forecastSlideFor({ year: 2027, month: 2 }, forecasts, settings, entries), null);
});

test("a due forecast that is waiting for the backend has no slide; without a target it asks for one", () => {
  const recap = { year: 2027, month: 3 }; // shown Apr 1
  assert.equal(forecastSlideFor(recap, {}, settings, entries), null);
  assert.equal(forecastSlideFor({ year: 2027, month: 4 }, FC([2027, 4, 1]), settings, entries), null); // May 1 not saved yet

  const noTarget = forecastSlideFor(recap, {}, { startedAt: STARTED, targetWeekly: null }, entries);
  assert.equal(noTarget.state, "needs_target");
  assert.equal(noTarget.mode, "first");
  assert.equal(noTarget.chart.slots.length, 11);
  assert.equal(noTarget.chart.splitIndex, null);
  assert.deepEqual(noTarget.chart.bands, []);
  assert.equal(noTarget.chart.target, null);
  assert.equal(noTarget.outlook, null);
  assert.equal(noTarget.review, null);
});

test("every month from the first forecast on has a slide", () => {
  const dues = [[2027, 4, 1], [2027, 5, 1], [2027, 6, 1], [2027, 7, 1], [2027, 8, 1], [2027, 9, 1]];
  const forecasts = FC(...dues);
  const modes = [3, 4, 5, 6, 7, 8].map(
    (month) => forecastSlideFor({ year: 2027, month }, forecasts, settings, entries).mode
  );
  assert.deepEqual(modes, ["first", "review", "review", "review", "review", "review"]);
});

// ---------- first forecast ----------

test("first forecast: past weeks (only full weeks since the user started) and the 4 predicted weeks", () => {
  const s = forecastSlideFor({ year: 2027, month: 3 }, FC([2027, 4, 1, { level: 100 }]), settings, entries);

  assert.equal(s.state, "ready");
  assert.equal(s.mode, "first");
  const { slots, splitIndex, bands } = s.chart;

  // Started Tue Jan 12: the week of Jan 7 holds only Jan 12-13, which would show as a false dip,
  // so the graph starts with the first full week (Jan 14): 11 past weeks, not 13
  assert.equal(slots.length, 11 + 4);
  assert.ok(11 < PAST_WEEKS);
  assert.equal(slots[0].start, "2027-01-14");
  assert.equal(slots[0].actual, 70);
  assert.equal(slots[10].start, "2027-03-25");
  assert.equal(slots[10].actual, 70);

  // Nothing is compared yet: the prediction is all "upcoming"
  assert.ok(slots.slice(0, 11).every((x) => x.predicted === null && x.upcoming === null && !x.future));
  assert.ok(slots.slice(11).every((x) => x.upcoming === 100 && x.actual === null && x.future));
  assert.equal(slots[11].start, "2027-04-01");
  assert.equal(slots[14].start, "2027-04-22");
  assert.equal(splitIndex, 11);
  assert.deepEqual(bands, [{ role: "upcoming", from: 11, to: 14, lower: 80, upper: 130 }]);

  assert.equal(s.chart.target, 120);
  assert.equal(s.review, null);
  assert.deepEqual(s.outlook, {
    avg: 100, lower: 80, upper: 130, target: 120, verdict: "keep_it_up", method: "arima", weeks: 4,
  });
});

test("a user who started on the first day of a grid week keeps that week", () => {
  // Thu Jan 7 is exactly 12 weeks before Apr 1, so that week is full
  const st = { startedAt: day(2027, 1, 7).toISOString(), targetWeekly: 120 };
  const own = dailyEntries(day(2027, 1, 7), day(2027, 4, 20), () => 10);
  const s = forecastSlideFor({ year: 2027, month: 3 }, FC([2027, 4, 1]), st, own);
  assert.equal(s.chart.slots[0].start, "2027-01-07");
  assert.equal(s.chart.slots[0].actual, 70);
  assert.equal(s.chart.splitIndex, 12);
});

test("no forecast from last month (app not opened): the slide is a first-style one, last 13 weeks", () => {
  // The Jun 1 forecast exists but May 1 was never saved
  const s = forecastSlideFor({ year: 2027, month: 5 }, FC([2027, 4, 1], [2027, 6, 1]), settings, entries);
  assert.equal(s.mode, "first");
  assert.equal(s.review, null);
  assert.equal(s.chart.slots.length, 13 + 4);
  assert.equal(s.chart.slots[0].start, "2027-03-02"); // Jun 1 minus 13 weeks (91 days)
  assert.equal(s.chart.splitIndex, 13);
  assert.ok(s.chart.slots.slice(0, 13).every((x) => x.predicted === null));
});

// ---------- the months after the first forecast ----------

test("May 1: last month's 4 weeks against the Apr 1 forecast, plus the new forecast", () => {
  const forecasts = FC(
    [2027, 4, 1, { level: 100, lower: 80, upper: 130 }],
    [2027, 5, 1, { level: 150, lower: 120, upper: 190, target: 120 }]
  );
  const s = forecastSlideFor({ year: 2027, month: 4 }, forecasts, settings, entries);

  assert.equal(s.state, "ready");
  assert.equal(s.mode, "review");
  const { slots, splitIndex, bands } = s.chart;
  // 13 past weeks (9 before the Apr 1 forecast + its 4 weeks) and the 4 new ones
  assert.equal(slots.length, 13 + 4);
  assert.equal(splitIndex, 13);
  assert.equal(slots[0].start, "2027-01-28");
  assert.equal(slots[9].start, "2027-04-01");
  assert.equal(slots[12].start, "2027-04-22");
  assert.ok(slots.slice(0, 9).every((x) => x.predicted === null && x.actual === 70));
  assert.ok(slots.slice(9, 13).every((x) => x.predicted === 100 && x.actual === 140 && x.upcoming === null));
  assert.equal(slots[13].start, "2027-05-01");
  assert.equal(slots[16].start, "2027-05-22");
  assert.ok(slots.slice(13).every((x) => x.upcoming === 150 && x.predicted === null && x.actual === null && x.future));
  assert.deepEqual(bands, [
    { role: "predicted", from: 9, to: 12, lower: 80, upper: 130 },
    { role: "upcoming", from: 13, to: 16, lower: 120, upper: 190 },
  ]);

  assert.deepEqual(s.review, { weeks: 4, actualAvg: 140, predictedAvg: 100, lower: 80, upper: 130, status: "above" });
  assert.equal(s.outlook.avg, 150);
  assert.equal(s.outlook.verdict, "warn");
  assert.equal(s.outlook.weeks, 4);
  assert.equal(s.chart.target, 120); // the new forecast's target
});

test("each month compares with the forecast made the month before", () => {
  const forecasts = FC([2027, 4, 1, { level: 100 }], [2027, 5, 1, { level: 130 }], [2027, 6, 1, { level: 150 }]);
  const s = forecastSlideFor({ year: 2027, month: 5 }, forecasts, settings, entries); // shown Jun 1
  assert.equal(s.mode, "review");
  assert.equal(s.review.predictedAvg, 130); // May's forecast, not April's
  assert.equal(s.review.actualAvg, 140);
  assert.equal(s.review.weeks, 4); // May 1 to Jun 1 is 31 days: 4 whole weeks, 3 days left over
  assert.equal(s.chart.slots.find((x) => x.predicted !== null).start, "2027-05-01");
  assert.equal(s.chart.slots.at(-1).start, "2027-06-22");
});

test("review status: below, within, above the forecast range", () => {
  const at = (level, lower, upper) =>
    forecastSlideFor({ year: 2027, month: 4 }, FC([2027, 4, 1, { level, lower, upper }], [2027, 5, 1]), settings, entries)
      .review.status;
  assert.equal(at(200, 180, 230), "below"); // spent 140
  assert.equal(at(140, 120, 160), "within");
  assert.equal(at(140, 140, 140), "within"); // on the edge counts as inside
  assert.equal(at(100, 80, 130), "above");
});

test("a saved forecast of another length still draws, only for its own weeks", () => {
  // an older app version saved 13 weeks: only the 4 weeks that passed are compared
  const long = forecastSlideFor({ year: 2027, month: 4 }, FC([2027, 4, 1, { h: 13 }], [2027, 5, 1]), settings, entries);
  assert.equal(long.review.weeks, 4);
  assert.equal(long.chart.slots.length, 13 + 4);
  // a shorter one is compared for the weeks it has
  const short = forecastSlideFor({ year: 2027, month: 4 }, FC([2027, 4, 1, { h: 2 }], [2027, 5, 1]), settings, entries);
  assert.equal(short.review.weeks, 2);
  assert.equal(short.chart.slots.filter((x) => x.predicted !== null).length, 2);
});

test("seam between last month's weeks and the new forecast: 7 to 10 days, by month length", () => {
  const seam = (startedAt, recap, dues) => {
    const st = { startedAt: startedAt.toISOString(), targetWeekly: 120 };
    const all = dailyEntries(startedAt, day(recap.year + 1, 1, 1), () => 10);
    const s = forecastSlideFor(recap, FC(...dues), st, all);
    const a = s.chart.slots[s.chart.splitIndex - 1].start;
    const b = s.chart.slots[s.chart.splitIndex].start;
    return { s, gap: dayDiff(new Date(...a.split("-").map((n, i) => (i === 1 ? n - 1 : n))), new Date(...b.split("-").map((n, i) => (i === 1 ? n - 1 : n)))) };
  };
  // February of a normal year: 28 days, exactly 4 weeks
  assert.equal(seam(day(2026, 11, 10), { year: 2027, month: 2 }, [[2027, 2, 1], [2027, 3, 1]]).gap, 7);
  // February of a leap year: 29 days
  assert.equal(seam(day(2027, 11, 10), { year: 2028, month: 2 }, [[2028, 2, 1], [2028, 3, 1]]).gap, 8);
  // a 31-day month
  assert.equal(seam(day(2027, 1, 12), { year: 2027, month: 5 }, [[2027, 5, 1], [2027, 6, 1]]).gap, 10);
  // New Year: December's recap, shown Jan 1
  const ny = seam(day(2027, 9, 15), { year: 2027, month: 12 }, [[2027, 12, 1], [2028, 1, 1]]);
  assert.equal(ny.s.mode, "review");
  assert.equal(ny.s.review.weeks, 4);
  assert.equal(ny.s.review.actualAvg, 70);
  assert.equal(ny.gap, 10);
});

test("a due month without a target, but last month's forecast exists: the review still shows", () => {
  const s = forecastSlideFor(
    { year: 2027, month: 4 },
    FC([2027, 4, 1]),
    { startedAt: STARTED, targetWeekly: null },
    entries
  );
  assert.equal(s.state, "needs_target");
  assert.equal(s.mode, "review");
  assert.equal(s.review.weeks, 4);
  assert.equal(s.outlook, null);
  assert.equal(s.chart.slots.length, 13); // no new forecast to draw
  assert.equal(s.chart.splitIndex, null);
  assert.equal(s.chart.target, null);
});

// ---------- scale and labels ----------

test("a one-off huge week is clipped instead of flattening the graph", () => {
  const forecasts = FC([2027, 4, 1, { level: 100, upper: 130 }]);
  const big = [...entries, { amount: 20000, createdAt: day(2027, 3, 3).toISOString() }];
  const s = forecastSlideFor({ year: 2027, month: 3 }, forecasts, settings, big);
  const spike = s.chart.slots.find((x) => x.actual > 10000);
  assert.ok(spike.clipped);
  assert.ok(s.chart.yMax < 400, `yMax ${s.chart.yMax} should fit the normal weeks`);
  assert.ok(s.chart.slots.filter((x) => x.clipped).length === 1);
});

test("a normal busy week is not clipped", () => {
  const s = forecastSlideFor({ year: 2027, month: 4 }, FC([2027, 4, 1], [2027, 5, 1]), settings, entries);
  assert.ok(s.chart.slots.every((x) => !x.clipped));
  assert.ok(s.chart.yMax >= 140);
});

test("niceScale", () => {
  assert.deepEqual(niceScale(0), { yMax: 100, ticks: [0, 25, 50, 75, 100] });
  assert.deepEqual(niceScale(70), { yMax: 80, ticks: [0, 20, 40, 60, 80] });
  assert.deepEqual(niceScale(1234), { yMax: 1500, ticks: [0, 500, 1000, 1500] });
  for (const top of [1, 7, 99, 100, 101, 999, 1500, 12345, 480000]) {
    const { yMax, ticks } = niceScale(top);
    assert.ok(yMax >= top, `${top} fits under ${yMax}`);
    assert.ok(ticks.length >= 3 && ticks.length <= 6, `${top} has ${ticks.length} ticks`);
    assert.equal(ticks[ticks.length - 1], yMax);
  }
});

test("axisPeso: full under 10,000, compact above", () => {
  assert.equal(axisPeso(0), "₱0");
  assert.equal(axisPeso(250), "₱250");
  assert.equal(axisPeso(1500), "₱1,500");
  assert.equal(axisPeso(9999), "₱9,999");
  assert.equal(axisPeso(10000), "₱10k");
  assert.equal(axisPeso(12345), "₱12.3k");
  assert.equal(axisPeso(20000), "₱20k");
  assert.equal(axisPeso(1250000), "₱1.3M");
});

test("monthTicks: one label per month, no crowded first label", () => {
  const slot = (start) => ({ start });
  assert.deepEqual(
    monthTicks([slot("2027-01-07"), slot("2027-01-14"), slot("2027-01-21"), slot("2027-01-28"), slot("2027-02-04")]),
    [{ index: 0, label: "Jan" }, { index: 4, label: "Feb" }]
  );
  // the first week is the last one of its month: its label would touch the next, so it is dropped
  assert.deepEqual(
    monthTicks([slot("2027-01-28"), slot("2027-02-04"), slot("2027-02-11"), slot("2027-02-18"), slot("2027-02-25"), slot("2027-03-04")]),
    [{ index: 1, label: "Feb" }, { index: 5, label: "Mar" }]
  );
  assert.deepEqual(monthTicks([]), []);
});

test("a full chart has about one label per month", () => {
  const s = forecastSlideFor({ year: 2027, month: 4 }, FC([2027, 4, 1], [2027, 5, 1]), settings, entries);
  assert.deepEqual(
    s.chart.months.map((m) => m.label),
    ["Feb", "Mar", "Apr", "May"]
  );
});

// ---------- many dates at once ----------

test("property check: random start dates and recap months always give a consistent graph", () => {
  let seed = 20270401;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const parseKey = (k) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d, 12);
  };
  const modes = new Set();
  let shown = 0;

  for (let n = 0; n < 400; n++) {
    const started = day(2026 + Math.floor(rand() * 3), 1 + Math.floor(rand() * 12), 1 + Math.floor(rand() * 28));
    const st = { startedAt: started.toISOString(), targetWeekly: rand() < 0.15 ? null : 100 + Math.floor(rand() * 400) };

    // the recap is shown on the 1st of some month 1 to 30 months after the start month
    const anchor = new Date(started.getFullYear(), started.getMonth() + 1 + Math.floor(rand() * 30), 1, 12);
    const recap = anchor.getMonth() === 0
      ? { year: anchor.getFullYear() - 1, month: 12 }
      : { year: anchor.getFullYear(), month: anchor.getMonth() };

    // saved forecasts for the due dates so far (some missing), mostly 4 weeks long, some from an older app version
    const forecasts = {};
    for (const due of dueDates(started, anchor)) {
      if (rand() < 0.2) continue;
      const level = 50 + rand() * 600;
      const k = toDateKey(due);
      forecasts[k] = record(k, {
        level, lower: level * (0.4 + rand() * 0.5), upper: level * (1.1 + rand()),
        h: rand() < 0.3 ? 13 : 4, target: st.targetWeekly ?? 300,
      });
    }

    const all = dailyEntries(started, addDays(anchor, -1), (d) => (rand() < 0.03 ? 5000 : 20 + ((d.getDate() * 7) % 90)));
    const s = forecastSlideFor(recap, forecasts, st, all);
    if (s === null) continue;
    shown++;
    modes.add(s.mode);
    const label = `case ${n}: started ${toDateKey(started)}, recap shown ${toDateKey(anchor)}, ${s.mode}`;
    const { slots, splitIndex, bands, yMax, ticks } = s.chart;

    assert.ok(slots.length >= 1 && slots.length <= 26, label + " slot count " + slots.length);
    // weeks follow each other, exactly 7 days apart, and never start before the user did.
    // The one exception is the seam in a "review": last month's weeks and the new forecast's weeks
    // sit on two different weekly grids, and a month (28-31 days) is not a whole number of weeks,
    // so the new grid starts 7 to 10 days after the last full week of the old one.
    for (let i = 1; i < slots.length; i++) {
      const gap = dayDiff(parseKey(slots[i - 1].start), parseKey(slots[i].start));
      if (s.mode === "review" && i === splitIndex) {
        assert.ok(gap >= 7 && gap <= 10, label + " seam gap " + gap);
      } else {
        assert.equal(gap, 7, label + " week spacing");
      }
    }
    const firstPast = slots[0];
    assert.ok(dayDiff(started, parseKey(firstPast.start)) >= 0, label + " first week starts before the user did");
    // the past comes first, then the weeks still to come
    if (splitIndex !== null) {
      assert.ok(splitIndex >= 1 && splitIndex < slots.length, label + " splitIndex " + splitIndex);
    }
    slots.forEach((x, i) => {
      const past = splitIndex === null || i < splitIndex;
      assert.equal(x.future, !past, label + " future flag");
      assert.equal(x.actual === null, !past, label + " actual only in the past");
      if (x.actual !== null) assert.ok(Number.isFinite(x.actual) && x.actual >= 0, label + " actual value");
      for (const v of [x.predicted, x.upcoming]) {
        assert.ok(v === null || (Number.isFinite(v) && v <= yMax), label + " forecast value fits the axis");
      }
      if (x.actual !== null && !x.clipped) assert.ok(x.actual <= yMax, label + " unclipped week fits the axis");
      if (x.clipped) assert.ok(x.actual > yMax, label + " clipped flag");
    });
    // axis and bands
    assert.ok(Number.isFinite(yMax) && yMax > 0, label + " yMax");
    assert.equal(ticks[0], 0, label + " first tick");
    assert.equal(ticks[ticks.length - 1], yMax, label + " last tick");
    for (const b of bands) {
      assert.ok(0 <= b.from && b.from <= b.to && b.to < slots.length, label + " band range");
      assert.ok(b.lower <= b.upper && b.upper <= yMax, label + " band values");
    }
    // the notes under the graph
    if (s.review) {
      assert.ok(s.review.weeks >= 1 && s.review.weeks <= 4, label + " review weeks " + s.review.weeks);
      assert.ok(Number.isFinite(s.review.actualAvg) && Number.isFinite(s.review.predictedAvg), label + " review numbers");
      const { actualAvg, lower, upper, status } = s.review;
      assert.equal(status, actualAvg < lower ? "below" : actualAvg > upper ? "above" : "within", label + " status");
    }
    if (s.state === "ready") assert.ok(s.outlook, label + " new forecast has an outlook");
    if (s.state === "needs_target") assert.equal(s.outlook, null, label + " needs_target has no outlook");
    assert.ok(!JSON.stringify(s).includes("NaN"), label + " NaN");
  }

  // the random cases really did cover every kind of slide
  assert.ok(shown > 100, "only " + shown + " slides were built");
  assert.deepEqual([...modes].sort(), ["first", "review"]);
});
