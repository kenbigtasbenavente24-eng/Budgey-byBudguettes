// src/recap.js
// Turns the list of entries into the numbers the Budgey Recap slides show.
// Pure functions only (no React), so they are easy to test.

import { normalizeCategory } from "./categories.js"; // ".js" so this file still runs in plain Node

export const peso = (n) =>
  "₱" +
  Number(n).toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const FULL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Calendar months. m is 0 to 11, like Date.getMonth()
const monthOf = (iso) => {
  const d = new Date(iso);
  return { year: d.getFullYear(), m: d.getMonth() };
};

const monthKey = ({ year, m }) => year * 12 + m;

const previousMonth = ({ year, m }) =>
  m === 0 ? { year: year - 1, m: 11 } : { year, m: m - 1 };

const sum = (list) => list.reduce((t, e) => t + e.amount, 0);

// "Oct" when it is one month, "Oct – Dec" when it spans more
function timeframe(items) {
  const times = items.map((e) => new Date(e.createdAt).getTime());
  const first = new Date(Math.min(...times));
  const last = new Date(Math.max(...times));
  const a = SHORT_MONTHS[first.getMonth()];
  const b = SHORT_MONTHS[last.getMonth()];
  return a === b ? a : `${a} – ${b}`;
}

// Top 4 categories by spend, everything else rolled into "Others".
// Up to 5 categories are shown as they are.
function breakdown(items) {
  const totals = new Map();
  items.forEach((e) => {
    const c = normalizeCategory(e.category);
    totals.set(c, (totals.get(c) || 0) + e.amount);
  });
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);

  let rows = sorted;
  if (sorted.length > 5) {
    const rest = sorted.slice(4).reduce((t, [, amount]) => t + amount, 0);
    rows = [...sorted.slice(0, 4), ["Others", rest]];
  }
  const max = rows[0]?.[1] || 1;
  return rows.map(([name, amount]) => ({
    name,
    amount,
    share: amount / max, // bar length, relative to the biggest category
  }));
}

// The item logged most often. If nothing was logged twice, fall back to the
// biggest single purchase and label it honestly.
function favorite(items) {
  const groups = new Map();
  items.forEach((e) => {
    const key = e.name.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  });

  const list = [...groups.values()].map((g) => ({
    items: g,
    count: g.length,
    spent: sum(g),
  }));

  const mostLogged = [...list].sort(
    (a, b) => b.count - a.count || b.spent - a.spent
  )[0];
  const repeated = mostLogged.count > 1;
  const pick = repeated
    ? mostLogged
    : [...list].sort((a, b) => b.spent - a.spent)[0];

  const latest = [...pick.items].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  )[0];

  return {
    label: repeated ? "Most logged item" : "Biggest buy",
    badge: repeated ? "Top Favorite" : "Biggest Buy",
    name: latest.name,
    category: normalizeCategory(latest.category),
    photo: latest.photo,
    timeframe: timeframe(pick.items),
    spent: pick.spent,
    snaps: pick.count,
  };
}

const pctChange = (now, before) =>
  before > 0 ? Math.round(((now - before) / before) * 100) : null;

// ---- Reasons: Need / Reward / Want ----
// Only Want + Reward are judged, against this guide (% of the month's logged spending).
// Needs still show in the pie, but are never judged: Budgey won't catch every need
// (transport, bills, ...), so a "need share" would not be reliable.
const REASONS = ["Need", "Reward", "Want"];
export const WANT_REWARD_GUIDE = 30;

const sharePct = (part, all) => (all > 0 ? Math.round((part / all) * 100) : 0);

// Pie data and the 30% verdict for one month. Entries without a known reason are
// left out. Returns null when no entry has a reason.
function reasonSummary(items) {
  const totals = { Need: 0, Reward: 0, Want: 0 };
  items.forEach((e) => {
    if (e.reason in totals) totals[e.reason] += e.amount;
  });
  const all = REASONS.reduce((t, r) => t + totals[r], 0);
  if (all === 0) return null;

  // Want + Reward first, so their slices sit together from the top of the pie
  const slices = ["Want", "Reward", "Need"].map((name) => ({
    name,
    amount: totals[name],
    pct: sharePct(totals[name], all),
  }));

  const wantReward = sharePct(totals.Want + totals.Reward, all);
  const verdict =
    wantReward < WANT_REWARD_GUIDE ? "under" : wantReward > WANT_REWARD_GUIDE ? "over" : "equal";

  return { slices, wantReward, verdict };
}

// The "Budgey says" sentence, as segments so the reasons can be highlighted.
// The ending is picked from two things at once: where the month sits against the guide
// (under / equal / over) and how it moved since last month (only moves of 10 points
// or more are mentioned), so the praise and the warning never contradict each other.
function buildMessage({ month, summary, prevSummary }) {
  const { wantReward, verdict } = summary;
  const G = WANT_REWARD_GUIDE;

  const prev = prevSummary?.wantReward;
  const diff = prevSummary ? wantReward - prev : 0;
  const down = diff <= -10;
  const up = diff >= 10;

  let ending;
  if (verdict === "over") {
    if (down) ending = `Over the ${G}% guide, but down from ${prev}% last month. Nice progress!`;
    else if (up) ending = `Over the ${G}% guide and up from ${prev}% last month. Worth a pause!`;
    else ending = `That's over the ${G}% guide. Worth a pause before the next buy!`;
  } else {
    const where = verdict === "equal" ? "right on" : "under";
    const praise = verdict === "equal" ? "Well balanced!" : "Great control!";
    if (up) ending = `That's ${where} the ${G}% guide, but up from ${prev}% last month. Keep an eye on it!`;
    else if (down) ending = `That's ${where} the ${G}% guide, and down from ${prev}% last month. ${praise}`;
    else ending = `That's ${where} the ${G}% guide. ${praise}`;
  }

  return [
    { text: `In ${month}, your ` },
    { hl: "Wants and Rewards" },
    { text: ` were ${wantReward}% of your spending. ` },
    { text: ending },
  ];
}

// The monthly recap is about the month that just ended: from Jan 1 it is
// December, from Mar 1 it is February, and so on. It stays that month until
// the next 1st. Returns null when that month has no entries, so there is
// nothing to show (for example during a user's first month).
export function buildRecap(entries, now = new Date()) {
  if (!entries.length) return null;

  const target = previousMonth({ year: now.getFullYear(), m: now.getMonth() });
  const inMonth = (mo) =>
    entries.filter((e) => monthKey(monthOf(e.createdAt)) === monthKey(mo));

  const items = inMonth(target);
  if (!items.length) return null;
  const before = inMonth(previousMonth(target));

  const total = sum(items);
  const snaps = items.length;
  const rows = breakdown(items);
  const topCategory = rows[0].name; // rows are sorted, "Others" is always last

  const snapChange = pctChange(snaps, before.length);
  const spendChange = pctChange(total, sum(before));
  const hasPrevious = before.length > 0;
  const reasons = reasonSummary(items);
  const prevReasons = before.length ? reasonSummary(before) : null;

  return {
    month: target.m + 1, // 1 to 12
    year: target.year,
    label: `${FULL_MONTHS[target.m]} · ${target.year}`,
    total,
    snaps,
    favorite: favorite(items),
    rows,
    topCategory,
    hasPrevious,
    snapChange, // % change in logged snaps vs last month (null if no data)
    spendChange,
    reasons, // { slices, wantReward, verdict } for the pie on the Budgey says slide (null if no reasons)
    message: buildMessage({
      month: FULL_MONTHS[target.m],
      summary: reasons,
      prevSummary: prevReasons,
    }),
  };
}
