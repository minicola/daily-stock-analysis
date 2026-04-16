# 股票筛选与评分优化 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现板块成分股自动获取、程序化五维评分、前置过滤层，消除人工猜代码和手动打分的痛点。

**Architecture:** 在 `data_provider/base.py` 新增板块成分股获取方法，在 `src/services/stock_screener.py` 新建选股服务（集成前置过滤+五维评分自动化），更新技能文件引用新能力。

**Tech Stack:** Python 3.9+, akshare, efinance, pandas, 现有 DataFetcherManager 框架

---

## Task 1: 板块成分股获取 — DataFetcherManager 扩展

**Files:**
- Modify: `data_provider/akshare_fetcher.py` — 新增 `get_board_constituents()` 方法
- Modify: `data_provider/base.py` — 新增 `get_sector_constituents()` 公共方法
- Test: `tests/test_sector_constituents.py`

### Step 1: Write the failing test

```python
# tests/test_sector_constituents.py
"""板块成分股获取测试"""
import pytest
from data_provider.base import DataFetcherManager


@pytest.mark.network
class TestSectorConstituents:
    """需要网络的集成测试"""

    def setup_method(self):
        self.manager = DataFetcherManager()

    def test_get_sector_constituents_returns_list(self):
        """获取概念板块成分股应返回非空列表"""
        result = self.manager.get_sector_constituents("锂电池")
        assert isinstance(result, list)
        assert len(result) > 0

    def test_constituent_has_required_fields(self):
        """每条成分股记录必须包含 code 和 name 字段"""
        result = self.manager.get_sector_constituents("锂电池")
        if len(result) > 0:
            item = result[0]
            assert "code" in item
            assert "name" in item
            assert len(item["code"]) == 6

    def test_industry_board(self):
        """获取行业板块成分股"""
        result = self.manager.get_sector_constituents("电池", board_type="industry")
        assert isinstance(result, list)

    def test_unknown_board_returns_empty(self):
        """不存在的板块返回空列表"""
        result = self.manager.get_sector_constituents("这个板块不存在XYZ")
        assert result == []
```

### Step 2: Run test to verify it fails

```bash
python -m pytest tests/test_sector_constituents.py -v -m network
```
Expected: FAIL — `DataFetcherManager` 没有 `get_sector_constituents` 方法

### Step 3: Implement akshare_fetcher.get_board_constituents

在 `data_provider/akshare_fetcher.py` 类中新增方法（找到类定义末尾添加）：

```python
def get_board_constituents(self, board_name: str, board_type: str = "concept") -> Optional[pd.DataFrame]:
    """
    获取板块成分股列表

    Args:
        board_name: 板块名称关键词，如 "锂电池"、"电池"
        board_type: "concept" 概念板块 | "industry" 行业板块

    Returns:
        DataFrame with columns: [代码, 名称, 涨跌幅, ...] or None
    """
    import akshare as ak
    import time

    try:
        if board_type == "industry":
            # 行业板块
            time.sleep(0.3)
            df = ak.stock_board_industry_cons_em(symbol=board_name)
        else:
            # 概念板块: 先模糊匹配板块名称，再获取成分股
            time.sleep(0.3)
            board_list = ak.stock_board_concept_name_em()
            if board_list is None or board_list.empty:
                return None
            # 模糊匹配
            matched = board_list[board_list['板块名称'].str.contains(board_name, na=False)]
            if matched.empty:
                return None
            exact_name = matched.iloc[0]['板块名称']
            time.sleep(0.3)
            df = ak.stock_board_concept_cons_em(symbol=exact_name)

        if df is not None and not df.empty:
            return df
        return None
    except Exception as e:
        logger.warning(f"[Akshare] 获取板块成分股失败 ({board_name}): {e}")
        return None
```

### Step 4: Implement DataFetcherManager.get_sector_constituents

在 `data_provider/base.py` 的 `DataFetcherManager` 类中，找到 `get_belong_boards` 方法之后添加：

```python
def get_sector_constituents(self, board_name: str, board_type: str = "concept") -> List[Dict[str, Any]]:
    """
    获取板块成分股列表（标准化输出）

    Args:
        board_name: 板块名称关键词，如 "锂电池"、"新能源车"
        board_type: "concept" 概念板块 | "industry" 行业板块

    Returns:
        List[Dict] with keys: code, name, change_pct, price, ...
    """
    for fetcher in self._fetchers:
        if not hasattr(fetcher, "get_board_constituents"):
            continue
        try:
            raw_df = fetcher.get_board_constituents(board_name, board_type)
            if raw_df is not None and not raw_df.empty:
                results = []
                for _, row in raw_df.iterrows():
                    code = str(row.get('代码', row.get('股票代码', ''))).strip()
                    name = str(row.get('名称', row.get('股票名称', ''))).strip()
                    if code and len(code) == 6:
                        results.append({
                            'code': code,
                            'name': name,
                            'change_pct': float(row.get('涨跌幅', 0) or 0),
                            'price': float(row.get('最新价', 0) or 0),
                            'amount': float(row.get('成交额', 0) or 0),
                        })
                return results
        except Exception as e:
            logger.warning(f"get_sector_constituents failed via {fetcher.__class__.__name__}: {e}")
            continue
    return []
```

