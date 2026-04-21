# api/v1/endpoints/market_recommendation.py
# -*- coding: utf-8 -*-
"""市场时段推荐 API endpoint"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.schemas.market_recommendation_schema import (
    RecommendationResult,
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
                "error": "INVALID_SESSION",
                "error_code": "INVALID_SESSION",
                "message": "session 必须为 morning 或 afternoon",
            },
        )
    try:
        service = _build_service()
        return service.generate_with_timeout(payload.session)  # type: ignore[arg-type]
    except MarketDataUnavailable as exc:
        logger.warning("market recommendation data unavailable: %s", exc)
        raise HTTPException(
            status_code=503,
            detail={
                "error": "DATA_SOURCE_UNAVAILABLE",
                "error_code": "DATA_SOURCE_UNAVAILABLE",
                "message": str(exc),
            },
        )
    except RecommendationTimeout as exc:
        logger.warning("market recommendation timeout: %s", exc)
        raise HTTPException(
            status_code=504,
            detail={
                "error": "TIMEOUT",
                "error_code": "TIMEOUT",
                "message": str(exc),
            },
        )
