"""Backtest the Budgey weekly-spending forecast on made-up data.

Run from the backend folder:

    python scripts/backtest_forecast.py

No app, server, or photos needed. It imports the SAME functions the
/v1/forecast endpoint uses (outlier cap, ARIMA(0,1,1), moving-average
fallback), so what is scored here is what the app runs.

How the test works (rolling origin):
  1. Make a fake 52-week spending history of a known shape (see PATTERNS).
  2. Pretend it is week t. Give the model only weeks 0..t-1.
  3. Ask for the next 4 weeks and compare with what really happened.
  4. Repeat for many t and many random seeds.

The score is the error of the 4-week AVERAGE (that is what the app compares
with the user's target), shown as a percent of the true average, so patterns
with different spending levels can be compared. Lower is better.

Baselines the model should beat (otherwise ARIMA adds nothing):
  naive     repeat last week
  ma4       average of the last 4 weeks
  mean13    average of the last 13 weeks
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.routers.forecast import (  # noqa: E402
    MAX_WEEKS,
    MIN_WEEKS_ARIMA,
    _arima,
    _cap_outliers,
    _moving_average,
)

HORIZON = 4
SERIES_WEEKS = 52
FIRST_ORIGIN = 13        # the first forecast in the app has 12-13 weeks
ORIGIN_STEP = 2
SEEDS = 60


# ---------- made-up spending patterns (pesos per week) ----------

def steady(rng, n):
    return 1200 * rng.lognormal(0, 0.18, n)


def rising(rng, n):
    return 900 * (1.02 ** np.arange(n)) * rng.lognormal(0, 0.15, n)


def falling(rng, n):
    return 1800 * (0.98 ** np.arange(n)) * rng.lognormal(0, 0.15, n)


def level_shift(rng, n):
    at = int(rng.integers(18, 32))
    base = np.where(np.arange(n) < at, 1000, 1700)
    return base * rng.lognormal(0, 0.15, n)


def one_off_spikes(rng, n):
    y = 1000 * rng.lognormal(0, 0.15, n)
    spike = rng.random(n) < 0.06          # a phone, a gift, tuition...
    return np.where(spike, y * rng.uniform(4, 8, n), y)


def payday_cycle(rng, n):
    bump = np.where(np.arange(n) % 4 == 0, 1.5, 1.0)   # bigger spend every 4th week
    return 1000 * bump * rng.lognormal(0, 0.12, n)


def drifting(rng, n):
    level = 1200 * np.exp(np.cumsum(rng.normal(0, 0.07, n)))   # slow random drift
    return level * rng.lognormal(0, 0.12, n)


PATTERNS = {
    "steady": steady,
    "rising (+2%/wk)": rising,
    "falling (-2%/wk)": falling,
    "level shift": level_shift,
    "one-off spikes": one_off_spikes,
    "4-week payday cycle": payday_cycle,
    "random drift": drifting,
}


# ---------- the model, exactly as the endpoint runs it ----------

def app_forecast(history):
    """Returns (avg_forecast, lower, upper, method) like /v1/forecast."""
    y = _cap_outliers(np.asarray(history[-MAX_WEEKS:], dtype=float))
    result = _arima(y, HORIZON) if len(y) >= MIN_WEEKS_ARIMA else None
    method = "arima"
    if result is None:
        method = "moving_average"
        result = _moving_average(y, HORIZON)
    path, lo, hi = result
    return float(np.mean(path)), lo, hi, method, y


def baselines(y):
    return {
        "naive": float(y[-1]),
        "ma4": float(y[-4:].mean()),
        "mean13": float(y[-13:].mean()),
    }


# ---------- run ----------

def run():
    names = ["ARIMA (app)", "naive", "ma4", "mean13"]
    table = {}
    for pname, make in PATTERNS.items():
        errs = {n: [] for n in names}
        inside, total, used_arima = 0, 0, 0
        for seed in range(SEEDS):
            rng = np.random.default_rng(seed)
            series = make(rng, SERIES_WEEKS)
            for t in range(FIRST_ORIGIN, SERIES_WEEKS - HORIZON + 1, ORIGIN_STEP):
                actual = float(series[t:t + HORIZON].mean())
                avg, lo, hi, method, y = app_forecast(series[:t])
                preds = {"ARIMA (app)": avg, **baselines(y)}
                for n in names:
                    errs[n].append(abs(preds[n] - actual) / actual * 100)
                inside += lo <= actual <= hi
                used_arima += method == "arima"
                total += 1
        table[pname] = {
            "mape": {n: float(np.mean(errs[n])) for n in names},
            "cover": inside / total * 100,
            "arima_share": used_arima / total * 100,
        }
    return names, table


def main():
    names, table = run()
    print(f"Backtest: {SEEDS} fake series x ~{(SERIES_WEEKS - HORIZON - FIRST_ORIGIN) // ORIGIN_STEP + 1} "
          f"forecasts each, {HORIZON}-week horizon.")
    print("Error of the 4-week average, % of the true average (lower is better).\n")
    head = f"{'pattern':<22}" + "".join(f"{n:>13}" for n in names) + f"{'best':>14}{'range hit%':>12}"
    print(head)
    print("-" * len(head))
    wins = {n: 0 for n in names}
    for pname, row in table.items():
        m = row["mape"]
        best = min(m, key=m.get)
        wins[best] += 1
        print(f"{pname:<22}" + "".join(f"{m[n]:>12.1f}%" for n in names)
              + f"{best:>14}{row['cover']:>11.0f}%")
    avg = {n: np.mean([r["mape"][n] for r in table.values()]) for n in names}
    print("-" * len(head))
    print(f"{'average':<22}" + "".join(f"{avg[n]:>12.1f}%" for n in names))
    print("\n'range hit%' = how often the true 4-week average fell inside the model's "
          "lower..upper range (the range is meant to be an 80% range, so ~80 is ideal).")


if __name__ == "__main__":
    main()