### Step 5: Run tests

```bash
python -m pytest tests/test_sector_constituents.py -v -m network
```
Expected: PASS

### Step 6: Commit

```bash
git add data_provider/akshare_fetcher.py data_provider/base.py tests/test_sector_constituents.py
git commit -m "feat: add sector constituent stock retrieval to DataFetcherManager"
```

---

## Task 2: 前置过滤函数 — 利用现有数据字段

**Files:**
- Create: `src/services/stock_screener.py`
- Test: `tests/test_stock_screener.py`

### Step 1: Write the failing test

```python
# tests/test_stock_screener.py
"""股票筛选服务测试"""
import pytest
from src.services.stock_screener import StockScreener


class TestPreFilter:
    """前置过滤测试 — 不需要网络"""

    def test_exclude_gem(self):
        """排除创业板 300/301"""
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
        """排除ST股票"""
        candidates = [
            {"code": "000001", "name": "*ST某某"},
            {"code": "600036", "name": "招商银行"},
        ]
        result = StockScreener.pre_filter(candidates)
        codes = [r["code"] for r in result]
        assert "000001" not in codes
        assert "600036" in codes

    def test_exclude_star_market(self):
        """排除科创板 688"""
        candidates = [
            {"code": "688001", "name": "某科创股"},
            {"code": "600438", "name": "通威股份"},
        ]
        result = StockScreener.pre_filter(candidates)
        codes = [r["code"] for r in result]
        assert "688001" not in codes
        assert "600438" in codes

    def test_exclude_by_market_cap(self):
        """排除市值过小的股票"""
        candidates = [
            {"code": "000001", "name": "A", "total_mv": 3_000_000_000},   # 30亿，过小
            {"code": "000002", "name": "B", "total_mv": 80_000_000_000},  # 800亿，OK
        ]
        result = StockScreener.pre_filter(candidates, min_market_cap=50e8)
        codes = [r["code"] for r in result]
        assert "000001" not in codes
        assert "000002" in codes

    def test_exclude_negative_pe(self):
        """排除亏损股（PE<0）"""
        candidates = [
            {"code": "000001", "name": "A", "pe_ratio": -15.0},
            {"code": "000002", "name": "B", "pe_ratio": 25.0},
        ]
        result = StockScreener.pre_filter(candidates, exclude_negative_pe=True)
        codes = [r["code"] for r in result]
        assert "000001" not in codes
        assert "000002" in codes

    def test_no_filter_when_field_missing(self):
        """字段缺失时不过滤（宽容策略）"""
        candidates = [
            {"code": "000001", "name": "A"},  # 无 total_mv
        ]
        result = StockScreener.pre_filter(candidates, min_market_cap=50e8)
        assert len(result) == 1  # 不排除，因为数据不足以判断
```

### Step 2: Run test to verify it fails

```bash
python -m pytest tests/test_stock_screener.py::TestPreFilter -v
```
Expected: FAIL — `src.services.stock_screener` 模块不存在

### Step 3: Implement StockScreener.pre_filter

```python
# src/services/stock_screener.py
"""
股票筛选服务 — 前置过滤 + 五维自动评分

集成到 market-recommendation 和 portfolio-management 技能中使用。
"""
from typing import List, Dict, Any, Optional
from data_provider.base import is_st_stock, is_kc_cy_stock


class StockScreener:
    """股票筛选与评分服务"""

    @staticmethod
    def pre_filter(
        candidates: List[Dict[str, Any]],
        min_market_cap: Optional[float] = None,
        exclude_negative_pe: bool = False,
        max_pe: Optional[float] = None,
        min_turnover_rate: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        """
        前置过滤：硬性排除不符合条件的股票

        Args:
            candidates: 候选股列表，每项至少含 code, name
            min_market_cap: 最小总市值（元），如 50e8 = 50亿
            exclude_negative_pe: 是否排除 PE<0 的亏损股
            max_pe: 最大PE倍数，超过则排除
            min_turnover_rate: 最小换手率(%)，低于则排除

        Returns:
            过滤后的候选股列表
        """
        results = []
        for stock in candidates:
            code = str(stock.get("code", ""))
            name = str(stock.get("name", ""))

            # 硬排除：创业板(300/301) + 科创板(688) + ST
            if is_kc_cy_stock(code):
                continue
            if is_st_stock(name):
                continue

            # 可选过滤：市值（字段缺失时不排除）
            if min_market_cap is not None:
                mv = stock.get("total_mv")
                if mv is not None and float(mv) < min_market_cap:
                    continue

            # 可选过滤：PE
            pe = stock.get("pe_ratio")
            if exclude_negative_pe and pe is not None and float(pe) < 0:
                continue
            if max_pe is not None and pe is not None and float(pe) > max_pe:
                continue

            # 可选过滤：换手率
            tr = stock.get("turnover_rate")
            if min_turnover_rate is not None and tr is not None and float(tr) < min_turnover_rate:
                continue

            results.append(stock)
        return results
```

