# tests/test_market_recommendation_api.py
"""API endpoint 测试 - POST /api/v1/market/recommendations"""
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from server import app
    return TestClient(app)


def _success_payload():
    return {
        "session": "morning",
        "generated_at": "2026-04-20T10:00:00+08:00",
        "overview": {
            "sh_index_value": 3200.0, "sh_index_change_pct": 0.5,
            "top_sectors": [{"name": "半导体", "change_pct": 2.1}],
            "up_count": 3000, "down_count": 2000,
            "limit_up_count": 50, "limit_down_count": 5,
        },
        "recommendations": [],
        "warnings": [],
        "risk_notes": ["总仓位建议不超过 30-40%"],
    }


def test_post_recommendations_rejects_invalid_session(client):
    res = client.post("/api/v1/market/recommendations", json={"session": "evening"})
    assert res.status_code == 400
    body = res.json()
    # Project exception handler flattens detail dict (with "error" key) to top-level keys
    assert body["error_code"] == "INVALID_SESSION"


def test_post_recommendations_returns_200(client):
    from src.schemas.market_recommendation_schema import RecommendationResult
    fake_result = RecommendationResult.model_validate(_success_payload())
    with patch(
        "api.v1.endpoints.market_recommendation._build_service"
    ) as mock_factory:
        svc = MagicMock()
        svc.generate_with_timeout.return_value = fake_result
        mock_factory.return_value = svc
        res = client.post(
            "/api/v1/market/recommendations", json={"session": "morning"},
        )
    assert res.status_code == 200
    assert res.json()["session"] == "morning"


def test_post_recommendations_503_when_data_unavailable(client):
    from src.services.market_recommendation_service import MarketDataUnavailable
    with patch("api.v1.endpoints.market_recommendation._build_service") as mock_factory:
        svc = MagicMock()
        svc.generate_with_timeout.side_effect = MarketDataUnavailable("boom")
        mock_factory.return_value = svc
        res = client.post(
            "/api/v1/market/recommendations", json={"session": "morning"},
        )
    assert res.status_code == 503
    # pick ONE of the following based on project convention:
    assert body_code_is("DATA_SOURCE_UNAVAILABLE", res)


def body_code_is(expected: str, res) -> bool:
    body = res.json()
    if "error_code" in body:
        return body["error_code"] == expected
    return body.get("detail", {}).get("error_code") == expected
