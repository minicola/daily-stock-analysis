"""股票筛选服务测试"""
import pytest
import pandas as pd
import numpy as np
from src.services.stock_screener import StockScreener


class TestPreFilter:

    def test_exclude_gem(self):
        candidates = [
            {"code": "300750", "name": "宁德时代"},
            {"code": "603659", "name": "璞泰来"},
            {"code": "301269", "name": "某创业板股"},
        ]
        result = StockScreener.pre_filter(candidates)
        codes = [r["code"] for r in result]
        assert "300750" not in codes
        assert "301269" not in codes
        assert "603659" in codes

    def test_exclude_st(self):
        candidates = [
            {"code": "000001", "name": "*ST某某"},
            {"code": "600036", "name": "招商银行"},
        ]
        result = StockScreener.pre_filter(candidates)
        codes = [r["code"] for r in result]
        assert "000001" not in codes
        assert "600036" in codes

    def test_exclude_star_market(self):
        candidates = [
            {"code": "688001", "name": "某科创股"},
            {"code": "600438", "name": "通威股份"},
        ]
        result = StockScreener.pre_filter(candidates)
        codes = [r["code"] for r in result]
        assert "688001" not in codes
        assert "600438" in codes

    def test_exclude_by_market_cap(self):
        candidates = [
            {"code": "000001", "name": "A", "total_mv": 3_000_000_000},
            {"code": "000002", "name": "B", "total_mv": 80_000_000_000},
        ]
        result = StockScreener.pre_filter(candidates, min_market_cap=50e8)
        codes = [r["code"] for r in result]
        assert "000001" not in codes
        assert "000002" in codes

    def test_exclude_negative_pe(self):
        candidates = [
            {"code": "000001", "name": "A", "pe_ratio": -15.0},
            {"code": "000002", "name": "B", "pe_ratio": 25.0},
        ]
        result = StockScreener.pre_filter(candidates, exclude_negative_pe=True)
        codes = [r["code"] for r in result]
        assert "000001" not in codes
        assert "000002" in codes

    def test_no_filter_when_field_missing(self):
        candidates = [{"code": "000001", "name": "A"}]
        result = StockScreener.pre_filter(candidates, min_market_cap=50e8)
        assert len(result) == 1