### Step 4: Run tests

```bash
python -m pytest tests/test_stock_screener.py::TestPreFilter -v
```
Expected: PASS

### Step 5: Commit

```bash
git add src/services/stock_screener.py tests/test_stock_screener.py
git commit -m "feat: add StockScreener with pre_filter for candidate exclusion"
```

---

## Task 3: 五维自动评分函数

**Files:**
- Modify: `src/services/stock_screener.py` — 新增 `score_five_dimensions()` 方法
- Modify: `tests/test_stock_screener.py` — 新增评分测试

### Step 1: Write the failing test

在 `tests/test_stock_screener.py` 末尾新增：

```python
import pandas as pd
import numpy as np


class TestFiveDimensionScore:
    """五维评分自动化测试"""

    def _make_bullish_df(self) -> pd.DataFrame:
        """构造一个多头上涨趋势的30日K线DataFrame"""
        dates = pd.date_range("2026-03-10", periods=20, freq="B")
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
        """构造一个空头下跌趋势的K线DataFrame"""
        dates = pd.date_range("2026-03-10", periods=20, freq="B")
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
        """多头趋势评分应≥60"""
        df = self._make_bullish_df()
        result = StockScreener.score_five_dimensions(df)
        assert result["total"] >= 60
        assert "breakdown" in result
        assert "trend" in result["breakdown"]

    def test_bearish_scores_below_50(self):
        """空头趋势评分应<50"""
        df = self._make_bearish_df()
        result = StockScreener.score_five_dimensions(df)
        assert result["total"] < 50

    def test_score_has_all_dimensions(self):
        """评分结果必须包含五个维度"""
        df = self._make_bullish_df()
        result = StockScreener.score_five_dimensions(df)
        bd = result["breakdown"]
        assert "trend" in bd       # 趋势强度 /30
        assert "volume" in bd      # 量价配合 /25
        assert "kline" in bd       # K线形态 /20
        assert "space" in bd       # 乖离空间 /15
        assert "momentum" in bd    # 动量 /10
        assert "divergence" in bd  # 背离扣分
        assert result["total"] == (
            bd["trend"] + bd["volume"] + bd["kline"] +
            bd["space"] + bd["momentum"] + bd["divergence"]
        )

    def test_score_with_realtime_price(self):
        """传入实时价格时，应使用实时价格而非K线最后收盘价"""
        df = self._make_bullish_df()
        last_close = df.iloc[-1]["close"]
        higher_price = last_close * 1.05
        result = StockScreener.score_five_dimensions(df, realtime_price=higher_price)
        assert result["price_used"] == higher_price

    def test_empty_df_returns_zero(self):
        """空DataFrame返回0分"""
        df = pd.DataFrame()
        result = StockScreener.score_five_dimensions(df)
        assert result["total"] == 0
```

### Step 2: Run test to verify it fails

```bash
python -m pytest tests/test_stock_screener.py::TestFiveDimensionScore -v
```
Expected: FAIL — `StockScreener` 没有 `score_five_dimensions` 方法

### Step 3: Implement score_five_dimensions

在 `src/services/stock_screener.py` 的 `StockScreener` 类中新增：

