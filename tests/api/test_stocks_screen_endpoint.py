from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from api.app import create_app


def test_screen_endpoint_delegates_to_service():
    app = create_app()
    client = TestClient(app)
    fake_items = [
        {
            "code": "600519",
            "name": "贵州茅台",
            "price": 1700.0,
            "change_pct": 0.01,
            "pe_ratio": 30.0,
            "total_mv": 2e12,
            "score": 85,
        }
    ]
    with patch("api.v1.endpoints.stocks.StockScreener") as Cls, \
         patch("api.v1.endpoints.stocks.DataFetcherManager") as MgrCls:
        MgrCls.return_value = MagicMock()
        Cls.return_value.screen_from_sector.return_value = fake_items
        resp = client.post(
            "/api/v1/stocks/screen",
            json={
                "board_name": "白酒",
                "board_type": "concept",
                "top_n": 5,
                "min_score": 70,
                "min_market_cap": 100e8,
                "exclude_negative_pe": True,
            },
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["code"] == "600519"
    # Verify call arguments
    Cls.return_value.screen_from_sector.assert_called_once_with(
        board_name="白酒",
        board_type="concept",
        top_n=5,
        min_score=70,
        min_market_cap=100e8,
        exclude_negative_pe=True,
    )
