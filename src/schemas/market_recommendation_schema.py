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
