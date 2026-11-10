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

const quarterOf = (iso) => {
  const d = new Date(iso);
  return { year: d.getFullYear(), q: Math.floor(d.getMonth() / 3) + 1 };
};

const quarterKey = ({ year, q }) => year * 10 + q;

const previousQuarter = ({ year, q }) =>
  q === 1 ? { year: year - 1, q: 4 } : { year, q: q - 1 };

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
function buildMessage({ q, topCategory, spendChange, snapChange, hasPrevious }) {
  const parts = [];
  if (!hasPrevious) {
    parts.push({ text: `Great start to Q${q}! ` });
    parts.push({ hl: topCategory });
    parts.push({
      text: " was your biggest focus. Keep logging and next quarter we can show how you grow.",
    });
    return parts;
  }

  if (snapChange !== null && snapChange > 10) {
    parts.push({ text: `You kept the snaps coming in Q${q}! ` });
  } else if (snapChange !== null && snapChange < -10) {
    parts.push({ text: `Q${q} was a quieter quarter for logging. ` });
  } else {
    parts.push({ text: `Your Q${q} logging habit was super steady! ` });
  }
  parts.push({ hl: topCategory });
  if (spendChange !== null && spendChange > 10) {
    parts.push({
      text: ` remained your highest focus, but overall spending rose ${spendChange}% from last quarter. Worth a look!`,
    });
  } else if (spendChange !== null && spendChange < -10) {
    parts.push({
      text: ` remained your highest focus, and you spent ${Math.abs(spendChange)}% less than last quarter. Nice work!`,
    });
  } else {
    parts.push({
      text: " remained your highest focus while overall spending stayed well managed.",
    });
  }
  return parts;
}

// Which quarter to recap: the current one if it has entries,
// otherwise the most recent quarter that does.
export function buildRecap(entries, now = new Date()) {
  if (!entries.length) return null;

  const current = { year: now.getFullYear(), q: Math.floor(now.getMonth() / 3) + 1 };
  const hasEntriesIn = (qt) =>
    entries.some((e) => quarterKey(quarterOf(e.createdAt)) === quarterKey(qt));

  let target = current;
  if (!hasEntriesIn(current)) {
    target = entries
      .map((e) => quarterOf(e.createdAt))
      .sort((a, b) => quarterKey(b) - quarterKey(a))[0];
  }

  const inQuarter = (qt) =>
    entries.filter((e) => quarterKey(quarterOf(e.createdAt)) === quarterKey(qt));

  const items = inQuarter(target);
  const before = inQuarter(previousQuarter(target));

  const total = sum(items);
  const snaps = items.length;
  const rows = breakdown(items);
  const topCategory = rows[0].name; // rows are sorted, "Others" is always last

  const snapChange = pctChange(snaps, before.length);
  const spendChange = pctChange(total, sum(before));
  const hasPrevious = before.length > 0;

  return {
    q: target.q,
    year: target.year,
    label: `Q${target.q} · ${target.year}`,
    total,
    snaps,
    favorite: favorite(items),
    rows,
    topCategory,
    hasPrevious,
    snapChange, // % change in logged snaps vs last quarter (null if no data)
    spendChange,
    message: buildMessage({ q: target.q, topCategory, spendChange, snapChange, hasPrevious }),
  };
}
