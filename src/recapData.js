// src/recap.js
// Turns the list of entries into the numbers the Budgey Recap slides show.
// Pure functions only (no React), so they are easy to test.

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

// Entries saved before the Food + Drinks merge still say "Food"
const normalizeCategory = (c) => {
  const name = (c || "").trim();
  if (!name || name.toLowerCase() === "food") return "Food & Drinks";
  return name;
};

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

// The "Budgey says" sentence, as segments so the category can be highlighted
function buildMessage({ month, topCategory, spendChange, snapChange, hasPrevious }) {
  const parts = [];
  if (!hasPrevious) {
    parts.push({ text: `Great start in ${month}! ` });
    parts.push({ hl: topCategory });
    parts.push({
      text: " was your biggest focus. Keep logging and next month we can show how you grow.",
    });
    return parts;
  }

  if (snapChange !== null && snapChange > 10) {
    parts.push({ text: `You kept the snaps coming in ${month}! ` });
  } else if (snapChange !== null && snapChange < -10) {
    parts.push({ text: `${month} was a quieter month for logging. ` });
  } else {
    parts.push({ text: `Your ${month} logging habit was super steady! ` });
  }
  parts.push({ hl: topCategory });
  if (spendChange !== null && spendChange > 10) {
    parts.push({
      text: ` remained your highest focus, but overall spending rose ${spendChange}% from last month. Worth a look!`,
    });
  } else if (spendChange !== null && spendChange < -10) {
    parts.push({
      text: ` remained your highest focus, and you spent ${Math.abs(spendChange)}% less than last month. Nice work!`,
    });
  } else {
    parts.push({
      text: " remained your highest focus while overall spending stayed well managed.",
    });
  }
  return parts;
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
    message: buildMessage({
      month: FULL_MONTHS[target.m],
      topCategory,
      spendChange,
      snapChange,
      hasPrevious,
    }),
  };
}
