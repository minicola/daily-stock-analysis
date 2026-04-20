# 市场时段推荐面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Web 前端 HomePage 新增"今日推荐"抽屉，点击后按 Asia/Shanghai 时间展示上午盘/下午盘的 3 只股票推荐，点击时实时生成。

**Architecture:** 纯 Python 服务 `MarketRecommendationService` 复用 `DataFetcherManager` + `StockScreener`，通过 `POST /api/v1/market/recommendations` 暴露；前端 React 抽屉 + `useMarketRecommendation` hook + localStorage 缓存（key 含日期+session，跨日/跨时段自动失效）。

**Tech Stack:** FastAPI + Pydantic + pytest / React 19 + TypeScript + vitest + @testing-library/react + axios

**Spec Reference:** `docs/superpowers/specs/2026-04-20-market-recommendation-panel-design.md`

---

## File Structure

**新建后端文件：**
- `src/schemas/market_recommendation_schema.py` — Pydantic 模型
- `src/services/market_recommendation_service.py` — 推荐生成服务
- `api/v1/endpoints/market_recommendation.py` — FastAPI 路由
- `tests/test_market_recommendation_schema.py`
- `tests/test_market_recommendation_service.py`
- `tests/test_market_recommendation_api.py`

**修改后端文件：**
- `api/v1/router.py` — 注册新 router
- `api/v1/endpoints/__init__.py` — 导出新模块

**新建前端文件：**
- `apps/dsa-web/src/types/recommendation.ts`
- `apps/dsa-web/src/api/recommendation.ts`
- `apps/dsa-web/src/hooks/useMarketRecommendation.ts`
- `apps/dsa-web/src/hooks/__tests__/useMarketRecommendation.test.ts`
- `apps/dsa-web/src/components/recommendation/SessionTabs.tsx`
- `apps/dsa-web/src/components/recommendation/MarketOverviewBlock.tsx`
- `apps/dsa-web/src/components/recommendation/RecommendationCard.tsx`
- `apps/dsa-web/src/components/recommendation/RecommendationDrawer.tsx`
- `apps/dsa-web/src/components/recommendation/index.ts`
- `apps/dsa-web/src/components/recommendation/__tests__/RecommendationDrawer.test.tsx`

**修改前端文件：**
- `apps/dsa-web/src/pages/HomePage.tsx` — 新增按钮 + 抽屉挂载
- `apps/dsa-web/src/hooks/index.ts` — 导出 hook

**文档文件：**
- `docs/CHANGELOG.md` — 追加条目

---

## Task 1: 创建 Schema 及其测试

**Files:**
- Create: `src/schemas/market_recommendation_schema.py`
- Test: `tests/test_market_recommendation_schema.py`

- [ ] **Step 1: Write the failing test**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_market_recommendation_schema.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.schemas.market_recommendation_schema'`

- [ ] **Step 3: Create the Schema file**

```python
# src/schemas/market_recommendation_schema.py
# -*- coding: utf-8 -*-
"""市场时段推荐面板 Schema"""
from __future__ import annotations
from typing import List, Literal

from pydantic import BaseModel, Field

SessionLiteral = Literal["morning", "afternoon"]


class ScoreBreakdown(BaseModel):
    trend: int = Field(..., ge=0, le=30, description="A 趋势强度 0-30")
    volume_price: int = Field(..., ge=0, le=25, description="B 量价配合 0-25")
    kline: int = Field(..., ge=0, le=20, description="C K线形态 0-20")
    space: int = Field(..., ge=0, le=15, description="D 乖离与空间 0-15")
    momentum: int = Field(..., ge=0, le=10, description="E 动量状态 0-10")
    divergence_deduction: int = Field(..., le=0, description="背离扣分 ≤0")
    total: int = Field(..., ge=0, le=100)


class RecommendedStock(BaseModel):
    code: str
    name: str
    price: float
    change_pct: float
    score: int = Field(..., ge=0, le=100)
    score_breakdown: ScoreBreakdown
    trend_summary: str
    operation: Literal["buy", "watch", "hold"]
    quantity: int = Field(..., ge=0)
    cost_estimate: float
    fee_estimate: float
    entry_hint: str
    stop_loss: float
    target: float
    rationale: str


class SectorEntry(BaseModel):
    name: str
    change_pct: float


class MarketOverview(BaseModel):
    sh_index_value: float
    sh_index_change_pct: float
    top_sectors: List[SectorEntry] = Field(default_factory=list)
    up_count: int
    down_count: int
    limit_up_count: int
    limit_down_count: int


class RecommendationResult(BaseModel):
    session: SessionLiteral
    generated_at: str
    overview: MarketOverview
    recommendations: List[RecommendedStock] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    risk_notes: List[str] = Field(default_factory=list)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_market_recommendation_schema.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/schemas/market_recommendation_schema.py tests/test_market_recommendation_schema.py
git commit -m "feat(schemas): add market recommendation pydantic models"
```

---

## Task 2: Service 骨架 + 市场概览构建

**Files:**
- Create: `src/services/market_recommendation_service.py`
- Test: `tests/test_market_recommendation_service.py`

- [ ] **Step 1: Write the failing test**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_market_recommendation_service.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Create the service file with skeleton + overview builder**

