// src/settings.js
// The user's settings, kept in the browser like the entries are. Pure helpers
// (no React) so they are easy to test.
//
//   targetWeekly   the average weekly spending the user wants to stay under,
//                  in pesos, or null when they have not set one. The forecast
//                  is compared against it.
//   startedAt      when the user started (ISO date string), or null before the
//                  first entry. It is set once and never recomputed, so
//                  deleting old entries does not move the forecast schedule.

import { MAX_WHOLE_DIGITS } from "./money";

export const SETTINGS_KEY = "budgey:settings";

// A usable target is a number above 0. Anything else means "not set".
export const validTarget = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// A usable start date is a string that parses as a date. Anything else means "not set".
export const validStartedAt = (value) =>
  typeof value === "string" && value !== "" && !Number.isNaN(new Date(value).getTime())
    ? value
    : null;

// createdAt of the oldest entry (ISO string), or null when there are none.
// Used once, for people who already have entries before startedAt existed.
export function oldestEntryDate(entries) {
  let oldest = null;
  for (const e of entries ?? []) {
    if (!e?.createdAt) continue;
    const t = new Date(e.createdAt).getTime();
    if (!Number.isNaN(t) && (oldest === null || t < oldest)) oldest = t;
  }
  return oldest === null ? null : new Date(oldest).toISOString();
}

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return {
      ...raw,
      targetWeekly: validTarget(raw?.targetWeekly),
      startedAt: validStartedAt(raw?.startedAt),
    };
  } catch {
    return { targetWeekly: null, startedAt: null };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn("Could not save settings:", err);
  }
}

// What the amount box accepts: digits and one decimal point, up to
// MAX_WHOLE_DIGITS digits and 2 decimal places (same rule as the tag form).
export function cleanAmountInput(raw) {
  const cleaned = String(raw).replace(/[^0-9.]/g, "");
  const [rawWhole, ...rest] = cleaned.split(".");
  const whole = rawWhole.replace(/^0+(?=\d)/, "").slice(0, MAX_WHOLE_DIGITS);
  return rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole;
}
