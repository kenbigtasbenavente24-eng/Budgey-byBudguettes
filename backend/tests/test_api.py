import io

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app

client = TestClient(app)


def _png(color):
    buf = io.BytesIO()
    Image.new("RGB", (80, 80), color).save(buf, format="PNG")
    return buf.getvalue()


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_classify_returns_category():
    r = client.post("/v1/classify", files={"file": ("a.png", _png((200, 30, 30)), "image/png")})
    assert r.status_code == 200
    body = r.json()
    assert body["category"] in {"clothing", "drinks", "food", "others", "shoes"}
    assert 0.0 <= body["confidence"] <= 1.0


def test_classify_rejects_non_image():
    r = client.post("/v1/classify", files={"file": ("a.txt", b"hello", "text/plain")})
    assert r.status_code == 415


def test_match_finds_identical_embedding():
    emb = [0.1, 0.9, -0.2, 0.4]
    r = client.post(
        "/v1/match",
        json={
            "embedding": emb,
            "candidates": [
                {"id": "milk", "embedding": emb},
                {"id": "other", "embedding": [-0.9, 0.1, 0.5, -0.3]},
            ],
        },
    )
    body = r.json()
    assert body["matched"] is True
    assert body["matches"][0]["id"] == "milk"


def test_match_no_candidates():
    r = client.post("/v1/match", json={"embedding": [1.0, 0.0], "candidates": []})
    assert r.json()["matched"] is False


def test_match_dimension_mismatch():
    r = client.post(
        "/v1/match",
        json={"embedding": [1.0, 0.0], "candidates": [{"id": "x", "embedding": [1.0]}]},
    )
    assert r.status_code == 422


from datetime import date, timedelta
import random


def _weeks(totals):
    start = date(2026, 1, 5)
    return [
        {"week_start": (start + timedelta(weeks=i)).isoformat(), "total": t}
        for i, t in enumerate(totals)
    ]


def test_forecast_arima_follows_rising_spending():
    rng = random.Random(0)
    totals = [800 + 50 * i + rng.uniform(-40, 40) for i in range(16)]
    r = client.post("/v1/forecast", json={
        "weekly_totals": _weeks(totals), "horizon": 4, "target_weekly": 1000})
    assert r.status_code == 200
    body = r.json()
    assert body["method"] == "arima"
    assert len(body["forecast"]) == 4
    assert body["forecast_avg_weekly"] > sum(totals) / len(totals)
    assert body["lower"] <= body["forecast_avg_weekly"] <= body["upper"]
    assert body["verdict"] == "warn"


def test_forecast_short_series_uses_moving_average():
    r = client.post("/v1/forecast", json={
        "weekly_totals": _weeks([900, 1100, 1000, 950, 1050, 1000]),
        "horizon": 4, "target_weekly": 2000})
    body = r.json()
    assert r.status_code == 200
    assert body["method"] == "moving_average"
    assert body["verdict"] == "keep_it_up"


def test_forecast_rejects_bad_target():
    r = client.post("/v1/forecast", json={
        "weekly_totals": _weeks([100, 200]), "horizon": 4, "target_weekly": 0})
    assert r.status_code == 422