```python
# src/services/market_recommendation_service.py
# -*- coding: utf-8 -*-
"""
市场时段推荐服务

职责：
1. 复用 DataFetcherManager 获取市场概览
2. 复用 StockScreener 在领涨板块中筛选候选股
3. 组装为 RecommendationResult 返回给 API 层
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from src.schemas.market_recommendation_schema import (
    MarketOverview,
    RecommendationResult,
    SectorEntry,
    SessionLiteral,
)

logger = logging.getLogger(__name__)

SHANGHAI_TZ = timezone(timedelta(hours=8))


class MarketDataUnavailable(Exception):
    """指数或市场统计接口全部失败时抛出"""


class RecommendationTimeout(Exception):
    """推荐流程整体超时"""


class MarketRecommendationService:
    """按时段生成 A 股推荐"""

    DEFAULT_POSITION_BUDGET = 10000
    STOP_LOSS_RATIO = 0.97
    TARGET_RATIO = 1.05
    MAX_SECTORS = 3
    TOP_N_PER_SECTOR = 5
    MIN_SCORE = 60
    FINAL_PICK_LIMIT = 3

    RISK_NOTES = [
        "总仓位建议不超过 30-40%",
        "技术评分为概率判断，非绝对预测",
        "所有资金计算已含手续费（佣金万2.5+印花税0.05%+过户费0.001%）",
    ]

    def __init__(self, manager, screener):
        self.manager = manager
        self.screener = screener

    def generate(self, session: SessionLiteral) -> RecommendationResult:
        """生成推荐结果。后续 task 补全。"""
        raise NotImplementedError

    def _build_overview(self) -> MarketOverview:
        indices = self.manager.get_main_indices("cn") or []
        sh_entry = next((i for i in indices if "上证" in i.get("name", "")), None)
        if not sh_entry:
            raise MarketDataUnavailable("上证指数数据不可用")

        stats = self.manager.get_market_stats() or {}
        if not stats:
            raise MarketDataUnavailable("市场统计数据不可用")

        top_list, _ = self.manager.get_sector_rankings(5) or ([], [])
        top_sectors = [
            SectorEntry(name=s["name"], change_pct=float(s.get("change_pct", 0)))
            for s in top_list[: self.MAX_SECTORS]
        ]

        return MarketOverview(
            sh_index_value=float(sh_entry.get("current", 0)),
            sh_index_change_pct=float(sh_entry.get("change_pct", 0)),
            top_sectors=top_sectors,
            up_count=int(stats.get("up_count", 0)),
            down_count=int(stats.get("down_count", 0)),
            limit_up_count=int(stats.get("limit_up_count", 0)),
            limit_down_count=int(stats.get("limit_down_count", 0)),
        )

    @staticmethod
    def _now_iso_shanghai() -> str:
        return datetime.now(SHANGHAI_TZ).isoformat(timespec="seconds")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_market_recommendation_service.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/market_recommendation_service.py tests/test_market_recommendation_service.py
git commit -m "feat(services): scaffold MarketRecommendationService with market overview builder"
```

---

## Task 3: Service 板块筛选 + 合并去重

**Files:**
- Modify: `src/services/market_recommendation_service.py`
- Modify: `tests/test_market_recommendation_service.py`

- [ ] **Step 1: Append failing tests**

Add to `tests/test_market_recommendation_service.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_market_recommendation_service.py -v`
Expected: FAIL (3 new tests) — `AttributeError: '_collect_candidates'`

- [ ] **Step 3: Add `_collect_candidates` method to the service**

Append inside `MarketRecommendationService` class in `src/services/market_recommendation_service.py`:

```python
    def _collect_candidates(self, sector_names: List[str]) -> tuple[list, list[str]]:
        """对领涨板块逐个筛选，合并去重按评分降序取前 N。"""
        all_results: list[dict] = []
        warnings: list[str] = []
        for sector in sector_names[: self.MAX_SECTORS]:
            try:
                hits = self.screener.screen_from_sector(
                    board_name=sector,
                    top_n=self.TOP_N_PER_SECTOR,
                    min_score=self.MIN_SCORE,
                ) or []
                all_results.extend(hits)
            except Exception as exc:  # noqa: BLE001
                logger.warning("screen_from_sector failed for %s: %s", sector, exc)
                warnings.append(f"板块「{sector}」筛选失败（{type(exc).__name__}）")

        seen: set[str] = set()
        unique: list[dict] = []
        for entry in sorted(all_results, key=lambda x: x.get("score", 0), reverse=True):
            code = entry.get("code")
            if code and code not in seen:
                seen.add(code)
                unique.append(entry)
        return unique[: self.FINAL_PICK_LIMIT], warnings
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_market_recommendation_service.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/market_recommendation_service.py tests/test_market_recommendation_service.py
git commit -m "feat(services): collect/dedupe candidates across top sectors"
```

---

## Task 4: Service 操作建议计算 + 拼装结果

**Files:**
- Modify: `src/services/market_recommendation_service.py`
- Modify: `tests/test_market_recommendation_service.py`

- [ ] **Step 1: Append failing tests**

Add to `tests/test_market_recommendation_service.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_market_recommendation_service.py -v`
Expected: FAIL — `AttributeError: '_build_recommendation'` and `NotImplementedError` in generate

- [ ] **Step 3: Implement `_build_recommendation` and `generate`**

Replace `generate` stub and append helpers in `src/services/market_recommendation_service.py`:

