// Tests for the forecast schedule and the request the app sends. Run with: npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FIRST_FORECAST_MONTHS,
  FORECAST_EVERY_MONTHS,
  HORIZON_WEEKS,
  buildForecastRequest,
  dueDates,
  pendingDue,
  toDateKey,
  weeklyTotals,
} from "./forecast.js";

const day = (y, m, d) => new Date(y, m - 1, d, 12);
const keys = (dates) => dates.map(toDateKey);

test("the rules: 4-week forecasts, first after 3 months, then every month", () => {
  assert.equal(HORIZON_WEEKS, 4);
  assert.equal(FIRST_FORECAST_MONTHS, 3);
  assert.equal(FORECAST_EVERY_MONTHS, 1);
});

test("dueDates: nothing for the first 3 months, then the 1st of every month", () => {
  const started = day(2027, 1, 12);
  assert.deepEqual(dueDates(started, day(2027, 3, 31)), []);
  assert.deepEqual(keys(dueDates(started, day(2027, 4, 1))), ["2027-04-01"]);
  assert.deepEqual(keys(dueDates(started, day(2027, 4, 30))), ["2027-04-01"]);
  assert.deepEqual(keys(dueDates(started, day(2027, 6, 15))), ["2027-04-01", "2027-05-01", "2027-06-01"]);
});

test("dueDates: the first forecast does not depend on the day of the month the user started", () => {
  for (const d of [1, 15, 31]) {
    assert.deepEqual(keys(dueDates(day(2027, 1, d), day(2027, 5, 1))), ["2027-04-01", "2027-05-01"]);
  }
});

test("dueDates: counting across New Year", () => {
  assert.deepEqual(
    keys(dueDates(day(2026, 11, 20), day(2027, 4, 2))),
    ["2027-02-01", "2027-03-01", "2027-04-01"]
  );
});

test("dueDates: no start date, or an unreadable one, means nothing is due", () => {
  assert.deepEqual(dueDates(null, day(2027, 6, 1)), []);
  assert.deepEqual(dueDates(undefined, day(2027, 6, 1)), []);
  assert.deepEqual(dueDates("not a date", day(2027, 6, 1)), []);
});

test("pendingDue: only the latest unsaved forecast, nothing when all are saved", () => {
  const started = day(2027, 1, 12);
  const now = day(2027, 6, 10);
  assert.equal(toDateKey(pendingDue(started, [], now)), "2027-06-01");
  // May was never generated (app not opened), June is the one that matters
  assert.equal(toDateKey(pendingDue(started, ["2027-04-01"], now)), "2027-06-01");
  assert.equal(pendingDue(started, ["2027-04-01", "2027-05-01", "2027-06-01"], now), null);
  // June is saved but a middle one is not: nothing older is chased
  assert.equal(pendingDue(started, ["2027-06-01"], now), null);
  assert.equal(pendingDue(started, [], day(2027, 3, 31)), null);
});

test("the request asks the backend for 4 weeks", () => {
  const entries = [{ amount: 100, createdAt: day(2027, 3, 20).toISOString() }];
  const body = buildForecastRequest(entries, day(2027, 1, 12), day(2027, 4, 1), 1300);
  assert.equal(body.horizon, 4);
  assert.equal(body.target_weekly, 1300);
  assert.equal(body.weekly_totals.length, 12); // Jan 1 to Apr 1 = 90 days = 12 whole weeks
  assert.throws(() => buildForecastRequest(entries, day(2027, 1, 12), day(2027, 4, 1), 0));
});

test("weeklyTotals: weeks end the day before the forecast date", () => {
  const entries = [
    { amount: 50, createdAt: day(2027, 3, 31).toISOString() }, // last day before Apr 1: in the newest week
    { amount: 70, createdAt: day(2027, 4, 1).toISOString() }, // the due day itself: not yet counted
  ];
  const weeks = weeklyTotals(entries, day(2027, 1, 12), day(2027, 4, 1));
  assert.equal(weeks.at(-1).total, 50);
  assert.equal(weeks.at(-1).week_start, "2027-03-25");
});