```python
    @staticmethod
    def score_five_dimensions(
        df: "pd.DataFrame",
        realtime_price: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        五维自动评分（满分100）

        Args:
            df: 30日日K线 DataFrame，需含 date/open/high/low/close/volume/amount/
                pct_chg/ma5/ma10/ma20/volume_ratio
            realtime_price: 可选的实时价格（优先于K线最后收盘价）

        Returns:
            {
                "total": int,
                "price_used": float,
                "breakdown": {"trend": int, "volume": int, "kline": int,
                              "space": int, "momentum": int, "divergence": int},
                "details": {各项评分说明}
            }
        """
        import pandas as pd

        empty_result = {
            "total": 0, "price_used": 0,
            "breakdown": {"trend": 0, "volume": 0, "kline": 0,
                          "space": 0, "momentum": 0, "divergence": 0},
            "details": {}
        }
        if df is None or df.empty or len(df) < 5:
            return empty_result

        last = df.iloc[-1]
        price = realtime_price if realtime_price else float(last["close"])
        ma5 = float(last.get("ma5", 0) or 0)
        ma10 = float(last.get("ma10", 0) or 0)
        ma20 = float(last.get("ma20", 0) or 0)

        details = {}

        # ========== A. 趋势强度 (30分) ==========
        trend_score = 0

        # A1: MA排列 (12分)
        if ma5 > ma10 > ma20 and price > ma5:
            a1 = 12; details["ma_arrange"] = "完美多头"
        elif ma5 > ma10 and price > ma20:
            a1 = 7; details["ma_arrange"] = "部分多头"
        elif abs(ma5 - ma10) / max(ma10, 0.01) < 0.02:
            a1 = 4; details["ma_arrange"] = "粘合"
        else:
            a1 = 0; details["ma_arrange"] = "空头/无序"
        trend_score += a1

        # A2: 均线方向 (10分) — 比较最近3日MA斜率
        if len(df) >= 3:
            ma5_slope = float(df.iloc[-1].get("ma5", 0) or 0) - float(df.iloc[-3].get("ma5", 0) or 0)
            ma10_slope = float(df.iloc[-1].get("ma10", 0) or 0) - float(df.iloc[-3].get("ma10", 0) or 0)
            if ma5_slope > 0 and ma10_slope > 0:
                a2 = 10; details["ma_direction"] = "均上行"
            elif ma5_slope > 0:
                a2 = 6; details["ma_direction"] = "仅MA5上行"
            else:
                a2 = 0; details["ma_direction"] = "均下行或持平"
        else:
            a2 = 0; details["ma_direction"] = "数据不足"
        trend_score += a2

        # A3: 价格vs均线 (8分)
        if price > ma5 > ma10 > ma20 and ma20 > 0:
            a3 = 8
        elif price > ma20 > 0:
            a3 = 5
        else:
            a3 = 0
        trend_score += a3

        # ========== B. 量价配合 (25分) ==========
        volume_score = 0
        recent5 = df.tail(5)

        # B1: 近5日量价关系 (12分)
        up_vol = recent5[recent5["pct_chg"] > 0]["volume"].mean() if len(recent5[recent5["pct_chg"] > 0]) > 0 else 0
        dn_vol = recent5[recent5["pct_chg"] <= 0]["volume"].mean() if len(recent5[recent5["pct_chg"] <= 0]) > 0 else 0
        if up_vol > 0 and dn_vol > 0:
            if up_vol > dn_vol * 1.2:
                b1 = 12; details["vol_price"] = "上涨放量+下跌缩量"
            elif up_vol > dn_vol:
                b1 = 6; details["vol_price"] = "上涨放量但下跌也放量"
            else:
                b1 = 2; details["vol_price"] = "上涨缩量"
        else:
            b1 = 6; details["vol_price"] = "数据不足取中值"
        volume_score += b1

        # B2: 成交额趋势 (8分)
        if len(df) >= 20:
            avg5 = recent5["volume"].mean()
            avg20 = df.tail(20)["volume"].mean()
            if avg5 > avg20 * 1.1:
                b2 = 8 if recent5["volume"].is_monotonic_increasing else 6
                details["vol_trend"] = "近5日放量"
            elif avg5 > avg20 * 0.9:
                b2 = 4; details["vol_trend"] = "持平"
            else:
                b2 = 0; details["vol_trend"] = "萎缩"
        else:
            b2 = 4; details["vol_trend"] = "数据不足取中值"
        volume_score += b2

        # B3: 量比 (5分)
        vr = float(last.get("volume_ratio", 0) or 0)
        if vr > 1.5:
            b3 = 5
        elif vr >= 1.0:
            b3 = 3
        else:
            b3 = 0
        volume_score += b3
        details["volume_ratio"] = round(vr, 2)

        # ========== C. K线形态 (20分) ==========
        kline_score = 0
        recent3 = df.tail(3)

        # C1: 近3日K线 (10分)
        yang_count = sum(1 for _, r in recent3.iterrows() if float(r["close"]) > float(r["open"]))
        if yang_count == 3:
            c1 = 10; details["kline_pattern"] = "连续阳线"
        elif yang_count >= 2:
            c1 = 6; details["kline_pattern"] = "2阳1阴"
        elif yang_count == 1:
            # 检查长下影线
            last_r = recent3.iloc[-1]
            body = abs(float(last_r["close"]) - float(last_r["open"]))
            lower_shadow = min(float(last_r["close"]), float(last_r["open"])) - float(last_r["low"])
            if lower_shadow > body * 2:
                c1 = 4; details["kline_pattern"] = "长下影线"
            else:
                c1 = 2; details["kline_pattern"] = "偏弱"
        else:
            c1 = 0; details["kline_pattern"] = "连续阴线"
        kline_score += c1

        # C2: 实体大小 (5分)
        recent_yang = recent3[recent3["close"] > recent3["open"]]
        if len(recent_yang) > 0:
            avg_body = ((recent_yang["close"] - recent_yang["open"]) / recent_yang["open"]).mean() * 100
            if avg_body > 2:
                c2 = 5
            elif avg_body > 1:
                c2 = 3
            else:
                c2 = 1
        else:
            c2 = 0
        kline_score += c2

        # C3: 振幅趋势 (5分)
        if len(df) >= 6:
            amp_prev = ((df.iloc[-6:-3]["high"] - df.iloc[-6:-3]["low"]) / df.iloc[-6:-3]["low"]).mean()
            amp_curr = ((recent3["high"] - recent3["low"]) / recent3["low"]).mean()
            if amp_prev > 0 and amp_curr > amp_prev * 1.3 and amp_prev < 0.03:
                c3 = 5; details["amplitude_trend"] = "收窄后放大(突破)"
            elif amp_curr < amp_prev * 1.5:
                c3 = 3; details["amplitude_trend"] = "正常"
            else:
                c3 = 0; details["amplitude_trend"] = "持续放大(风险)"
        else:
            c3 = 3
        kline_score += c3

        # ========== D. 乖离与空间 (15分) ==========
        space_score = 0

        # D1: 10日乖离率 (5分)
        if ma10 > 0:
            bias10 = (price - ma10) / ma10 * 100
            if bias10 > 20:
                d1 = -3
            elif bias10 > 15:
                d1 = 0
            elif bias10 > 8:
                d1 = 3
            else:
                d1 = 5
            details["bias10"] = round(bias10, 2)
        else:
            d1 = 0; details["bias10"] = 0
        space_score += d1

        # D2: 距30日低点 (5分)
        low30 = float(df["low"].min())
        if low30 > 0:
            dist_low = (price - low30) / low30 * 100
            if dist_low > 30:
                d2 = 0
            elif dist_low > 15:
                d2 = 3
            else:
                d2 = 5
            details["dist_low30"] = round(dist_low, 2)
        else:
            d2 = 0
        space_score += d2

        # D3: 距30日高点 (5分)
        high30 = float(df["high"].max())
        if high30 > 0:
            dist_high = (high30 - price) / high30 * 100
            if dist_high < 5:
                d3 = 5
            elif dist_high < 15:
                d3 = 3
            else:
                d3 = 0
            details["dist_high30"] = round(dist_high, 2)
        else:
            d3 = 0
        space_score += d3

        # ========== E. 动量 (10分) ==========
        momentum_score = 0

        # E1: 近5日涨幅 (5分)
        if len(df) >= 6:
            price_5ago = float(df.iloc[-6]["close"])
            chg5 = (price - price_5ago) / price_5ago * 100 if price_5ago > 0 else 0
            if 3 <= chg5 <= 10:
                e1 = 5
            elif 10 < chg5 <= 20:
                e1 = 3
            elif chg5 > 20:
                e1 = 0
            elif chg5 < 0:
                e1 = 2
            else:
                e1 = 3  # 0-3%
            details["chg5d"] = round(chg5, 2)
        else:
            e1 = 0
        momentum_score += e1

        # E2: 近10日涨跌天数 (5分)
        recent10 = df.tail(10)
        up_days = int((recent10["pct_chg"] > 0).sum())
        if up_days >= 6:
            e2 = 5
        elif up_days == 5:
            e2 = 3
        else:
            e2 = 0
        momentum_score += e2
        details["up_days_10"] = up_days

        # ========== 背离检测 (扣分项) ==========
        divergence_penalty = 0

        # 量价背离: 近3日价格创新高但成交量递减>15%
        if len(df) >= 4:
            h3 = recent3["high"].max()
            prev_h = float(df.iloc[-4]["high"])
            v_latest = float(recent3.iloc[-1]["volume"])
            v_prev = float(recent3.iloc[0]["volume"])
            if h3 > prev_h and v_prev > 0 and (v_prev - v_latest) / v_prev > 0.15:
                divergence_penalty -= 8
                details["divergence_vol_price"] = True

        # 冲高回落: 近3日最高价创新高但收盘<开盘
        for _, r in recent3.iterrows():
            if (float(r["high"]) >= high30 * 0.99 and
                    float(r["close"]) < float(r["open"])):
                divergence_penalty = min(divergence_penalty, divergence_penalty)
                divergence_penalty -= 5
                details["divergence_pullback"] = True
                break

        # 均线死叉: MA5下穿MA10
        if len(df) >= 2:
            prev_ma5 = float(df.iloc[-2].get("ma5", 0) or 0)
            prev_ma10 = float(df.iloc[-2].get("ma10", 0) or 0)
            if prev_ma5 >= prev_ma10 and ma5 < ma10:
                divergence_penalty -= 5
                details["divergence_death_cross"] = True

        # ========== 汇总 ==========
        total = trend_score + volume_score + kline_score + space_score + momentum_score + divergence_penalty
        total = max(total, 0)

        return {
            "total": total,
            "price_used": price,
            "breakdown": {
                "trend": trend_score,
                "volume": volume_score,
                "kline": kline_score,
                "space": space_score,
                "momentum": momentum_score,
                "divergence": divergence_penalty,
            },
            "details": details,
        }
```