```python
    def generate(self, session: SessionLiteral) -> RecommendationResult:
        if session not in ("morning", "afternoon"):
            raise ValueError(f"invalid session: {session}")

        overview = self._build_overview()
        sector_names = [s.name for s in overview.top_sectors]
        candidates, warnings = self._collect_candidates(sector_names)

        recommendations = [self._build_recommendation(c) for c in candidates]
        if len(recommendations) < self.FINAL_PICK_LIMIT:
            warnings.append(
                f"候选不足 {self.FINAL_PICK_LIMIT} 只（实际 {len(recommendations)} 只）"
            )

        return RecommendationResult(
            session=session,
            generated_at=self._now_iso_shanghai(),
            overview=overview,
            recommendations=recommendations,
            warnings=warnings,
            risk_notes=list(self.RISK_NOTES),
        )

    def _build_recommendation(self, entry: dict):
        from src.schemas.market_recommendation_schema import (
            RecommendedStock,
            ScoreBreakdown,
        )

        price = float(entry.get("price") or 0)
        change_pct = float(entry.get("change_pct") or 0)
        score = int(entry.get("score", 0))
        breakdown_raw = entry.get("breakdown") or {}
        score_breakdown = ScoreBreakdown(
            trend=int(breakdown_raw.get("trend", 0)),
            volume_price=int(breakdown_raw.get("volume_price", 0)),
            kline=int(breakdown_raw.get("kline", 0)),
            space=int(breakdown_raw.get("space", 0)),
            momentum=int(breakdown_raw.get("momentum", 0)),
            divergence_deduction=int(breakdown_raw.get("divergence_deduction", 0)),
            total=score,
        )

        quantity = self._calc_quantity(price)
        fee = self._calc_buy_fee(price, quantity)
        cost = price * quantity + fee

        operation = "watch" if change_pct > 7.0 else "buy"

        trend_summary = self._format_trend_summary(score_breakdown)
        entry_hint = self._format_entry_hint(operation, change_pct)
        rationale = self._format_rationale(entry, score)

        return RecommendedStock(
            code=str(entry.get("code", "")),
            name=str(entry.get("name", "")),
            price=price,
            change_pct=change_pct,
            score=score,
            score_breakdown=score_breakdown,
            trend_summary=trend_summary,
            operation=operation,
            quantity=quantity,
            cost_estimate=round(cost, 2),
            fee_estimate=round(fee, 2),
            entry_hint=entry_hint,
            stop_loss=round(price * self.STOP_LOSS_RATIO, 2),
            target=round(price * self.TARGET_RATIO, 2),
            rationale=rationale,
        )

    def _calc_quantity(self, price: float) -> int:
        if price <= 0:
            return 0
        raw = int(self.DEFAULT_POSITION_BUDGET / price)
        lots = max(1, raw // 100)
        return lots * 100

    @staticmethod
    def _calc_buy_fee(price: float, quantity: int) -> float:
        amount = price * quantity
        commission = max(amount * 0.00025, 5.0)
        transfer_fee = amount * 0.00001
        return commission + transfer_fee

    @staticmethod
    def _format_trend_summary(sb) -> str:
        tags = []
        if sb.trend >= 20:
            tags.append("均线多头")
        elif sb.trend >= 10:
            tags.append("均线部分多头")
        if sb.volume_price >= 18:
            tags.append("量价配合良好")
        if sb.kline >= 15:
            tags.append("K线偏强")
        return "+".join(tags) if tags else "趋势中性"

    @staticmethod
    def _format_entry_hint(operation: str, change_pct: float) -> str:
        if operation == "watch":
            return f"当日已涨 {change_pct:.1f}%，建议观望或回调后再介入"
        return "回踩 MA5/MA10 附近分批介入"

    @staticmethod
    def _format_rationale(entry: dict, score: int) -> str:
        return f"五维评分 {score}/100，属领涨板块候选"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_market_recommendation_service.py -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/market_recommendation_service.py tests/test_market_recommendation_service.py
git commit -m "feat(services): build recommendations with stop/target/fee"
```

---

## Task 5: Service 错误路径（数据不可用 + 候选为空）

**Files:**
- Modify: `tests/test_market_recommendation_service.py`

- [ ] **Step 1: Append failing tests**

```python
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
```

- [ ] **Step 2: Run test to verify it passes (Task 4 already covers these paths)**

Run: `python -m pytest tests/test_market_recommendation_service.py -v`
Expected: PASS — all three new tests should pass because Task 4 implemented the error paths; if any fails, fix the service code accordingly.

- [ ] **Step 3: Commit**

```bash
git add tests/test_market_recommendation_service.py
git commit -m "test(services): cover error paths for recommendation generate"
```

---

## Task 6: API endpoint + 路由注册

**Files:**
- Create: `api/v1/endpoints/market_recommendation.py`
- Modify: `api/v1/endpoints/__init__.py`
- Modify: `api/v1/router.py`
- Create: `tests/test_market_recommendation_api.py`

- [ ] **Step 1: Write the failing API test**

```python
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
    assert body["error_code"] == "INVALID_SESSION"


def test_post_recommendations_returns_200(client):
    from src.schemas.market_recommendation_schema import RecommendationResult
    fake_result = RecommendationResult.model_validate(_success_payload())
    with patch(
        "api.v1.endpoints.market_recommendation._build_service"
    ) as mock_factory:
        svc = MagicMock()
        svc.generate.return_value = fake_result
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
        svc.generate.side_effect = MarketDataUnavailable("boom")
        mock_factory.return_value = svc
        res = client.post(
            "/api/v1/market/recommendations", json={"session": "morning"},
        )
    assert res.status_code == 503
    assert res.json()["error_code"] == "DATA_SOURCE_UNAVAILABLE"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_market_recommendation_api.py -v`
Expected: FAIL — module not found / 404.

- [ ] **Step 3: Create the endpoint file**

```python
# api/v1/endpoints/market_recommendation.py
# -*- coding: utf-8 -*-
"""市场时段推荐 API endpoint"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.schemas.market_recommendation_schema import (
    RecommendationResult,
    SessionLiteral,
)
from src.services.market_recommendation_service import (
    MarketDataUnavailable,
    MarketRecommendationService,
    RecommendationTimeout,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class RecommendationRequest(BaseModel):
    session: str


def _build_service() -> MarketRecommendationService:
    """工厂方法，便于测试打桩。"""
    from data_provider.base import DataFetcherManager
    from src.services.stock_screener import StockScreener

    manager = DataFetcherManager()
    screener = StockScreener(manager=manager)
    return MarketRecommendationService(manager=manager, screener=screener)


@router.post("/recommendations", response_model=RecommendationResult)
async def post_recommendations(payload: RecommendationRequest) -> RecommendationResult:
    if payload.session not in ("morning", "afternoon"):
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "INVALID_SESSION",
                "message": "session 必须为 morning 或 afternoon",
            },
        )
    try:
        service = _build_service()
        return service.generate(payload.session)  # type: ignore[arg-type]
    except MarketDataUnavailable as exc:
        logger.warning("market recommendation data unavailable: %s", exc)
        raise HTTPException(
            status_code=503,
            detail={"error_code": "DATA_SOURCE_UNAVAILABLE", "message": str(exc)},
        )
    except RecommendationTimeout as exc:
        logger.warning("market recommendation timeout: %s", exc)
        raise HTTPException(
            status_code=504,
            detail={"error_code": "TIMEOUT", "message": str(exc)},
        )
```

