// src/forecastStore.js
// Saved forecasts, kept in the browser like the entries are. Pure helpers
// (no React) so they are easy to test.
//
// Shape: an object keyed by the forecast's due date (toDateKey, "2027-04-01"):
//   { "2027-04-01": { generatedAt: "<ISO>", result: <backend response> } }
// `result` is what POST /v1/forecast returned. It already holds the target the
// forecast was compared against, so changing the target later does not rewrite
// an old forecast.

export const FORECASTS_KEY = "budgey:forecasts";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

// Is this what the Says slide needs? Checked on load, so a corrupt or old
// record is dropped (and generated again) instead of crashing the slide.
export function isForecastRecord(record) {
  const r = record?.result;
  return (
    !!r &&
    Array.isArray(r.forecast) &&
    r.forecast.length > 0 &&
    [r.forecast_avg_weekly, r.lower, r.upper, r.target_weekly].every(Number.isFinite) &&
    (r.verdict === "warn" || r.verdict === "keep_it_up")
  );
}

export function loadForecasts() {
  try {
    const raw = JSON.parse(localStorage.getItem(FORECASTS_KEY));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw).filter(([key, record]) => DATE_KEY.test(key) && isForecastRecord(record))
    );
  } catch {
    return {};
  }
}

export function saveForecasts(forecasts) {
  try {
    localStorage.setItem(FORECASTS_KEY, JSON.stringify(forecasts));
  } catch (err) {
    console.warn("Could not save forecasts:", err);
  }
}
