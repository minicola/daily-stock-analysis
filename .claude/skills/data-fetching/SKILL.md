---
name: data-fetching
description: 使用项目的数据获取接口获取股票行情、市场统计和板块数据
---

# 数据获取接口使用指南

本项目使用 `DataFetcherManager` 作为统一的数据获取入口，支持多数据源自动故障切换。

## 核心接口

### 初始化

```python
from data_provider.base import DataFetcherManager

manager = DataFetcherManager()
```

### 主要方法

#### 1. 获取实时行情

```python
quote = manager.get_realtime_quote(stock_code)
# 返回 UnifiedRealtimeQuote 对象
```

**UnifiedRealtimeQuote 关键属性**：
- `code`: 股票代码
- `name`: 股票名称
- `price`: 最新价（注意：不是 current）
- `change_pct`: 涨跌幅(%)
- `change_amount`: 涨跌额
- `volume`: 成交量（手）
- `amount`: 成交额（元，可能为 None）
- `open_price`, `high`, `low`, `pre_close`: 价格区间
- `pe_ratio`, `pb_ratio`: 估值指标
- `total_mv`, `circ_mv`: 市值

#### 2. 获取主要指数

```python
indices = manager.get_main_indices('cn')
# 返回 List[Dict]，包含上证、深证、创业板等
# 每个 dict 包含: name, price, change_pct
```

#### 3. 获取市场统计

```python
stats = manager.get_market_stats()
# 返回 Dict，包含: up, down, flat, limit_up, limit_down
```

#### 4. 获取板块排行

```python
gainers, losers = manager.get_sector_rankings(n=5)
# gainers: 领涨板块列表
# losers: 领跌板块列表
# 每个元素包含: name, change_pct
```

#### 5. 获取板块成分股

```python
# 概念板块成分股（如"锂电池"、"新能源车"）
constituents = manager.get_sector_constituents("锂电池", board_type="concept")
# 行业板块成分股（如"电池"、"电力设备"）
constituents = manager.get_sector_constituents("电池", board_type="industry")
# 返回 List[Dict]: code, name, change_pct, price, amount
```

#### 6. 程序化选股服务

```python
from src.services.stock_screener import StockScreener

screener = StockScreener(manager)

# 完整流水线：板块获取 → 排除创业板/ST/科创板 → 市值/PE过滤 → 五维评分 → 排序
results = screener.screen_from_sector(
    board_name="锂电池",
    top_n=5,
    min_score=60,
    min_market_cap=50e8,       # 最小市值50亿
    exclude_negative_pe=True,  # 排除亏损股
)
# 返回按评分降序 List[Dict]: code, name, price, score, breakdown, details

# 单独调用五维评分
df, _ = manager.get_daily_data("603659", days=30)
score = StockScreener.score_five_dimensions(df, realtime_price=35.72)
# {"total": 73, "breakdown": {"trend":30, "volume":17, ...}, "details": {...}}

# 单独调用前置过滤
filtered = StockScreener.pre_filter(candidates, min_market_cap=50e8)
```

#### 7. 辅助函数

```python
from data_provider.base import is_st_stock, is_kc_cy_stock

is_st_stock("*ST某某")   # True
is_kc_cy_stock("300750")  # True (创业板)
is_kc_cy_stock("688001")  # True (科创板)
is_kc_cy_stock("603659")  # False (主板)
```

## 常见陷阱

### ❌ 错误用法

```python
# 1. 使用不存在的类
from data_provider.base import UnifiedDataProvider  # ❌ 不存在

# 2. 使用错误的属性名
quote.current  # ❌ 应该用 quote.price

# 3. 未处理 None 值
amount_in_yi = quote.amount / 100000000  # ❌ amount 可能为 None
```

### ✅ 正确用法

```python
from data_provider.base import DataFetcherManager

manager = DataFetcherManager()
quote = manager.get_realtime_quote('600519')

# 安全访问可能为 None 的字段
amount_str = f'{quote.amount/100000000:.2f}亿' if quote.amount else '无'
```

### ⚠️ ETF/基金实时行情限制

ETF基金代码（如 518800 黄金基金）调用 `get_realtime_quote()` 可能返回 `None`。此时应使用日线数据替代：

```python
# ETF 实时行情可能无数据
quote = manager.get_realtime_quote('518800')  # 可能返回 None

# 改用日线数据获取最新价格
df, source = manager.get_daily_data('518800', days=5)
if df is not None and not df.empty:
    latest = df.iloc[-1]
    price = latest['close']
```

## 数据源架构

项目使用策略模式 + 自动故障切换：
- 优先级：Efinance → Akshare → Pytdx → Tushare → Baostock → Yfinance
- 单个数据源失败会自动切换到下一个
- 有熔断机制，连续失败会暂时跳过该数据源

## 🚀 批量行情快速路径（盘中分析必备）

**核心经验**：`manager.get_realtime_quote(code)` 是单只调用；当 efinance 的腾讯/新浪上游挂掉时会降级到 akshare 单票扫描，**单只可能耗时 5-15 分钟**。盘中批量分析持仓+候选股时，**不要循环调用** `get_realtime_quote`。