Also update FastAPI to serialize HTTPException detail as top-level JSON. Inspect `server.py` or an existing endpoint (e.g. `stocks.py`) to confirm whether the project already flattens `detail` keys. If not, override in this endpoint:

Replace the two `raise HTTPException(...)` branches' `detail=` with the same dict — FastAPI returns `{"detail": {...}}` by default. To satisfy the test which expects top-level `error_code`, add a custom exception handler in a follow-up only if the existing convention differs. **Update the assertion in test file:** change `body["error_code"]` to `body["detail"]["error_code"]` if the rest of the project uses default handling.

- [ ] **Step 3.1: Verify existing HTTPException convention**

Run: `grep -n "HTTPException\|error_code" api/v1/endpoints/stocks.py | head -20`
Expected: observe the project convention. If `detail=` is a dict and returned as `{"detail": {...}}`, edit `tests/test_market_recommendation_api.py`:

```python
# replace three assertions:
assert res.json()["detail"]["error_code"] == "INVALID_SESSION"
# ... similar for 503
```

Keep the successful-path assertion `res.json()["session"] == "morning"` unchanged since that goes through `response_model` (not `detail`).

- [ ] **Step 4: Register the router**

Modify `api/v1/endpoints/__init__.py` — add `market_recommendation` to imports and `__all__`:

```python
from api.v1.endpoints import (
    health,
    analysis,
    history,
    stocks,
    backtest,
    system_config,
    auth,
    agent,
    usage,
    portfolio,
    market_recommendation,
)
__all__ = [
    "health",
    "analysis",
    "history",
    "stocks",
    "backtest",
    "system_config",
    "auth",
    "agent",
    "usage",
    "portfolio",
    "market_recommendation",
]
```

Modify `api/v1/router.py` — add import and include_router:

```python
from api.v1.endpoints import (
    analysis, auth, history, stocks, backtest, system_config,
    agent, usage, portfolio, market_recommendation,
)

# ... existing include_routers ...

router.include_router(
    market_recommendation.router,
    prefix="/market",
    tags=["MarketRecommendation"],
)
```

(Note: `health.router` is mounted in the top-level app elsewhere; follow existing pattern for market similar to portfolio.)

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest tests/test_market_recommendation_api.py -v`
Expected: PASS (3 tests)

- [ ] **Step 6: Run full backend gate**

Run: `./scripts/ci_gate.sh`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add api/v1/endpoints/market_recommendation.py api/v1/endpoints/__init__.py api/v1/router.py tests/test_market_recommendation_api.py
git commit -m "feat(api): add POST /api/v1/market/recommendations endpoint"
```

---

## Task 7: 前端 types + axios client

**Files:**
- Create: `apps/dsa-web/src/types/recommendation.ts`
- Create: `apps/dsa-web/src/api/recommendation.ts`

- [ ] **Step 1: Create the TypeScript types**

```typescript
// apps/dsa-web/src/types/recommendation.ts
export type Session = 'morning' | 'afternoon';

export interface ScoreBreakdown {
  trend: number;
  volume_price: number;
  kline: number;
  space: number;
  momentum: number;
  divergence_deduction: number;
  total: number;
}

export interface RecommendedStock {
  code: string;
  name: string;
  price: number;
  change_pct: number;
  score: number;
  score_breakdown: ScoreBreakdown;
  trend_summary: string;
  operation: 'buy' | 'watch' | 'hold';
  quantity: number;
  cost_estimate: number;
  fee_estimate: number;
  entry_hint: string;
  stop_loss: number;
  target: number;
  rationale: string;
}

export interface SectorEntry {
  name: string;
  change_pct: number;
}

export interface MarketOverview {
  sh_index_value: number;
  sh_index_change_pct: number;
  top_sectors: SectorEntry[];
  up_count: number;
  down_count: number;
  limit_up_count: number;
  limit_down_count: number;
}

export interface RecommendationResult {
  session: Session;
  generated_at: string;
  overview: MarketOverview;
  recommendations: RecommendedStock[];
  warnings: string[];
  risk_notes: string[];
}
```

- [ ] **Step 2: Create the axios client**

```typescript
// apps/dsa-web/src/api/recommendation.ts
import apiClient from './index';
import type { RecommendationResult, Session } from '../types/recommendation';

export const recommendationApi = {
  async fetch(session: Session): Promise<RecommendationResult> {
    const response = await apiClient.post<RecommendationResult>(
      '/api/v1/market/recommendations',
      { session },
      { timeout: 60000 },
    );
    return response.data;
  },
};
```

- [ ] **Step 3: Verify types compile**

Run: `cd apps/dsa-web && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors (pre-existing warnings ok).

- [ ] **Step 4: Commit**

```bash
git add apps/dsa-web/src/types/recommendation.ts apps/dsa-web/src/api/recommendation.ts
git commit -m "feat(web): add recommendation api client and types"
```

---

## Task 8: useMarketRecommendation hook + 单元测试

**Files:**
- Create: `apps/dsa-web/src/hooks/useMarketRecommendation.ts`
- Create: `apps/dsa-web/src/hooks/__tests__/useMarketRecommendation.test.ts`
- Modify: `apps/dsa-web/src/hooks/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/dsa-web/src/hooks/__tests__/useMarketRecommendation.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMarketRecommendation, __test_only } from '../useMarketRecommendation';

vi.mock('../../api/recommendation', () => ({
  recommendationApi: {
    fetch: vi.fn(),
  },
}));

import { recommendationApi } from '../../api/recommendation';

