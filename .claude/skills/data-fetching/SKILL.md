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