### Step 4: Run tests

```bash
python -m pytest tests/test_stock_screener.py -v
```
Expected: ALL PASS

### Step 5: Commit

```bash
git add src/services/stock_screener.py tests/test_stock_screener.py
git commit -m "feat: add automated five-dimension scoring to StockScreener"
```

---

## Task 4: 完整选股流水线 — 串联板块获取+过滤+评分

**Files:**
- Modify: `src/services/stock_screener.py` — 新增 `screen_from_sector()` 流水线方法
- Modify: `tests/test_stock_screener.py` — 新增集成测试

### Step 1: Write the failing test

在 `tests/test_stock_screener.py` 末尾新增：

```python
@pytest.mark.network
class TestScreenPipeline:
    """完整选股流水线集成测试"""

    def test_screen_from_sector(self):
        """从板块筛选→过滤→评分→排序 全流程"""
        from data_provider.base import DataFetcherManager
        manager = DataFetcherManager()
        screener = StockScreener(manager)

        results = screener.screen_from_sector(
            board_name="锂电池",
            top_n=5,
            min_score=0,  # 不限分数，测试流程完整性
        )
        assert isinstance(results, list)
        # 每条结果应含 code, name, score
        if len(results) > 0:
            item = results[0]
            assert "code" in item
            assert "name" in item
            assert "score" in item
            assert "breakdown" in item
            # 应按 score 降序排列
            if len(results) > 1:
                assert results[0]["score"] >= results[1]["score"]
```

