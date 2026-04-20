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
