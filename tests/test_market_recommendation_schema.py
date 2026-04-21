# tests/test_market_recommendation_schema.py
"""Schema 单元测试 - 验证 Pydantic 模型字段与校验规则"""
from src.schemas.market_recommendation_schema import (
    ScoreBreakdown,
    RecommendedStock,
    SectorEntry,
    MarketOverview,
    RecommendationResult,
)


def test_score_breakdown_accepts_all_dimensions():
    sb = ScoreBreakdown(
        trend=25, volume_price=20, kline=15, space=10, momentum=8,
        divergence_deduction=-5, total=73,
    )
    assert sb.total == 73
    assert sb.divergence_deduction == -5


def test_recommended_stock_full_payload():
    stock = RecommendedStock(
        code="600519", name="贵州茅台", price=1680.0, change_pct=1.2,
        score=78,
        score_breakdown=ScoreBreakdown(
            trend=24, volume_price=19, kline=16, space=12, momentum=7,
            divergence_deduction=0, total=78,
        ),
        trend_summary="均线多头+量价配合良好",
        operation="buy", quantity=100, cost_estimate=168050.0, fee_estimate=50.0,
        entry_hint="回踩 MA5 附近介入", stop_loss=1629.6, target=1764.0,
        rationale="板块龙头+评分78",
    )
    assert stock.operation == "buy"
    assert stock.quantity % 100 == 0


def test_recommendation_result_session_literal():
    result = RecommendationResult(
        session="morning",
        generated_at="2026-04-20T10:00:00+08:00",
        overview=MarketOverview(
            sh_index_value=3200.0, sh_index_change_pct=0.5,
            top_sectors=[SectorEntry(name="半导体", change_pct=2.1)],
            up_count=3000, down_count=2000, limit_up_count=50, limit_down_count=5,
        ),
        recommendations=[],
        warnings=[],
        risk_notes=["总仓位建议不超过30-40%"],
    )
    assert result.session == "morning"
    assert result.overview.sh_index_value == 3200.0


def test_recommendation_result_rejects_invalid_session():
    import pytest
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        RecommendationResult(
            session="evening",  # type: ignore[arg-type]
            generated_at="2026-04-20T10:00:00+08:00",
            overview=MarketOverview(
                sh_index_value=0.0, sh_index_change_pct=0.0, top_sectors=[],
                up_count=0, down_count=0, limit_up_count=0, limit_down_count=0,
            ),
            recommendations=[], warnings=[], risk_notes=[],
        )