### Step 2: Run test to verify it fails

```bash
python -m pytest tests/test_stock_screener.py::TestScreenPipeline -v -m network
```

### Step 3: Implement screen_from_sector

在 `src/services/stock_screener.py` 中为 `StockScreener` 增加实例方法（需要 `__init__` 接收 manager）：

```python
    def __init__(self, manager=None):
        """
        Args:
            manager: DataFetcherManager 实例（流水线方法需要）
        """
        self.manager = manager

    def screen_from_sector(
        self,
        board_name: str,
        board_type: str = "concept",
        top_n: int = 10,
        min_score: int = 60,
        min_market_cap: Optional[float] = 50e8,
        exclude_negative_pe: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        完整选股流水线：板块成分股获取 → 前置过滤 → 行情增强 → 五维评分 → 排序

        Args:
            board_name: 板块名称关键词
            board_type: "concept" | "industry"
            top_n: 评分后返回前N只
            min_score: 最低评分阈值
            min_market_cap: 最小市值(元)
            exclude_negative_pe: 排除亏损股

        Returns:
            按评分降序排列的股票列表，每项含 code/name/price/score/breakdown/details
        """
        if not self.manager:
            raise ValueError("screen_from_sector requires a DataFetcherManager instance")

        # Step 1: 获取板块成分股
        constituents = self.manager.get_sector_constituents(board_name, board_type)
        if not constituents:
            return []

        # Step 2: 用实时行情增强字段（PE/市值/换手率）
        codes = [c["code"] for c in constituents]
        self.manager.prefetch_realtime_quotes(codes[:50])  # 限制50只避免过载

        enriched = []
        for stock in constituents[:50]:
            quote = self.manager.get_realtime_quote(stock["code"])
            if quote and quote.price and quote.price > 0:
                stock["price"] = quote.price
                stock["change_pct"] = quote.change_pct
                stock["pe_ratio"] = quote.pe_ratio
                stock["total_mv"] = quote.total_mv
                stock["turnover_rate"] = quote.turnover_rate
                stock["volume_ratio"] = quote.volume_ratio
                enriched.append(stock)

        # Step 3: 前置过滤
        filtered = self.pre_filter(
            enriched,
            min_market_cap=min_market_cap,
            exclude_negative_pe=exclude_negative_pe,
        )

        # Step 4: 按当日涨幅排序，取前 top_n*2 只进入评分（减少K线请求）
        filtered.sort(key=lambda x: float(x.get("change_pct", 0) or 0), reverse=True)
        candidates = filtered[:top_n * 2]

        # Step 5: 获取K线 + 五维评分
        scored = []
        for stock in candidates:
            try:
                df, _ = self.manager.get_daily_data(stock["code"], days=30)
                if df is not None and len(df) >= 10:
                    result = self.score_five_dimensions(df, realtime_price=stock.get("price"))
                    if result["total"] >= min_score:
                        scored.append({
                            "code": stock["code"],
                            "name": stock["name"],
                            "price": stock.get("price", 0),
                            "change_pct": stock.get("change_pct", 0),
                            "pe_ratio": stock.get("pe_ratio"),
                            "total_mv": stock.get("total_mv"),
                            "score": result["total"],
                            "breakdown": result["breakdown"],
                            "details": result["details"],
                        })
            except Exception:
                continue

        # Step 6: 按评分降序排列
        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:top_n]
```

