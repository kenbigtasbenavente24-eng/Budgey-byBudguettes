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
    assert body["category"] in {"clothing", "drinks", "food", "other", "shoes"}
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


def test_forecast_not_implemented():
    assert client.post("/v1/forecast").status_code == 501
