from datetime import timedelta

import numpy as np
from fastapi import APIRouter

from ..schemas import ForecastPoint, ForecastRequest, ForecastResponse

router = APIRouter(prefix="/v1", tags=["arima"])

MAX_WEEKS = 26         # only recent habits matter for a 4-week forecast
MIN_WEEKS_ARIMA = 10   # fewer weeks than this -> moving average
CAP_MULTIPLE = 3.0     # a one-off week is capped at 3x the median week
ORDER = (0, 1, 1)      # follows level shifts without overfitting ~13 points


def _cap_outliers(y):
    """Cap one-off purchases (e.g. a phone) so they don't look like a habit."""
    if len(y) < 8:
        return y
    med = float(np.median(y))
    return np.minimum(y, med * CAP_MULTIPLE) if med > 0 else y


def _fit_ma1(y):
    """Fit ARIMA(0,1,1) by least squares: d_t = e_t + theta * e_(t-1)."""
    d = np.diff(y)
    best_sse, best_theta, best_e = np.inf, 0.0, None
    for theta in np.linspace(-0.95, 0.95, 191):
        e = np.empty_like(d)
        prev = 0.0
        for t, dt in enumerate(d):
            prev = dt - theta * prev
            e[t] = prev
        sse = float(e @ e)
        if sse < best_sse:
            best_sse, best_theta, best_e = sse, theta, e
    return best_theta, best_e


def _arima(y, h):
    try:
        theta, e = _fit_ma1(y)
        # Forecast is flat: last value plus the last shock's carry-over
        level = float(y[-1] + theta * e[-1])
        path = np.clip(np.full(h, level), 0, None)

        # Range for the average week: simulate futures by resampling residuals
        rng = np.random.default_rng(0)
        draws = rng.choice(e - e.mean(), size=(500, h))
        shocks = np.concatenate([np.full((500, 1), e[-1]), draws], axis=1)
        sims = y[-1] + np.cumsum(draws + theta * shocks[:, :-1], axis=1)
    except Exception:
        return None
    if not np.isfinite(level):
        return None
    means = np.clip(sims, 0, None).mean(axis=1)
    lo, hi = np.percentile(means, [10, 90])
    return path, float(lo), float(hi)

def _moving_average(y, h):
    recent = y[-4:]
    avg = float(recent.mean())
    se = float(recent.std(ddof=1) / np.sqrt(len(recent))) if len(recent) > 1 else 0.0
    return np.full(h, avg), max(0.0, avg - 1.28 * se), avg + 1.28 * se  # approximate


@router.post("/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest):
    weeks = sorted(req.weekly_totals, key=lambda w: w.week_start)[-MAX_WEEKS:]
    y = _cap_outliers(np.array([w.total for w in weeks], dtype=float))

    result = _arima(y, req.horizon) if len(y) >= MIN_WEEKS_ARIMA else None
    method = "arima"
    if result is None:
        method = "moving_average"
        result = _moving_average(y, req.horizon)
    path, lower, upper = result

    last = weeks[-1].week_start
    points = [
        ForecastPoint(week_start=last + timedelta(weeks=i + 1), total=round(float(t), 2))
        for i, t in enumerate(path)
    ]
    avg = float(np.mean(path))
    return ForecastResponse(
        method=method,
        weeks_used=len(y),
        forecast=points,
        forecast_avg_weekly=round(avg, 2),
        lower=round(lower, 2),
        upper=round(upper, 2),
        target_weekly=req.target_weekly,
        verdict="warn" if avg > req.target_weekly else "keep_it_up",
    )