const sample = {
  session: 'morning' as const,
  generated_at: '2026-04-20T10:00:00+08:00',
  overview: {
    sh_index_value: 3200, sh_index_change_pct: 0.5, top_sectors: [],
    up_count: 0, down_count: 0, limit_up_count: 0, limit_down_count: 0,
  },
  recommendations: [], warnings: [], risk_notes: [],
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('detectSession', () => {
  it('returns morning before 11:30 Shanghai time', () => {
    expect(__test_only.detectSession(new Date('2026-04-20T03:29:00Z'))).toBe('morning');
    // 2026-04-20T03:29:00Z = Shanghai 11:29
  });
  it('returns afternoon at 11:30 Shanghai time', () => {
    expect(__test_only.detectSession(new Date('2026-04-20T03:30:00Z'))).toBe('afternoon');
  });
  it('returns afternoon late evening', () => {
    expect(__test_only.detectSession(new Date('2026-04-20T14:00:00Z'))).toBe('afternoon');
  });
});

describe('useMarketRecommendation', () => {
  it('fetches on first open and caches result in localStorage', async () => {
    (recommendationApi.fetch as any).mockResolvedValue(sample);
    const { result } = renderHook(() => useMarketRecommendation());
    act(() => { result.current.open(); });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.data?.session).toBe('morning');
    });
    expect(recommendationApi.fetch).toHaveBeenCalledTimes(1);
    const storedKeys = Object.keys(localStorage).filter(k => k.startsWith('dsa:recommendation:v1:'));
    expect(storedKeys.length).toBe(1);
  });

  it('uses cache on second open without refetching', async () => {
    (recommendationApi.fetch as any).mockResolvedValue(sample);
    const { result } = renderHook(() => useMarketRecommendation());
    act(() => { result.current.open(); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.close(); });
    act(() => { result.current.open(); });
    await waitFor(() => expect(result.current.data?.session).toBe('morning'));
    expect(recommendationApi.fetch).toHaveBeenCalledTimes(1);
  });

  it('regenerate bypasses cache', async () => {
    (recommendationApi.fetch as any).mockResolvedValue(sample);
    const { result } = renderHook(() => useMarketRecommendation());
    act(() => { result.current.open(); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { void result.current.regenerate(); });
    await waitFor(() => expect(recommendationApi.fetch).toHaveBeenCalledTimes(2));
  });

  it('switchSession fetches for the other session', async () => {
    (recommendationApi.fetch as any).mockResolvedValue(sample);
    const { result } = renderHook(() => useMarketRecommendation());
    act(() => { result.current.open(); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    (recommendationApi.fetch as any).mockResolvedValue({ ...sample, session: 'afternoon' });
    act(() => { void result.current.switchSession('afternoon'); });
    await waitFor(() => expect(result.current.data?.session).toBe('afternoon'));
    expect(recommendationApi.fetch).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/dsa-web && npx vitest run src/hooks/__tests__/useMarketRecommendation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the hook**

```typescript
// apps/dsa-web/src/hooks/useMarketRecommendation.ts
import { useCallback, useRef, useState } from 'react';
import { recommendationApi } from '../api/recommendation';
import type { RecommendationResult, Session } from '../types/recommendation';

const CACHE_VERSION = 'v1';
const CACHE_PREFIX = `dsa:recommendation:${CACHE_VERSION}:`;

function formatShanghaiDate(d: Date): string {
  // en-CA locale yields YYYY-MM-DD without needing manual padding.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function getShanghaiMinutesOfDay(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

function detectSession(d: Date = new Date()): Session {
  // morning: before 11:30 Shanghai; otherwise afternoon
  return getShanghaiMinutesOfDay(d) < 11 * 60 + 30 ? 'morning' : 'afternoon';
}

function isShanghaiWeekend(d: Date = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', weekday: 'short',
  }).format(d);
  return weekday === 'Sat' || weekday === 'Sun';
}

function cacheKey(session: Session, d: Date = new Date()): string {
  return `${CACHE_PREFIX}${formatShanghaiDate(d)}:${session}`;
}

function readCache(key: string): RecommendationResult | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as RecommendationResult) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: RecommendationResult) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // quota / privacy mode, ignore
  }
}

export interface UseMarketRecommendation {
  isOpen: boolean;
  session: Session;
  data: RecommendationResult | null;
  loading: boolean;
  error: string | null;
  isNonTradingDay: boolean;
  open: () => void;
  close: () => void;
  switchSession: (s: Session) => Promise<void>;
  regenerate: () => Promise<void>;
}

export function useMarketRecommendation(): UseMarketRecommendation {
  const [isOpen, setIsOpen] = useState(false);
  const [session, setSession] = useState<Session>(() => detectSession());
  const [data, setData] = useState<RecommendationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNonTradingDay = isShanghaiWeekend();
  const inflight = useRef<Promise<void> | null>(null);

  const load = useCallback(async (s: Session, force = false): Promise<void> => {
    if (isNonTradingDay) return;
    const key = cacheKey(s);
    if (!force) {
      const cached = readCache(key);
      if (cached) {
        setData(cached);
        setError(null);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const fresh = await recommendationApi.fetch(s);
      writeCache(key, fresh);
      setData(fresh);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: { message?: string }; message?: string } }; message?: string };
      setError(
        e?.response?.data?.detail?.message
          ?? e?.response?.data?.message
          ?? e?.message
          ?? '生成失败，请重试',
      );
    } finally {
      setLoading(false);
    }
  }, [isNonTradingDay]);

  const open = useCallback(() => {
    setIsOpen(true);
    const s = detectSession();
    setSession(s);
    if (inflight.current) return;
    inflight.current = load(s).finally(() => { inflight.current = null; });
  }, [load]);

  const close = useCallback(() => setIsOpen(false), []);

  const switchSession = useCallback(async (s: Session) => {
    setSession(s);
    await load(s);
  }, [load]);

  const regenerate = useCallback(async () => {
    localStorage.removeItem(cacheKey(session));
    await load(session, true);
  }, [load, session]);

  return { isOpen, session, data, loading, error, isNonTradingDay, open, close, switchSession, regenerate };
}

export const __test_only = { detectSession, isShanghaiWeekend, formatShanghaiDate };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/dsa-web && npx vitest run src/hooks/__tests__/useMarketRecommendation.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Export the hook**

Modify `apps/dsa-web/src/hooks/index.ts` to append:

```typescript
export { useMarketRecommendation } from './useMarketRecommendation';
export type { UseMarketRecommendation } from './useMarketRecommendation';
```

- [ ] **Step 6: Commit**

```bash
git add apps/dsa-web/src/hooks/useMarketRecommendation.ts apps/dsa-web/src/hooks/__tests__/useMarketRecommendation.test.ts apps/dsa-web/src/hooks/index.ts
git commit -m "feat(web): add useMarketRecommendation hook with localStorage cache"
```

---

## Task 9: 展示组件（SessionTabs + MarketOverviewBlock + RecommendationCard）

**Files:**
- Create: `apps/dsa-web/src/components/recommendation/SessionTabs.tsx`
- Create: `apps/dsa-web/src/components/recommendation/MarketOverviewBlock.tsx`
- Create: `apps/dsa-web/src/components/recommendation/RecommendationCard.tsx`
- Create: `apps/dsa-web/src/components/recommendation/index.ts`

- [ ] **Step 1: Create SessionTabs**

```tsx
// apps/dsa-web/src/components/recommendation/SessionTabs.tsx
import type React from 'react';
import type { Session } from '../../types/recommendation';

interface Props {
  current: Session;
  autoDetected: Session;
  onChange: (session: Session) => void;
}

const TABS: { value: Session; label: string }[] = [
  { value: 'morning', label: '上午盘' },
  { value: 'afternoon', label: '下午盘' },
];

export const SessionTabs: React.FC<Props> = ({ current, autoDetected, onChange }) => (
  <div className="flex gap-1 border-b border-border">
    {TABS.map(tab => {
      const active = current === tab.value;
      return (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={`px-3 py-1.5 text-sm border-b-2 transition-colors ${
            active
              ? 'border-primary text-primary font-medium'
              : 'border-transparent text-secondary-text hover:text-foreground'
          }`}
        >
          {tab.label}
          {tab.value === autoDetected ? (
            <span className="ml-1 text-xs text-primary/70">·当前</span>
          ) : null}
        </button>
      );
    })}
  </div>
);
```

- [ ] **Step 2: Create MarketOverviewBlock**

```tsx
// apps/dsa-web/src/components/recommendation/MarketOverviewBlock.tsx
import type React from 'react';
import type { MarketOverview } from '../../types/recommendation';

interface Props {
  overview: MarketOverview;
}

const formatPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const colorOf = (n: number) => (n >= 0 ? 'text-red-500' : 'text-green-500');

export const MarketOverviewBlock: React.FC<Props> = ({ overview }) => (
  <div className="rounded-md border border-border bg-background-subtle p-3 text-sm">
    <div className="flex items-baseline justify-between">
      <span className="font-medium">上证指数</span>
      <span>
        {overview.sh_index_value.toFixed(2)}{' '}
        <span className={colorOf(overview.sh_index_change_pct)}>
          {formatPct(overview.sh_index_change_pct)}
        </span>
      </span>
    </div>
    <div className="mt-1.5 text-xs text-secondary-text">
      涨 {overview.up_count} · 跌 {overview.down_count} · 涨停 {overview.limit_up_count} · 跌停 {overview.limit_down_count}
    </div>
    {overview.top_sectors.length > 0 ? (
      <div className="mt-2">
        <div className="text-xs text-secondary-text">领涨板块</div>
        <ul className="mt-1 space-y-0.5">
          {overview.top_sectors.map(s => (
            <li key={s.name} className="flex justify-between text-xs">
              <span>{s.name}</span>
              <span className={colorOf(s.change_pct)}>{formatPct(s.change_pct)}</span>
            </li>
          ))}
        </ul>
      </div>
    ) : null}
  </div>
);
```

- [ ] **Step 3: Create RecommendationCard**

```tsx
// apps/dsa-web/src/components/recommendation/RecommendationCard.tsx
import type React from 'react';
import type { RecommendedStock } from '../../types/recommendation';

interface Props {
  stock: RecommendedStock;
}

const OP_LABEL: Record<RecommendedStock['operation'], string> = {
  buy: '建议买入',
  watch: '建议观望',
  hold: '建议持有',
};

const formatPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const colorOf = (n: number) => (n >= 0 ? 'text-red-500' : 'text-green-500');

export const RecommendationCard: React.FC<Props> = ({ stock }) => (
  <div className="rounded-md border border-border p-3 text-sm">
    <div className="flex items-baseline justify-between gap-2">
      <div className="min-w-0">
        <span className="font-medium">{stock.name}</span>
        <span className="ml-1 text-xs text-secondary-text">{stock.code}</span>
      </div>
      <div className="text-right">
        <div className="font-medium">{stock.price.toFixed(2)}</div>
        <div className={`text-xs ${colorOf(stock.change_pct)}`}>
          {formatPct(stock.change_pct)}
        </div>
      </div>
    </div>

    <div className="mt-2 flex items-center gap-2">
      <div className="flex-1 text-xs text-secondary-text">评分</div>
      <div className="flex-[3] h-1.5 rounded-full bg-border overflow-hidden">
        <div
          className="h-full bg-primary"
          style={{ width: `${Math.min(100, stock.score)}%` }}
        />
      </div>
      <div className="w-8 text-right text-xs">{stock.score}</div>
    </div>

    <div className="mt-2 text-xs text-secondary-text">{stock.trend_summary}</div>

    <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
      <div><span className="text-secondary-text">操作：</span>{OP_LABEL[stock.operation]}</div>
      <div><span className="text-secondary-text">数量：</span>{stock.quantity} 股</div>
      <div><span className="text-secondary-text">所需资金：</span>约 {stock.cost_estimate.toFixed(0)} 元</div>
      <div><span className="text-secondary-text">含费：</span>{stock.fee_estimate.toFixed(2)} 元</div>
      <div><span className="text-secondary-text">止损：</span>{stock.stop_loss.toFixed(2)}</div>
      <div><span className="text-secondary-text">目标：</span>{stock.target.toFixed(2)}</div>
    </div>

    <div className="mt-2 text-xs">
      <div className="text-secondary-text">介入时机</div>
      <div>{stock.entry_hint}</div>
    </div>

    <div className="mt-1 text-xs text-secondary-text">{stock.rationale}</div>
  </div>
);
```

- [ ] **Step 4: Create barrel export**

```typescript
// apps/dsa-web/src/components/recommendation/index.ts
export { SessionTabs } from './SessionTabs';
export { MarketOverviewBlock } from './MarketOverviewBlock';
export { RecommendationCard } from './RecommendationCard';
export { RecommendationDrawer } from './RecommendationDrawer';
```

(`RecommendationDrawer` will be created in Task 10 — barrel export compiles only after Task 10 finishes. Either temporarily omit the last line here and re-add in Task 10, or move the barrel creation to Task 10.)

**Decision:** move `index.ts` creation to Task 10 Step 4 to avoid a broken compile between tasks. Skip this barrel in Task 9.

- [ ] **Step 5: Type-check and lint**

Run: `cd apps/dsa-web && npx tsc --noEmit -p tsconfig.app.json && npm run lint`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add apps/dsa-web/src/components/recommendation/SessionTabs.tsx apps/dsa-web/src/components/recommendation/MarketOverviewBlock.tsx apps/dsa-web/src/components/recommendation/RecommendationCard.tsx
git commit -m "feat(web): add presentation components for recommendation drawer"
```

---

## Task 10: RecommendationDrawer + 组件测试

**Files:**
- Create: `apps/dsa-web/src/components/recommendation/RecommendationDrawer.tsx`
- Create: `apps/dsa-web/src/components/recommendation/index.ts`
- Create: `apps/dsa-web/src/components/recommendation/__tests__/RecommendationDrawer.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/dsa-web/src/components/recommendation/__tests__/RecommendationDrawer.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RecommendationDrawer } from '../RecommendationDrawer';

vi.mock('../../../api/recommendation', () => ({
  recommendationApi: {
    fetch: vi.fn(),
  },
}));
import { recommendationApi } from '../../../api/recommendation';

const sample = {
  session: 'morning' as const,
  generated_at: '2026-04-20T10:00:00+08:00',
  overview: {
    sh_index_value: 3200, sh_index_change_pct: 0.5,
    top_sectors: [{ name: '半导体', change_pct: 2.1 }],
    up_count: 3000, down_count: 2000, limit_up_count: 50, limit_down_count: 5,
  },
  recommendations: [{
    code: '600519', name: '贵州茅台', price: 1680.0, change_pct: 1.2,
    score: 78,
    score_breakdown: { trend:24, volume_price:19, kline:16, space:12, momentum:7, divergence_deduction:0, total:78 },
    trend_summary: '均线多头', operation: 'buy' as const, quantity: 100,
    cost_estimate: 168050.0, fee_estimate: 50.0,
    entry_hint: '回踩MA5', stop_loss: 1629.6, target: 1764.0,
    rationale: '评分78',
  }],
  warnings: [], risk_notes: ['总仓位不超40%'],
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('RecommendationDrawer', () => {
  it('does not render content when closed', () => {
    render(<RecommendationDrawer isOpen={false} onClose={() => {}} />);
    expect(screen.queryByText(/今日推荐/)).not.toBeInTheDocument();
  });

  it('renders loading then data when opened', async () => {
    (recommendationApi.fetch as any).mockResolvedValue(sample);
    render(<RecommendationDrawer isOpen={true} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/贵州茅台/)).toBeInTheDocument());
    expect(screen.getByText(/上证指数/)).toBeInTheDocument();
  });

  it('shows error and retry button on failure', async () => {
    (recommendationApi.fetch as any).mockRejectedValue(new Error('boom'));
    render(<RecommendationDrawer isOpen={true} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/boom|生成失败/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /重试|重新生成/ })).toBeInTheDocument();
  });

  it('closes when Esc pressed', async () => {
    (recommendationApi.fetch as any).mockResolvedValue(sample);
    const onClose = vi.fn();
    render(<RecommendationDrawer isOpen={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/dsa-web && npx vitest run src/components/recommendation/__tests__/RecommendationDrawer.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the drawer**

```tsx
// apps/dsa-web/src/components/recommendation/RecommendationDrawer.tsx
import type React from 'react';
import { useEffect } from 'react';
import { useMarketRecommendation } from '../../hooks/useMarketRecommendation';
import { SessionTabs } from './SessionTabs';
import { MarketOverviewBlock } from './MarketOverviewBlock';
import { RecommendationCard } from './RecommendationCard';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const RecommendationDrawer: React.FC<Props> = ({ isOpen, onClose }) => {
  const {
    session, data, loading, error, isNonTradingDay,
    open, switchSession, regenerate,
  } = useMarketRecommendation();

  useEffect(() => {
    if (isOpen) open();
  }, [isOpen, open]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative z-10 flex w-96 lg:w-[28rem] flex-col bg-background shadow-2xl overflow-y-auto">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-base font-medium">今日推荐</h2>
            {data ? (
              <p className="text-xs text-secondary-text">生成于 {data.generated_at}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void regenerate()}
              disabled={loading || isNonTradingDay}
              className="text-xs text-secondary-text hover:text-foreground disabled:opacity-50"
            >
              重新生成
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-secondary-text hover:text-foreground"
              aria-label="关闭"
            >
              ×
            </button>
          </div>
        </header>

        <SessionTabs
          current={session}
          autoDetected={session}
          onChange={(s) => void switchSession(s)}
        />

        <div className="flex-1 p-3 space-y-3">
          {isNonTradingDay ? (
            <div className="text-sm text-secondary-text">
              今日非交易日，暂无实时推荐。
            </div>
          ) : loading ? (
            <div className="text-sm text-secondary-text">分析领涨板块…</div>
          ) : error ? (
            <div className="space-y-2">
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </div>
              <button
                type="button"
                onClick={() => void regenerate()}
                className="btn-primary text-xs"
              >
                重试
              </button>
            </div>
          ) : data ? (
            <>
              {data.warnings.length > 0 ? (
                <ul className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning space-y-0.5">
                  {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              ) : null}
              <MarketOverviewBlock overview={data.overview} />
              <div className="space-y-2">
                {data.recommendations.length === 0 ? (
                  <div className="text-xs text-secondary-text">暂无符合条件的推荐。</div>
                ) : data.recommendations.map(s => (
                  <RecommendationCard key={s.code} stock={s} />
                ))}
              </div>
              {data.risk_notes.length > 0 ? (
                <ul className="pt-2 border-t border-border text-[11px] text-secondary-text space-y-0.5">
                  {data.risk_notes.map((n, i) => <li key={i}>· {n}</li>)}
                </ul>
              ) : null}
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
};
```

- [ ] **Step 4: Create barrel export**

```typescript
// apps/dsa-web/src/components/recommendation/index.ts
export { SessionTabs } from './SessionTabs';
export { MarketOverviewBlock } from './MarketOverviewBlock';
export { RecommendationCard } from './RecommendationCard';
export { RecommendationDrawer } from './RecommendationDrawer';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/dsa-web && npx vitest run src/components/recommendation/__tests__/RecommendationDrawer.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/dsa-web/src/components/recommendation/RecommendationDrawer.tsx apps/dsa-web/src/components/recommendation/index.ts apps/dsa-web/src/components/recommendation/__tests__/RecommendationDrawer.test.tsx
git commit -m "feat(web): add RecommendationDrawer component"
```

---

## Task 11: HomePage 集成按钮 + 抽屉

**Files:**
- Modify: `apps/dsa-web/src/pages/HomePage.tsx`

- [ ] **Step 1: Modify HomePage — add button + drawer**

In `apps/dsa-web/src/pages/HomePage.tsx`:

1. Add import near other component imports (after `import { TaskPanel } from '../components/tasks';`):

```tsx
import { RecommendationDrawer } from '../components/recommendation';
```

2. Inside the `HomePage` function, near the top of existing `useState` calls, add:

```tsx
const [recommendationOpen, setRecommendationOpen] = useState(false);
```

3. Inside the header action area, insert a new button BEFORE the "分析" button. Find the existing block starting with `<label className="flex flex-shrink-0 cursor-pointer ..."` and insert the new button immediately before that `<label>`:

```tsx
<button
  type="button"
  onClick={() => setRecommendationOpen(true)}
  className="flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-xs text-secondary-text transition-colors hover:bg-hover hover:text-foreground"
  title="今日推荐"
>
  📊 今日推荐
</button>
```

4. At the end of the returned JSX, right before the closing `</div>` of the outermost component root div (same level as `<ConfirmDialog ... />` and `{markdownDrawerOpen && ...}`), add:

```tsx
<RecommendationDrawer
  isOpen={recommendationOpen}
  onClose={() => setRecommendationOpen(false)}
/>
```

- [ ] **Step 2: Type-check and lint**

Run: `cd apps/dsa-web && npm run lint && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors.

- [ ] **Step 3: Build**

Run: `cd apps/dsa-web && npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add apps/dsa-web/src/pages/HomePage.tsx
git commit -m "feat(web): mount today recommendation drawer on HomePage"
```

---

## Task 12: 端到端验证 + 文档

**Files:**
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Run full backend gate**

Run: `./scripts/ci_gate.sh`
Expected: PASS (includes all new tests).

- [ ] **Step 2: Run full web gate**

Run: `cd apps/dsa-web && npm ci && npm run lint && npm run build && npx vitest run`
Expected: lint clean, build success, all vitest suites pass.

- [ ] **Step 3: Smoke test locally (manual)**

1. Start backend: `python main.py --serve-only` (or `uvicorn server:app --reload --port 8000`)
2. Start web: `cd apps/dsa-web && npm run dev`
3. Open browser, log in if required, click "📊 今日推荐" button on HomePage.
4. Verify:
   - Drawer opens with loading indicator
   - After a few seconds, shows either recommendations, empty list with warnings, or a clear error
   - Click tab "下午盘" → new fetch triggered
   - Click "重新生成" → cache cleared + refetch
   - Press Esc → drawer closes
5. Record any UX issues as follow-up tasks (do not fix in this plan).

- [ ] **Step 4: Update CHANGELOG**

Append to `docs/CHANGELOG.md` under a new entry dated 2026-04-20 (follow existing format — inspect top of file first with `head -40 docs/CHANGELOG.md`):

```markdown
## 2026-04-20

### 新增
- Web: HomePage 新增「今日推荐」抽屉，按 Asia/Shanghai 时间自动选择上午盘 / 下午盘，点击时实时生成 3 只推荐。后端新增 `POST /api/v1/market/recommendations`，复用 `DataFetcherManager` + `StockScreener`。
```

- [ ] **Step 5: Commit docs**

```bash
git add docs/CHANGELOG.md
git commit -m "docs(changelog): record market recommendation panel feature"
```

- [ ] **Step 6: Final verification summary**

Confirm the following facts and record them in the PR description later:
- All new unit tests pass locally (`pytest` + `vitest`)
- `./scripts/ci_gate.sh` passes
- `npm run lint` and `npm run build` pass under `apps/dsa-web`
- No new environment variables added
- No changes to `main.py`, `server.py`, `bot/`, desktop app, or existing endpoints

---

## Self-Review Notes

- **Spec coverage:** §3 architecture (Tasks 6, 10, 11 plus hook) / §4 schema + service (Tasks 1-5) / §4.3 API (Task 6) / §5 UI (Tasks 7-11) / §6 data flow (Task 8 + 10) / §7 errors (Tasks 3, 4, 5, 6, 10) / §8 tests (each task) / §10 YAGNI is not added / §11 rollback is trivial (revert commits)
- **Type consistency:** `RecommendedStock`, `Session`, `RecommendationResult` names identical in Python schema and TypeScript types; hook exports `UseMarketRecommendation`, used by drawer implicitly via `useMarketRecommendation()`
- **Placeholder scan:** No TBD/TODO; all code blocks complete; test code shown in full
- **Risk areas:** If `HTTPException` returns `{"detail": {...}}` by default (it does in FastAPI), Task 6 Step 3.1 adjusts the test assertions accordingly so tests match reality
