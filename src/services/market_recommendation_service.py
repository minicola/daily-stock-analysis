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

    @staticmethod
    def _now_iso_shanghai() -> str:
        return datetime.now(SHANGHAI_TZ).isoformat(timespec="seconds")
