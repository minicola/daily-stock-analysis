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
