from api.v1.schemas.stocks import StockScreenRequest, StockScreenResponse


def test_screen_request_accepts_defaults():
    req = StockScreenRequest(board_name="人工智能")
    assert req.board_type == "concept"
    assert req.top_n == 10
    assert req.min_score == 60
    assert req.exclude_negative_pe is True


def test_screen_request_accepts_overrides():
    req = StockScreenRequest(board_name="半导体", board_type="industry", top_n=20, min_score=70, min_market_cap=100e8, exclude_negative_pe=False)
    assert req.board_name == "半导体"
    assert req.board_type == "industry"
    assert req.top_n == 20
    assert req.min_market_cap == 100e8


def test_screen_response_shape():
    res = StockScreenResponse(
        total=1,
        items=[{
            "code": "600519",
            "name": "贵州茅台",
            "price": 1700.0,
            "change_pct": 0.01,
            "score": 85,
            "sector": "白酒",
        }],
    )
    assert res.total == 1
    assert res.items[0].code == "600519"
    assert res.items[0].score == 85
