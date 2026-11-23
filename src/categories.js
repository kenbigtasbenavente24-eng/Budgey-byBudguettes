// src/categories.js
// The ONE place the app's categories are defined. The tag form's dropdown,
// the classifier mapping (api.js), the Gallery summary and the Recap all read
// from here, so a name can only be spelled one way. Pure helpers (no React).
//
// Food and Drinks are separate categories (team decision, Nov 15).

// The categories in the dropdown, in order. "Other" is not stored as a name:
// picking it lets the user type their own category name instead.
export const CATEGORIES = ["Beverages", "Footwear", "Clothing", "Food"];

export const OTHER = "Other";

// The classifier's classes -> the category names above.
// "others" is left out on purpose: no suggestion, the user picks.
export const MODEL_CLASS_TO_CATEGORY = {
  clothing: "Clothing",
  shoes: "Footwear",
  food: "Food",
  drinks: "Beverages",
};

// Names earlier versions of the app saved, and what they are called now.
// Keys are lower case. Left out on purpose: "Food & Drinks" (saved Nov 7 to 10
// when the two were merged) cannot be split back into Food and Beverages, so
// those entries keep their name until the user edits them.
const LEGACY_NAMES = {
  clothes: "Clothing", // Nov 10 to 12
  apparel: "Clothing", // Oct 20 to Nov 10 (the classifier also used it for shoes)
  drinks: "Beverages", // Nov 7
};

export const isListedCategory = (name) => CATEGORIES.includes(name);

// The name to show and to total by. Matching ignores case and extra spaces, so
// a typed "food" counts as Food. Names it does not know (the user's own
// "Other" names) are returned as typed. An empty name counts as "Other".
export function normalizeCategory(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return OTHER;
  const lower = trimmed.toLowerCase();
  return CATEGORIES.find((c) => c.toLowerCase() === lower) ?? LEGACY_NAMES[lower] ?? trimmed;
}

// The user's own category names ("Other" > type your own) are kept as typed, so
// "person", "Person" and "person " would be three categories. This makes them
// one: names that differ only by capital letters or extra spaces get the
// spelling used most often (on a tie, the one used first).
export function unifyCategoryNames(entries) {
  if (!Array.isArray(entries)) return entries;
  const tidy = (name) => normalizeCategory(name).replace(/\s+/g, " ");

  // spellings[key] = Map(spelling -> { count, first })
  const spellings = new Map();
  entries.forEach((e) => {
    if (!e || typeof e.category !== "string") return;
    const name = tidy(e.category);
    const key = name.toLowerCase();
    const time = new Date(e.createdAt).getTime();
    const byName = spellings.get(key) ?? new Map();
    const seen = byName.get(name) ?? { count: 0, first: Infinity };
    seen.count += 1;
    if (time < seen.first) seen.first = time;
    byName.set(name, seen);
    spellings.set(key, byName);
  });

  const winner = new Map(); // key -> the spelling to use
  spellings.forEach((byName, key) => {
    const [best] = [...byName.entries()].sort(
      (a, b) => b[1].count - a[1].count || a[1].first - b[1].first || a[0].localeCompare(b[0])
    );
    winner.set(key, best[0]);
  });

  let changed = false;
  const next = entries.map((e) => {
    if (!e || typeof e.category !== "string") return e;
    const name = winner.get(tidy(e.category).toLowerCase());
    if (name === e.category) return e;
    changed = true;
    return { ...e, category: name };
  });
  return changed ? next : entries;
}

// Clean up category names in saved entries: rename old names (Clothes, Apparel,
// Drinks) and merge spellings of the user's own names (see unifyCategoryNames).
// Safe to run on every load and every save: an entry that is already current
// is returned as the same object, and when nothing changed the same array comes back.
export function migrateEntries(entries) {
  if (!Array.isArray(entries)) return entries;
  let changed = false;
  const next = entries.map((e) => {
    if (!e || typeof e.category !== "string") return e;
    const name = normalizeCategory(e.category);
    if (name === e.category) return e;
    changed = true;
    return { ...e, category: name };
  });
  return unifyCategoryNames(changed ? next : entries);
}
