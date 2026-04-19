"""
股票筛选服务 — 前置过滤 + 五维自动评分
"""
from typing import List, Dict, Any, Optional
from data_provider.base import is_st_stock, is_kc_cy_stock


class StockScreener:
    """股票筛选与评分服务"""

    def __init__(self, manager=None):
        self.manager = manager

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

        Hard exclusions: 创业板(300/301), 科创板(688), ST
        Optional filters: market cap, PE, turnover rate
        When a filter field is missing from the data, do NOT exclude (lenient).
        """
        results = []
        for stock in candidates:
            code = str(stock.get("code", ""))
            name = str(stock.get("name", ""))

            if is_kc_cy_stock(code):
                continue
            if is_st_stock(name):
                continue

            if min_market_cap is not None:
                mv = stock.get("total_mv")
                if mv is not None and float(mv) < min_market_cap:
                    continue

            pe = stock.get("pe_ratio")
            if exclude_negative_pe and pe is not None and float(pe) < 0:
                continue
            if max_pe is not None and pe is not None and float(pe) > max_pe:
                continue

            tr = stock.get("turnover_rate")
            if min_turnover_rate is not None and tr is not None and float(tr) < min_turnover_rate:
                continue

            results.append(stock)
        return results

    @staticmethod
    def score_five_dimensions(
        df,  # pd.DataFrame
        realtime_price: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        五维自动评分（满分100）

        Dimensions:
        A. 趋势强度 (30pts): MA排列12 + 均线方向10 + 价格vs均线8
        B. 量价配合 (25pts): 量价关系12 + 成交额趋势8 + 量比5
        C. K线形态 (20pts): 近3日K线10 + 实体大小5 + 振幅趋势5
        D. 乖离空间 (15pts): 10日BIAS 5 + 距低点5 + 距高点5
        E. 动量 (10pts): 近5日涨幅5 + 涨跌天数5
        Divergence penalties: 量价背离-8, 冲高回落-5, 均线死叉-5

        Returns dict with: total, price_used, breakdown (per dimension), details (explanations)
        """
        import pandas as pd

        empty_result = {
            "total": 0, "price_used": 0,
            "breakdown": {"trend": 0, "volume": 0, "kline": 0,
                          "space": 0, "momentum": 0, "divergence": 0},
            "details": {}
        }
        if df is None or not hasattr(df, 'empty') or df.empty or len(df) < 5:
            return empty_result

        last = df.iloc[-1]
        price = realtime_price if realtime_price else float(last["close"])
        ma5 = float(last.get("ma5", 0) or 0)
        ma10 = float(last.get("ma10", 0) or 0)
        ma20 = float(last.get("ma20", 0) or 0)
        details = {}

        # ===== A. 趋势强度 (30) =====
        trend_score = 0
        # A1: MA排列 (12)
        if ma5 > ma10 > ma20 and price > ma5:
            a1 = 12; details["ma_arrange"] = "完美多头"
        elif ma5 > ma10 and price > ma20:
            a1 = 7; details["ma_arrange"] = "部分多头"
        elif ma10 > 0 and abs(ma5 - ma10) / ma10 < 0.02:
            a1 = 4; details["ma_arrange"] = "粘合"
        else:
            a1 = 0; details["ma_arrange"] = "空头/无序"
        trend_score += a1

        # A2: 均线方向 (10) — 近3日斜率
        if len(df) >= 3:
            ma5_s = float(df.iloc[-1].get("ma5", 0) or 0) - float(df.iloc[-3].get("ma5", 0) or 0)
            ma10_s = float(df.iloc[-1].get("ma10", 0) or 0) - float(df.iloc[-3].get("ma10", 0) or 0)
            if ma5_s > 0 and ma10_s > 0:
                a2 = 10; details["ma_direction"] = "均上行"
            elif ma5_s > 0:
                a2 = 6; details["ma_direction"] = "仅MA5上行"
            else:
                a2 = 0; details["ma_direction"] = "均下行"
        else:
            a2 = 0
        trend_score += a2

        # A3: 价格vs均线 (8)
        if price > ma5 > ma10 > ma20 > 0:
            a3 = 8
        elif ma20 > 0 and price > ma20:
            a3 = 5
        else:
            a3 = 0
        trend_score += a3

        # ===== B. 量价配合 (25) =====
        volume_score = 0
        recent5 = df.tail(5)

        # B1: 量价关系 (12)
        up_rows = recent5[recent5["pct_chg"] > 0]
        dn_rows = recent5[recent5["pct_chg"] <= 0]
        up_vol = up_rows["volume"].mean() if len(up_rows) > 0 else 0
        dn_vol = dn_rows["volume"].mean() if len(dn_rows) > 0 else 0
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

        # B2: 成交额趋势 (8)
        if len(df) >= 20:
            avg5_v = recent5["volume"].mean()
            avg20_v = df.tail(20)["volume"].mean()
            if avg20_v > 0 and avg5_v > avg20_v * 1.1:
                b2 = 8 if recent5["volume"].is_monotonic_increasing else 6
                details["vol_trend"] = "近5日放量"
            elif avg20_v > 0 and avg5_v > avg20_v * 0.9:
                b2 = 4; details["vol_trend"] = "持平"
            else:
                b2 = 0; details["vol_trend"] = "萎缩"
        else:
            b2 = 4
        volume_score += b2

        # B3: 量比 (5)
        vr = float(last.get("volume_ratio", 0) or 0)
        if vr > 1.5:
            b3 = 5
        elif vr >= 1.0:
            b3 = 3
        else:
            b3 = 0
        details["volume_ratio"] = round(vr, 2)
        volume_score += b3

        # ===== C. K线形态 (20) =====
        kline_score = 0
        recent3 = df.tail(3)

        # C1: 近3日K线 (10)
        yang_count = sum(1 for _, r in recent3.iterrows() if float(r["close"]) > float(r["open"]))
        if yang_count == 3:
            c1 = 10; details["kline_pattern"] = "连续阳线"
        elif yang_count >= 2:
            c1 = 6; details["kline_pattern"] = "2阳1阴"
        elif yang_count == 1:
            last_r = recent3.iloc[-1]
            body = abs(float(last_r["close"]) - float(last_r["open"]))
            lower_shadow = min(float(last_r["close"]), float(last_r["open"])) - float(last_r["low"])
            if body > 0 and lower_shadow > body * 2:
                c1 = 4; details["kline_pattern"] = "长下影线"
            else:
                c1 = 2; details["kline_pattern"] = "偏弱"
        else:
            c1 = 0; details["kline_pattern"] = "连续阴线"
        kline_score += c1

        # C2: 实体大小 (5)
        recent_yang = recent3[recent3["close"] > recent3["open"]]
        if len(recent_yang) > 0:
            avg_body_pct = ((recent_yang["close"] - recent_yang["open"]) / recent_yang["open"]).mean() * 100
            if avg_body_pct > 2:
                c2 = 5
            elif avg_body_pct > 1:
                c2 = 3
            else:
                c2 = 1
        else:
            c2 = 0
        kline_score += c2

        # C3: 振幅趋势 (5)
        if len(df) >= 6:
            amp_prev = ((df.iloc[-6:-3]["high"] - df.iloc[-6:-3]["low"]) / df.iloc[-6:-3]["low"]).mean()
            amp_curr = ((recent3["high"] - recent3["low"]) / recent3["low"]).mean()
            if amp_prev > 0 and amp_curr > amp_prev * 1.3 and amp_prev < 0.03:
                c3 = 5; details["amplitude"] = "收窄后放大"
            elif amp_curr < amp_prev * 1.5:
                c3 = 3; details["amplitude"] = "正常"
            else:
                c3 = 0; details["amplitude"] = "持续放大"
        else:
            c3 = 3
        kline_score += c3

        # ===== D. 乖离空间 (15) =====
        space_score = 0

        # D1: 10日BIAS (5)
        if ma10 > 0:
            bias10 = (price - ma10) / ma10 * 100
            if bias10 > 20:  d1 = -3
            elif bias10 > 15: d1 = 0
            elif bias10 > 8:  d1 = 3
            else:             d1 = 5
            details["bias10"] = round(bias10, 2)
        else:
            d1 = 0
        space_score += d1

        # D2: 距30日低点 (5)
        low30 = float(df["low"].min())
        if low30 > 0:
            dist_low = (price - low30) / low30 * 100
            if dist_low > 30:   d2 = 0
            elif dist_low > 15: d2 = 3
            else:               d2 = 5
            details["dist_low30"] = round(dist_low, 2)
        else:
            d2 = 0
        space_score += d2

        # D3: 距30日高点 (5)
        high30 = float(df["high"].max())
        if high30 > 0:
            dist_high = (high30 - price) / high30 * 100
            if dist_high < 5:    d3 = 5
            elif dist_high < 15: d3 = 3
            else:                d3 = 0
            details["dist_high30"] = round(dist_high, 2)
        else:
            d3 = 0
        space_score += d3

        # ===== E. 动量 (10) =====
        momentum_score = 0

        # E1: 近5日涨幅 (5)
        if len(df) >= 6:
            price_5ago = float(df.iloc[-6]["close"])
            chg5 = (price - price_5ago) / price_5ago * 100 if price_5ago > 0 else 0
            if 3 <= chg5 <= 10:    e1 = 5
            elif 10 < chg5 <= 20:  e1 = 3
            elif chg5 > 20:        e1 = 0
            elif chg5 < 0:         e1 = 2
            else:                  e1 = 3
            details["chg5d"] = round(chg5, 2)
        else:
            e1 = 0
        momentum_score += e1

        # E2: 近10日涨跌天数 (5)
        recent10 = df.tail(10)
        up_days = int((recent10["pct_chg"] > 0).sum())
        if up_days >= 6:   e2 = 5
        elif up_days == 5: e2 = 3
        else:              e2 = 0
        details["up_days_10"] = up_days
        momentum_score += e2

        # ===== 背离检测 (扣分) =====
        divergence = 0

        # 量价背离: 近3日价格创新高但量递减>15%
        if len(df) >= 4:
            h3_max = float(recent3["high"].max())
            prev_high = float(df.iloc[-4]["high"])
            v_first = float(recent3.iloc[0]["volume"])
            v_last = float(recent3.iloc[-1]["volume"])
            if h3_max > prev_high and v_first > 0 and (v_first - v_last) / v_first > 0.15:
                divergence -= 8
                details["div_vol_price"] = True

        # 冲高回落: 近3日高价创新高但收盘<开盘
        for _, r in recent3.iterrows():
            if float(r["high"]) >= high30 * 0.99 and float(r["close"]) < float(r["open"]):
                divergence -= 5
                details["div_pullback"] = True
                break

        # 均线死叉: MA5下穿MA10
        if len(df) >= 2:
            prev_ma5 = float(df.iloc[-2].get("ma5", 0) or 0)
            prev_ma10 = float(df.iloc[-2].get("ma10", 0) or 0)
            if prev_ma5 >= prev_ma10 and ma5 < ma10:
                divergence -= 5
                details["div_death_cross"] = True

        # ===== 汇总 =====
        total = max(0, trend_score + volume_score + kline_score + space_score + momentum_score + divergence)

        return {
            "total": total,
            "price_used": price,
            "breakdown": {
                "trend": trend_score,
                "volume": volume_score,
                "kline": kline_score,
                "space": space_score,
                "momentum": momentum_score,
                "divergence": divergence,
            },
            "details": details,
        }

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
        """
        if not self.manager:
            raise ValueError("screen_from_sector requires a DataFetcherManager instance")

        # Step 1: 获取板块成分股
        constituents = self.manager.get_sector_constituents(board_name, board_type)
        if not constituents:
            return []

        # Step 2: 用实时行情增强字段
        codes = [c["code"] for c in constituents]
        self.manager.prefetch_realtime_quotes(codes[:50])

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

        # Step 4: 按当日涨幅排序，取前 top_n*2 只进入评分
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

    def get_supplementary_score(self, code: str) -> Dict[str, Any]:
        """
        附加参考评分（龙虎榜等），不纳入五维主体评分

        Returns:
            {"dragon_tiger": int, "total_bonus": int, "notes": List[str]}
        """
        bonus = 0
        notes = []

        dt_score = 0
        try:
            if self.manager:
                dt = self.manager.get_dragon_tiger_context(code)
                if dt and dt.get("status") == "ok":
                    data = dt.get("data", {})
                    if data.get("is_on_list"):
                        dt_score = 5
                        notes.append(f"近期龙虎榜上榜{data.get('recent_count', 0)}次")
                    elif data.get("recent_count", 0) > 0:
                        dt_score = 3
                        notes.append("近期有龙虎榜记录")
        except Exception:
            pass

        bonus += dt_score
        return {"dragon_tiger": dt_score, "total_bonus": bonus, "notes": notes}