class TestFiveDimensionScore:

    def _make_bullish_df(self) -> pd.DataFrame:
        dates = pd.date_range("2026-02-10", periods=40, freq="B")
        base = 30.0
        data = []
        for i, d in enumerate(dates):
            close = base + i * 0.5 + (0.3 if i % 3 != 2 else -0.1)
            open_ = close - 0.3 if i % 3 != 2 else close + 0.2
            high = max(open_, close) + 0.2
            low = min(open_, close) - 0.1
            vol = 500000 + (100000 if i % 3 != 2 else -50000)
            pct = ((close - (data[-1]["close"] if data else base)) /
                   (data[-1]["close"] if data else base) * 100) if data else 0
            data.append({
                "date": d, "open": open_, "high": high, "low": low,
                "close": close, "volume": vol, "amount": vol * close,
                "pct_chg": round(pct, 2), "volume_ratio": 1.2 if i % 3 != 2 else 0.8,
            })
        df = pd.DataFrame(data)
        df["ma5"] = df["close"].rolling(5).mean()
        df["ma10"] = df["close"].rolling(10).mean()
        df["ma20"] = df["close"].rolling(20).mean()
        return df.dropna().reset_index(drop=True)

    def _make_bearish_df(self) -> pd.DataFrame:
        dates = pd.date_range("2026-02-10", periods=40, freq="B")
        base = 40.0
        data = []
        for i, d in enumerate(dates):
            close = base - i * 0.4 + (-0.2 if i % 3 != 2 else 0.1)
            open_ = close + 0.3 if i % 3 != 2 else close - 0.1
            high = max(open_, close) + 0.1
            low = min(open_, close) - 0.2
            vol = 300000 - (20000 if i % 3 != 2 else -10000)
            pct = ((close - (data[-1]["close"] if data else base)) /
                   (data[-1]["close"] if data else base) * 100) if data else 0
            data.append({
                "date": d, "open": open_, "high": high, "low": low,
                "close": close, "volume": max(vol, 50000), "amount": max(vol, 50000) * close,
                "pct_chg": round(pct, 2), "volume_ratio": 0.7,
            })
        df = pd.DataFrame(data)
        df["ma5"] = df["close"].rolling(5).mean()
        df["ma10"] = df["close"].rolling(10).mean()
        df["ma20"] = df["close"].rolling(20).mean()
        return df.dropna().reset_index(drop=True)

    def test_bullish_scores_above_60(self):
        df = self._make_bullish_df()
        result = StockScreener.score_five_dimensions(df)
        assert result["total"] >= 60

    def test_bearish_scores_below_50(self):
        df = self._make_bearish_df()
        result = StockScreener.score_five_dimensions(df)
        assert result["total"] < 50

    def test_score_has_all_dimensions(self):
        df = self._make_bullish_df()
        result = StockScreener.score_five_dimensions(df)
        bd = result["breakdown"]
        assert "trend" in bd
        assert "volume" in bd
        assert "kline" in bd
        assert "space" in bd
        assert "momentum" in bd
        assert "divergence" in bd
        assert result["total"] == max(0,
            bd["trend"] + bd["volume"] + bd["kline"] +
            bd["space"] + bd["momentum"] + bd["divergence"]
        )

    def test_score_with_realtime_price(self):
        df = self._make_bullish_df()
        last_close = float(df.iloc[-1]["close"])
        higher_price = last_close * 1.05
        result = StockScreener.score_five_dimensions(df, realtime_price=higher_price)
        assert result["price_used"] == higher_price

    def test_empty_df_returns_zero(self):
        df = pd.DataFrame()
        result = StockScreener.score_five_dimensions(df)
        assert result["total"] == 0


class TestPortfolioConcentration:

    def test_detect_sector_concentration(self):
        holdings = [
            {"code": "002236", "name": "大华股份", "boards": ["安防"]},
            {"code": "002415", "name": "海康威视", "boards": ["安防"]},
            {"code": "603659", "name": "璞泰来", "boards": ["锂电池"]},
        ]
        result = StockScreener.check_sector_concentration(holdings)
        assert "安防" in result["concentrated_sectors"]
        assert result["concentrated_sectors"]["安防"]["count"] == 2
        assert result["max_sector_pct"] > 50

    def test_no_concentration(self):
        holdings = [
            {"code": "000001", "name": "A", "boards": ["银行"]},
            {"code": "000002", "name": "B", "boards": ["地产"]},
            {"code": "000003", "name": "C", "boards": ["医药"]},
        ]
        result = StockScreener.check_sector_concentration(holdings)
        assert len(result["concentrated_sectors"]) == 0

    def test_empty_holdings(self):
        result = StockScreener.check_sector_concentration([])
        assert result["max_sector_pct"] == 0


class TestSupplementaryScore:

    def test_returns_correct_structure(self):
        screener = StockScreener()
        result = screener.get_supplementary_score("601398")
        assert "dragon_tiger" in result
        assert "total_bonus" in result
        assert "notes" in result
        assert isinstance(result["notes"], list)


@pytest.mark.network
class TestScreenPipeline:
    """完整选股流水线集成测试"""

    def test_screen_from_sector(self):
        from data_provider.base import DataFetcherManager
        manager = DataFetcherManager()
        screener = StockScreener(manager)
        results = screener.screen_from_sector(
            board_name="锂电池",
            top_n=5,
            min_score=0,
        )
        assert isinstance(results, list)
        if len(results) > 0:
            item = results[0]
            assert "code" in item
            assert "name" in item
            assert "score" in item
            assert "breakdown" in item
            if len(results) > 1:
                assert results[0]["score"] >= results[1]["score"]
