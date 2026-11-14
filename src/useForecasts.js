// src/useForecasts.js
// Keeps the saved forecasts and generates the one that is due.
//
// Every time the app opens (and when the start date or target changes) it
// asks forecast.js whether a forecast is due that has not been saved yet. If
// so, it sends the weekly totals to the backend and saves the answer. If the
// backend is down nothing is saved, so the same check tries again on the next
// app open. Without a target nothing is sent (the backend needs one); the
// forecast is generated as soon as the user sets it.

import { useEffect, useRef, useState } from "react";
import { getForecast } from "./api";
import { buildForecastRequest, pendingDue, toDateKey } from "./forecast";
import { isForecastRecord, loadForecasts, saveForecasts } from "./forecastStore";

export function useForecasts(entries, { startedAt, targetWeekly }) {
  const [forecasts, setForecasts] = useState(loadForecasts);
  const inFlight = useRef(new Set()); // due dates being requested right now
  const entriesRef = useRef(entries); // read inside the check without re-running it on every entry

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    saveForecasts(forecasts);
  }, [forecasts]);

  useEffect(() => {
    if (!startedAt || !targetWeekly) return;
    const due = pendingDue(startedAt, Object.keys(forecasts));
    if (!due) return;
    const key = toDateKey(due);
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);

    getForecast(buildForecastRequest(entriesRef.current, startedAt, due, targetWeekly))
      .then((result) => {
        const record = { generatedAt: new Date().toISOString(), result };
        if (!isForecastRecord(record)) throw new Error("Unexpected forecast response");
        setForecasts((prev) => ({ ...prev, [key]: record }));
      })
      .catch((err) => console.warn("Forecast unavailable, will retry next time:", err))
      .finally(() => inFlight.current.delete(key));
  }, [startedAt, targetWeekly, forecasts]);

  return forecasts;
}