### 推荐路径（按速度排序）

| 场景 | 推荐接口 | 耗时 | 备注 |
|------|----------|------|------|
| 10-50 只特定股票实时行情 | `efinance.stock.get_latest_quote(codes_list)` | **秒级** | 返回 DataFrame，索引列名是 `代码`（**不是 `股票代码`**） |
| 全 A 快照（5000+只） | `akshare.stock_zh_a_spot_em()` | **~5 分钟**（58 批 × 5s） | 稳但慢，适合开盘前/收盘后全量扫描 |
| ETF 批量快照 | `akshare.fund_etf_spot_em()` | ~2-3 分钟 | 同上 |
| 1-3 只股票 | `manager.get_realtime_quote(code)` | 1-30 秒 | 走完整降级链 |

### efinance 批量接口用法

```python
import efinance as ef

codes = ['600096', '002064', '603605', '002415', '518800']  # 混合A股+ETF
df = ef.stock.get_latest_quote(codes)  # 秒级返回

# 关键列：代码、名称、最新价、涨跌幅、涨跌额、最高、最低、今开、
#        量比、换手率、成交量、成交额、昨日收盘、总市值、流通市值

df = df.set_index('代码')  # ⚠️ 注意是 '代码'，不是 '股票代码'
for code in codes:
    row = df.loc[code]
    print(f"{row['名称']}: {row['最新价']} {row['涨跌幅']:+.2f}%")
```

### 接口降级应对

**症状**：日志出现 `qt.gtimg.cn` 或 `hq.sinajs.cn` `RemoteDisconnected` / `ReadTimeout`；或 `efinance` 报 `Expecting value: line 1 column 1`。

**行动**：
1. **不要对 `manager.get_realtime_quote` 加重试循环** — 降级链本身已在跑，重试只会放大延迟
2. 立即切换到 `ef.stock.get_latest_quote(codes_list)` 批量接口
3. 若 efinance 也不可用，尝试 `akshare.stock_zh_a_spot_em()`（慢但稳）
4. 最后降级：用 `manager.get_daily_data(code, days=5)` 取日 K 最后一条的 `close` 作为当前价（精度下降但能出结果）

### 何时不需要精确实时价

进行**五维评分**时，如果拿不到实时价，**直接用日K线最后一条的 close** 即可 — 评分框架主要依赖过去 30 日的均线/量价结构，当前价只影响 `bias10` 和 `dist_high30/low30` 三个细项，误差可接受。

```python
df, source = manager.get_daily_data(code, days=35)
price = float(df['close'].iloc[-1])  # 降级取日K收盘
score = StockScreener.score_five_dimensions(df, realtime_price=price)
```

## ⚠️ 五维评分的局限：板块突发爆发场景

`StockScreener.score_five_dimensions` 评分偏重**过去 30 日趋势延续性**，对「今日放量启动但过去 5 日下跌」的突发标的不友好。典型案例：

| 股票 | 今日涨幅 | 过去5日 | 五维分 | 真实信号 |
|------|---------|---------|--------|---------|
| 天齐锂业 | +8.65% | -6.84% | 24 | 板块龙头爆发 |
| 赣锋锂业 | +6.10% | -6.84% | 24 | 同上 |
| 盐湖股份 | +4.90% | -7.52% | 28 | 同上 |

这类标的评分会严重低于推荐阈值 60 分，但板块资金刚启动时反而是最佳介入点。**应对**：

- 严格按 skill 规则推荐（评分≥60）时，**主动标注"因过去 5 日跌幅导致评分偏低"**
- 给用户提供「保守派（按评分）」+「进取派（跟主线）」双方案，由用户决策
- 下次该股票评分更新（过去 5 日窗口滑过下跌区）后再正式进入推荐池

## 示例：获取市场概览

```python
from data_provider.base import DataFetcherManager

manager = DataFetcherManager()

# 指数
indices = manager.get_main_indices('cn')
for idx in indices[:3]:
    print(f"{idx['name']}: {idx['price']:.2f} ({idx['change_pct']:+.2f}%)")

# 市场统计
stats = manager.get_market_stats()
print(f"涨: {stats.get('up', 0)} 跌: {stats.get('down', 0)}")

# 板块排行
gainers, losers = manager.get_sector_rankings(5)
for s in gainers:
    print(f"{s['name']}: {s['change_pct']:+.2f}%")

# 个股行情
quote = manager.get_realtime_quote('600519')
print(f"{quote.name}: {quote.price:.2f} {quote.change_pct:+.2f}%")
```

## 相关文件

- `/Users/macpro/project/daily_stock_analysis/data_provider/base.py` - 核心管理器
- `/Users/macpro/project/daily_stock_analysis/data_provider/realtime_types.py` - 数据结构定义
- `/Users/macpro/project/daily_stock_analysis/src/services/stock_service.py` - 服务层封装
