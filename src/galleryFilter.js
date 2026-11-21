// src/galleryFilter.js
// Filtering for the Gallery screen: by month, category and reason.
// Pure helpers (no React), same style as categories.js and recapData.js.
//
// A filter is { month, category, reason }. Each is one chosen value or null
// (null = "All"). The three combine with AND.
//   month     a key like "2026-9" (year-monthIndex), see monthKeyOf
//   category  a name as returned by normalizeCategory, e.g. "Food"
//   reason    "Need" | "Reward" | "Want"

import { CATEGORIES, normalizeCategory } from "./categories";

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const REASONS = ["Need", "Reward", "Want"];

export const EMPTY_FILTER = Object.freeze({ month: null, category: null, reason: null });

// ---- Months ----------------------------------------------------------------

// Same key the Gallery groups photos by
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

// Months that have entries, newest first
export function monthOptions(entries) {
  const keys = [...new Set(entries.map((e) => monthKeyOf(e.createdAt)))];
  return keys
    .sort((a, b) => monthIndex(b) - monthIndex(a))
    .map((key) => {
      const { year, month } = parseKey(key);
      return { value: key, label: `${MONTHS[month]} ${year}` };
    });
}

// The listed categories in their usual order, then the user's own names (A to Z)
export function categoryOptions(entries) {
  const names = new Set(entries.map((e) => normalizeCategory(e.category)));
  const listed = CATEGORIES.filter((c) => names.has(c));
  const custom = [...names]
    .filter((n) => !CATEGORIES.includes(n))
    .sort((a, b) => a.localeCompare(b));
  return [...listed, ...custom].map((name) => ({ value: name, label: name }));
}

// Need / Reward / Want, only the ones that have entries. `dot` is the colour class.
export function reasonOptions(entries) {
  return REASONS.filter((r) => entries.some((e) => e.reason === r)).map((r) => ({
    value: r,
    label: r,
    dot: r.toLowerCase(),
  }));
}

// ---- Applying a filter -------------------------------------------------------

export const countActive = (filter) => Object.values(filter).filter(Boolean).length;

export function applyFilter(entries, filter) {
  if (countActive(filter) === 0) return entries;
  return entries.filter(
    (e) =>
      (!filter.month || monthKeyOf(e.createdAt) === filter.month) &&
      (!filter.category || normalizeCategory(e.category) === filter.category) &&
      (!filter.reason || e.reason === filter.reason)
  );
}

// Drops a chosen value that no entry has any more (for example, after the last
// photo of that month is deleted). Returns the same object when nothing changed.
export function pruneFilter(filter, entries) {
  const has = (options, value) => (options.some((o) => o.value === value) ? value : null);
  const month = filter.month ? has(monthOptions(entries), filter.month) : null;
  const category = filter.category ? has(categoryOptions(entries), filter.category) : null;
  const reason = filter.reason ? has(reasonOptions(entries), filter.reason) : null;
  if (month === filter.month && category === filter.category && reason === filter.reason) {
    return filter;
  }
  return { month, category, reason };
}

// ---- Header text for the Spending Summary -------------------------------------

// "Total Spending", "October Spending", "October · Food Spending", ...
export function summaryLabel(filter, now = new Date()) {
  const parts = [];
  if (filter.month) parts.push(monthLabel(filter.month, now));
  if (filter.category) parts.push(filter.category);
  if (filter.reason) parts.push(filter.reason);
  return parts.length ? `${parts.join(" · ")} Spending` : "Total Spending";
}

// The small stat on the right of the total. It shows the thing you are NOT
// filtering by, so it always has something to rank:
//   no category chosen        -> Top Category
//   category but no month     -> Top Month
//   category and month chosen -> number of items
export function topStat(entries, filter, now = new Date()) {
  const rank = (totals) => Object.entries(totals).sort((a, b) => b[1] - a[1]);

  if (!filter.category) {
    const totals = {};
    entries.forEach((e) => {
      const name = normalizeCategory(e.category);
      totals[name] = (totals[name] || 0) + e.amount;
    });
    return { value: rank(totals)[0]?.[0] ?? "---", caption: "Top Category" };
  }

  if (!filter.month) {
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
