# tests/test_market_recommendation_service.py
"""MarketRecommendationService 测试"""
from unittest.mock import MagicMock

import pytest

from src.services.market_recommendation_service import (
    MarketRecommendationService,
    MarketDataUnavailable,
)


@pytest.fixture
def mock_manager():
    m = MagicMock()
    m.get_main_indices.return_value = [
        {"name": "上证指数", "current": 3200.5, "change_pct": 0.42},
        {"name": "深证成指", "current": 10500.0, "change_pct": -0.1},
    ]
    m.get_market_stats.return_value = {
        "up_count": 3100, "down_count": 1800, "flat_count": 100,
        "limit_up_count": 62, "limit_down_count": 4, "total_amount": 9.5e11,
    }
    m.get_sector_rankings.return_value = (
        [
            {"name": "半导体", "change_pct": 3.5},
            {"name": "光伏", "change_pct": 2.9},
            {"name": "银行", "change_pct": 1.8},
            {"name": "医药", "change_pct": 1.5},
            {"name": "汽车", "change_pct": 1.2},
        ],
        [{"name": "地产", "change_pct": -2.1}],
    )
    return m


@pytest.fixture
def mock_screener():
    s = MagicMock()
    s.screen_from_sector.return_value = []
    return s


def test_build_overview_populates_sh_index(mock_manager, mock_screener):
    service = MarketRecommendationService(
        manager=mock_manager, screener=mock_screener,
    )
    overview = service._build_overview()
    assert overview.sh_index_value == 3200.5
    assert overview.sh_index_change_pct == 0.42
    assert len(overview.top_sectors) == 3
    assert overview.top_sectors[0].name == "半导体"
    assert overview.limit_up_count == 62


def test_build_overview_raises_when_indices_empty(mock_manager, mock_screener):
    mock_manager.get_main_indices.return_value = []
    service = MarketRecommendationService(
        manager=mock_manager, screener=mock_screener,
    )
    with pytest.raises(MarketDataUnavailable):
        service._build_overview()


def _fake_screen_result(code, name, score):
    return {
        "code": code, "name": name, "price": 10.0, "change_pct": 1.5,
        "score": score,
        "breakdown": {
            "trend": 20, "volume_price": 15, "kline": 12, "space": 10,
            "momentum": 6, "divergence_deduction": 0,
        },
        "details": {},
    }


def test_collect_candidates_merges_and_dedups(mock_manager, mock_screener):
    mock_screener.screen_from_sector.side_effect = [
        [_fake_screen_result("600519", "贵州茅台", 80),
         _fake_screen_result("000001", "平安银行", 65)],
        [_fake_screen_result("600519", "贵州茅台", 80),  # 重复
         _fake_screen_result("002594", "比亚迪", 72)],
        [_fake_screen_result("601318", "中国平安", 68)],
    ]
    service = MarketRecommendationService(manager=mock_manager, screener=mock_screener)
    sector_names = ["半导体", "光伏", "银行"]
    candidates, warnings = service._collect_candidates(sector_names)
    codes = [c["code"] for c in candidates]
    assert len(candidates) == 3  # FINAL_PICK_LIMIT
    assert codes[0] == "600519"  # 最高分
    assert codes == sorted(codes, key=lambda c: -next(x for x in candidates if x["code"] == c)["score"])
    assert len(set(codes)) == 3  # 去重
    assert warnings == []


def test_collect_candidates_tolerates_sector_failure(mock_manager, mock_screener):
    mock_screener.screen_from_sector.side_effect = [
        [_fake_screen_result("600519", "贵州茅台", 80)],
        RuntimeError("网络限流"),
        [_fake_screen_result("002594", "比亚迪", 72)],
    ]
    service = MarketRecommendationService(manager=mock_manager, screener=mock_screener)
    candidates, warnings = service._collect_candidates(["半导体", "光伏", "银行"])
    assert len(candidates) == 2
    assert any("光伏" in w for w in warnings)


def test_collect_candidates_returns_empty_when_all_fail(mock_manager, mock_screener):
    mock_screener.screen_from_sector.side_effect = RuntimeError("boom")
    service = MarketRecommendationService(manager=mock_manager, screener=mock_screener)
    candidates, warnings = service._collect_candidates(["A", "B", "C"])
    assert candidates == []
    assert len(warnings) == 3


def test_build_suggestion_computes_stop_and_target():
    service = MarketRecommendationService(manager=MagicMock(), screener=MagicMock())
    entry = _fake_screen_result("600519", "贵州茅台", 78)
    entry["price"] = 100.0
    rec = service._build_recommendation(entry)
    assert rec.code == "600519"
    assert rec.stop_loss == pytest.approx(97.0, abs=0.01)
    assert rec.target == pytest.approx(105.0, abs=0.01)
    assert rec.quantity % 100 == 0
    assert rec.quantity >= 100
    assert rec.fee_estimate > 0
    assert rec.cost_estimate > rec.price * rec.quantity  # 含费
    assert rec.operation in ("buy", "watch", "hold")


def test_build_suggestion_switches_to_watch_when_overheated():
    service = MarketRecommendationService(manager=MagicMock(), screener=MagicMock())
    entry = _fake_screen_result("000001", "平安银行", 92)
    entry["change_pct"] = 8.0  # > 7%
    rec = service._build_recommendation(entry)
    assert rec.operation == "watch"


def test_generate_end_to_end_success(mock_manager, mock_screener):
    mock_screener.screen_from_sector.side_effect = [
        [_fake_screen_result("600519", "贵州茅台", 80)],
        [_fake_screen_result("002594", "比亚迪", 72)],
        [_fake_screen_result("601318", "中国平安", 65)],
    ]
    service = MarketRecommendationService(manager=mock_manager, screener=mock_screener)
    result = service.generate("morning")
    assert result.session == "morning"
    assert len(result.recommendations) == 3
    assert result.recommendations[0].code == "600519"
    assert result.overview.sh_index_value == 3200.5
    assert "Asia/Shanghai" not in result.generated_at  # ISO with offset
    assert "+08:00" in result.generated_at
    assert len(result.risk_notes) >= 1


def test_generate_raises_when_overview_unavailable(mock_screener):
    m = MagicMock()
    m.get_main_indices.return_value = []  # 触发 MarketDataUnavailable
    service = MarketRecommendationService(manager=m, screener=mock_screener)
    with pytest.raises(MarketDataUnavailable):
        service.generate("morning")


def test_generate_returns_empty_recommendations_when_all_sectors_fail(
    mock_manager, mock_screener,
):
    mock_screener.screen_from_sector.side_effect = RuntimeError("net")
    service = MarketRecommendationService(manager=mock_manager, screener=mock_screener)
    result = service.generate("afternoon")
    assert result.recommendations == []
    assert any("候选不足" in w for w in result.warnings)
    assert any("筛选失败" in w for w in result.warnings)


def test_generate_rejects_invalid_session(mock_manager, mock_screener):
    service = MarketRecommendationService(manager=mock_manager, screener=mock_screener)
    with pytest.raises(ValueError):
        service.generate("evening")  # type: ignore[arg-type]