### Step 4: Run tests

```bash
python -m pytest tests/test_stock_screener.py -v
```
Expected: ALL PASS（网络测试跳过时用 `-m "not network"`）

### Step 5: Commit

```bash
git add src/services/stock_screener.py tests/test_stock_screener.py
git commit -m "feat: add screen_from_sector pipeline combining filter + scoring"
```

---

## Task 5: 更新技能文件 — 引用新能力

**Files:**
- Modify: `.claude/skills/market-recommendation/SKILL.md`
- Modify: `.claude/skills/portfolio-management/SKILL.md`
- Modify: `.claude/skills/data-fetching/SKILL.md`

### Step 1: 更新 data-fetching 技能

在 `.claude/skills/data-fetching/SKILL.md` 中新增板块成分股和选股服务的使用说明：

```markdown
### 板块成分股获取（新增）

\`\`\`python
# 获取概念板块成分股
constituents = manager.get_sector_constituents("锂电池", board_type="concept")
# 获取行业板块成分股
constituents = manager.get_sector_constituents("电池", board_type="industry")
# 返回 List[Dict]: code, name, change_pct, price, amount
\`\`\`

### 程序化选股服务（新增）

\`\`\`python
from src.services.stock_screener import StockScreener

screener = StockScreener(manager)

# 完整流水线：板块获取 → 排除创业板/ST → 市值/PE过滤 → 五维评分 → 排序
results = screener.screen_from_sector(
    board_name="锂电池",
    top_n=5,
    min_score=60,
    min_market_cap=50e8,
)
# 返回按评分降序的 List[Dict]: code, name, price, score, breakdown, details

# 也可单独调用五维评分
from data_provider.base import DataFetcherManager
df, _ = manager.get_daily_data("603659", days=30)
score_result = StockScreener.score_five_dimensions(df, realtime_price=35.72)
# 返回: {"total": 73, "breakdown": {"trend":30, "volume":17, ...}, "details": {...}}
\`\`\`
```

### Step 2: 更新 market-recommendation 技能

在 `.claude/skills/market-recommendation/SKILL.md` 中替换"候选股日K线技术分析"部分的步骤2（收集市场数据）之后，新增自动化选股步骤：

```markdown
### 2.5 自动化候选股筛选（优先使用）

优先使用程序化选股替代手动列举候选股代码：

\`\`\`python
from src.services.stock_screener import StockScreener

screener = StockScreener(manager)

# 从领涨板块自动筛选（按板块排行中的前3个板块分别筛选）
for sector_name in [领涨板块1, 领涨板块2, 领涨板块3]:
    results = screener.screen_from_sector(
        board_name=sector_name,
        top_n=5,
        min_score=60,
    )
    # results 已自动排除创业板/ST/科创板，并完成五维评分
\`\`\`

该流程自动完成：
1. 板块成分股获取
2. 硬排除（创业板/ST/科创板）
3. 前置过滤（市值>50亿、排除亏损股）
4. 实时行情增强（PE/市值/换手率）
5. 30日K线获取 + 五维自动评分
6. 按评分降序排列

**降级策略**：若板块成分股API不可用（网络限流），降级为手动列举候选股代码。
```

### Step 3: 更新 portfolio-management 技能

在 `.claude/skills/portfolio-management/SKILL.md` "逐只分析"部分，引用自动评分：

```markdown
**技术面自动评分**：
\`\`\`python
from src.services.stock_screener import StockScreener
df, _ = manager.get_daily_data(code, days=30)
score = StockScreener.score_five_dimensions(df, realtime_price=current_price)
# score["total"] 即五维评分, score["breakdown"] 为各维度明细
\`\`\`
```

### Step 4: Commit

```bash
git add .claude/skills/market-recommendation/SKILL.md .claude/skills/portfolio-management/SKILL.md .claude/skills/data-fetching/SKILL.md
git commit -m "docs: update skills to reference StockScreener and auto-scoring"
```

---

## Task 6: 板块集中度检查 (P2)

**Files:**
- Modify: `src/services/stock_screener.py` — 新增 `check_portfolio_concentration()`
- Modify: `tests/test_stock_screener.py` — 新增测试

### Step 1: Write the failing test

