// src/galleryFilter.js
// Filtering for the Gallery screen: by year, month, category and reason.
// Pure helpers (no React), same style as categories.js and recapData.js.
//
// A filter is { year, month, category, reason }. Each is one chosen value or
// null (null = "All"). They combine with AND.
//   year      a number, e.g. 2026
//   month     0 to 11 (January is 0, so always test with isSet, never "if (month)")
//   category  a name as returned by normalizeCategory, e.g. "Food"
//   reason    "Need" | "Reward" | "Want"
// Year and month are separate on purpose: choose a month alone to see it in
// every year, a year alone to see all of it, or both for one exact month.

import { CATEGORIES, normalizeCategory } from "./categories";

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const REASONS = ["Need", "Reward", "Want"];

export const EMPTY_FILTER = Object.freeze({ year: null, month: null, category: null, reason: null });

// "Has the user chosen something?" (month 0 is January, so 0 counts as chosen)
const isSet = (value) => value !== null && value !== undefined;

// ---- Dates -----------------------------------------------------------------

// A "year-month" key like "2026-9", used to total spending by month
export const monthKeyOf = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
};

const parseKey = (key) => {
  const [year, month] = key.split("-").map(Number);
  return { year, month };
};

const monthIndex = (key) => {
  const { year, month } = parseKey(key);
  return year * 12 + month;
};

// "October" for the current year, "October 2025" for any other year
export function monthLabel(key, now = new Date()) {
  const { year, month } = parseKey(key);
  return year === now.getFullYear() ? MONTHS[month] : `${MONTHS[month]} ${year}`;
}

// ---- Options for the filter sheet -------------------------------------------
// Built from the entries, so the sheet only offers things that exist.
// Each option is { value, label }.

// The dropdowns narrow each other. A dropdown only offers values that exist in
// purchases matching every OTHER chosen filter, so each choice you can tap leads
// to at least one purchase. (Its own choice is left out of the narrowing, so you
// can still switch to another value.) Example: with June chosen, Category lists
// only what was logged in June.
const DIMENSIONS = ["year", "month", "category", "reason"];
const matchingOthers = (entries, filter, dimension) =>
  applyFilter(entries, { ...filter, [dimension]: null });

// Years from the first entry up to this year (or the last entry's year), newest
// first. A year with no matching purchases is listed but `disabled`.
export function yearOptions(entries, filter = EMPTY_FILTER, now = new Date()) {
  const years = entries.map((e) => new Date(e.createdAt).getFullYear()).filter(Number.isFinite);
  if (years.length === 0) return [];
  const have = new Set(
    matchingOthers(entries, filter, "year").map((e) => new Date(e.createdAt).getFullYear())
  );
  const first = Math.min(...years);
  const last = Math.max(...years, now.getFullYear());
  const options = [];
  for (let y = last; y >= first; y--) {
    options.push({ value: y, label: String(y), disabled: !have.has(y) });
  }
  return options;
}

// The Year dropdown only appears once purchases span more than one year
// (say 2026 and then 2027). With a single year it would be a pointless choice.
export const showYearFilter = (entries, now = new Date()) =>
  yearOptions(entries, EMPTY_FILTER, now).filter((o) => !o.disabled).length > 1;

// Months with matching purchases, in calendar order
export function monthOptions(entries, filter = EMPTY_FILTER) {
  const have = new Set(
    matchingOthers(entries, filter, "month").map((e) => new Date(e.createdAt).getMonth())
  );
  return MONTHS.map((label, value) => ({ value, label })).filter((o) => have.has(o.value));
}

// The listed categories in their usual order, then the user's own names (A to Z)
export function categoryOptions(entries, filter = EMPTY_FILTER) {
  const names = new Set(
    matchingOthers(entries, filter, "category").map((e) => normalizeCategory(e.category))
  );
  const listed = CATEGORIES.filter((c) => names.has(c));
  const custom = [...names]
    .filter((n) => !CATEGORIES.includes(n))
    .sort((a, b) => a.localeCompare(b));
  return [...listed, ...custom].map((name) => ({ value: name, label: name }));
}

// Need / Reward / Want, only the ones with matching purchases. `dot` is the colour class.
export function reasonOptions(entries, filter = EMPTY_FILTER) {
  const have = new Set(matchingOthers(entries, filter, "reason").map((e) => e.reason));
  return REASONS.filter((r) => have.has(r)).map((r) => ({
    value: r,
    label: r,
    dot: r.toLowerCase(),
  }));
}

// ---- Applying a filter -------------------------------------------------------

export const countActive = (filter) => Object.values(filter).filter(isSet).length;

export function applyFilter(entries, filter) {
  if (countActive(filter) === 0) return entries;
  return entries.filter((e) => {
    const d = new Date(e.createdAt);
    return (
      (!isSet(filter.year) || d.getFullYear() === filter.year) &&
      (!isSet(filter.month) || d.getMonth() === filter.month) &&
      (!isSet(filter.category) || normalizeCategory(e.category) === filter.category) &&
      (!isSet(filter.reason) || e.reason === filter.reason)
    );
  });
}

// Drops a chosen value that is no longer on offer: its purchases were deleted,
// or the other chosen filters no longer leave any. Returns the same object when
// nothing changed.
export function pruneFilter(filter, entries, now = new Date()) {
  const next = { ...filter };
  // With only one year of data the Year dropdown is hidden, so no year filter can stay on
  if (!showYearFilter(entries, now)) next.year = null;

  const offered = {
    year: () => yearOptions(entries, next, now),
    month: () => monthOptions(entries, next),
    category: () => categoryOptions(entries, next),
    reason: () => reasonOptions(entries, next),
  };
  // One pass is enough: dropping a value only ever frees up the other dropdowns.
  // Narrow filters are checked first, so a stale combination keeps the broader one
  // (the year) and drops the narrower (the month).
  [...DIMENSIONS].reverse().forEach((dimension) => {
    if (!isSet(next[dimension])) return;
    const ok = offered[dimension]().some((o) => o.value === next[dimension] && !o.disabled);
    if (!ok) next[dimension] = null;
  });

  return DIMENSIONS.every((d) => next[d] === filter[d]) ? filter : next;
}

// ---- Header text for the Spending Summary -------------------------------------

// "Total Spending", "2026 Spending", "October Spending", "October · Food Spending", ...
// The current year is left off a month name ("October"), other years keep it.
export function summaryLabel(filter, now = new Date()) {
  const parts = [];
  if (isSet(filter.month)) {
    parts.push(
      isSet(filter.year) ? monthLabel(`${filter.year}-${filter.month}`, now) : MONTHS[filter.month]
    );
  } else if (isSet(filter.year)) {
    parts.push(String(filter.year));
  }
  if (isSet(filter.category)) parts.push(filter.category);
  if (isSet(filter.reason)) parts.push(filter.reason);
  return parts.length ? `${parts.join(" · ")} Spending` : "Total Spending";
}

// The small stat on the right of the total. It shows the thing you are NOT
// filtering by, so it always has something to rank:
//   no category chosen        -> Top Category
//   category but no month     -> Top Month
//   category and month chosen -> number of items
export function topStat(entries, filter, now = new Date()) {
  const rank = (totals) => Object.entries(totals).sort((a, b) => b[1] - a[1]);

  if (!isSet(filter.category)) {
    const totals = {};
    entries.forEach((e) => {
      const name = normalizeCategory(e.category);
      totals[name] = (totals[name] || 0) + e.amount;
    });
    return { value: rank(totals)[0]?.[0] ?? "---", caption: "Top Category" };
  }

  if (!isSet(filter.month)) {
    const totals = {};
    entries.forEach((e) => {
      const key = monthKeyOf(e.createdAt);
      totals[key] = (totals[key] || 0) + e.amount;
    });
    // On a tie, the more recent month wins
    const best = rank(totals).sort((a, b) => b[1] - a[1] || monthIndex(b[0]) - monthIndex(a[0]))[0];
    return { value: best ? monthLabel(best[0], now) : "---", caption: "Top Month" };
  }

  return { value: String(entries.length), caption: entries.length === 1 ? "Item" : "Items" };
}