```python
class TestPortfolioConcentration:
    """持仓集中度检查测试"""

    def test_detect_sector_concentration(self):
        """检测板块过度集中"""
        holdings = [
            {"code": "002236", "name": "大华股份", "boards": ["安防"]},
            {"code": "002415", "name": "海康威视", "boards": ["安防"]},
            {"code": "603659", "name": "璞泰来", "boards": ["锂电池"]},
        ]
        result = StockScreener.check_sector_concentration(holdings)
        assert "安防" in result["concentrated_sectors"]
        assert result["concentrated_sectors"]["安防"]["count"] == 2
        assert result["max_sector_pct"] > 50  # 安防占2/3 > 50%

    def test_no_concentration(self):
        """无集中度问题"""
        holdings = [
            {"code": "000001", "name": "A", "boards": ["银行"]},
            {"code": "000002", "name": "B", "boards": ["地产"]},
            {"code": "000003", "name": "C", "boards": ["医药"]},
        ]
        result = StockScreener.check_sector_concentration(holdings)
        assert len(result["concentrated_sectors"]) == 0
```

### Step 2: Implement

```python
    @staticmethod
    def check_sector_concentration(
        holdings: List[Dict[str, Any]],
        threshold_pct: float = 40.0,
    ) -> Dict[str, Any]:
        """
        检查持仓板块集中度

        Args:
            holdings: 持仓列表，每项含 code/name/boards(List[str])
            threshold_pct: 单板块占比超过此值(%)则告警

        Returns:
            {"concentrated_sectors": {板块名: {count, pct, stocks}},
             "max_sector_pct": float, "warnings": List[str]}
        """
        total = len(holdings)
        if total == 0:
            return {"concentrated_sectors": {}, "max_sector_pct": 0, "warnings": []}

        sector_map: Dict[str, list] = {}
        for h in holdings:
            for board in h.get("boards", []):
                sector_map.setdefault(board, []).append(h["name"])

        concentrated = {}
        max_pct = 0.0
        warnings = []
        for sector, names in sector_map.items():
            pct = len(names) / total * 100
            max_pct = max(max_pct, pct)
            if pct >= threshold_pct:
                concentrated[sector] = {"count": len(names), "pct": round(pct, 1), "stocks": names}
                warnings.append(f"{sector}板块集中度{pct:.0f}%（{'/'.join(names)}），建议关注分散风险")

        return {"concentrated_sectors": concentrated, "max_sector_pct": round(max_pct, 1), "warnings": warnings}
```

### Step 3: Run & Commit

```bash
python -m pytest tests/test_stock_screener.py::TestPortfolioConcentration -v
git add src/services/stock_screener.py tests/test_stock_screener.py
git commit -m "feat: add portfolio sector concentration check"
```

---

## Task 7: 龙虎榜附加评分 (P2)

**Files:**
- Modify: `src/services/stock_screener.py` — 新增 `get_supplementary_score()`
- Modify: `tests/test_stock_screener.py` — 新增测试

### Step 1: Write the test

```python
@pytest.mark.network
class TestSupplementaryScore:

    def test_dragon_tiger_bonus(self):
        """龙虎榜上榜加分"""
        manager = DataFetcherManager()
        screener = StockScreener(manager)
        # 用一只已知不在龙虎榜的普通股票
        result = screener.get_supplementary_score("601398")  # 工商银行
        assert isinstance(result, dict)
        assert "dragon_tiger" in result
        assert "total_bonus" in result
```

### Step 2: Implement

```python
    def get_supplementary_score(self, code: str) -> Dict[str, Any]:
        """
        附加参考评分（龙虎榜等），不纳入五维主体评分

        Returns:
            {"dragon_tiger": int, "total_bonus": int, "notes": List[str]}
        """
        bonus = 0
        notes = []

        # 龙虎榜
        dt_score = 0
        try:
            dt = self.manager.get_dragon_tiger_context(code)
            if dt and dt.get("status") == "ok":
                data = dt.get("data", {})
                if data.get("is_on_list"):
                    dt_score = 5
                    notes.append(f"近期龙虎榜上榜{data.get('recent_count', 0)}次")
                elif data.get("recent_count", 0) > 0:
                    dt_score = 3
                    notes.append(f"近期有龙虎榜记录")
        except Exception:
            pass

        bonus += dt_score
        return {"dragon_tiger": dt_score, "total_bonus": bonus, "notes": notes}
```

### Step 3: Run & Commit

```bash
python -m pytest tests/test_stock_screener.py::TestSupplementaryScore -v -m network
git add src/services/stock_screener.py tests/test_stock_screener.py
git commit -m "feat: add supplementary scoring with dragon tiger list"
```

---

## Summary

| Task | 内容 | 优先级 | 依赖 |
|------|------|--------|------|
| 1 | 板块成分股获取 | P0 | 无 |
| 2 | 前置过滤函数 | P0 | 无 |
| 3 | 五维自动评分 | P0 | 无 |
| 4 | 完整选股流水线 | P0 | Task 1+2+3 |
| 5 | 更新技能文件 | P1 | Task 4 |
| 6 | 板块集中度检查 | P2 | 无 |
| 7 | 龙虎榜附加评分 | P2 | 无 |

Task 1/2/3 互不依赖，可并行开发。Task 4 依赖前三者完成。Task 5/6/7 可独立执行。
