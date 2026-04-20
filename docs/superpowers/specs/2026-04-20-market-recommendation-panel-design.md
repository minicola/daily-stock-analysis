# 市场时段推荐面板（上午盘 / 下午盘）设计

- 日期：2026-04-20
- 状态：设计已确认，待实现
- 范围：Web 前端 (`apps/dsa-web/`) + 后端 API (`api/v1/`) + 后端服务 (`src/services/`) + 后端 Schema (`src/schemas/`)
- 不在范围：数据库持久化、调度器、港股 / 美股、开盘前 / 收盘后时段、桌面端、AI 生成路径

## 1. 背景与目标

当前 Web 前端只支持单股分析和历史查看，没有展示面板化的"当日推荐"能力。仓库内已有 `.claude/skills/market-recommendation/SKILL.md` 描述了按时段推荐 3 只股票的产品形态，但它只面向 AI 会话触发，未落成 API / UI。

目标：在 HomePage 增加一个"今日推荐"抽屉，用户点击即可看到当前所处时段（上午盘或下午盘）的 3 只推荐股票，包含市场概览 + 五维评分 + 操作建议。生成机制为点击时实时计算，无 DB 持久化。

## 2. 关键决策摘要

| # | 决策 | 选择 | 理由 |
|---|---|---|---|
| 1 | 生成机制 | 点击时实时生成，无持久化 | 架构轻，响应 ~5–15s 可接受，无需调度与 DB |
| 2 | 时段范围 | 仅上午盘 + 下午盘 | 覆盖盘中关键两段；盘前盘后 YAGNI |
| 3 | UI 形态 | 右侧可折叠抽屉，不抢占主区 | 与现有单股分析互不干扰 |
| 4 | 结果缓存 | 浏览器 localStorage，同日同时段复用 | 避免重复请求，跨日 / 跨时段自然失效 |
| 5 | 后端实现 | 纯 Python 服务，复用 `StockScreener` + `DataFetcherManager` | 稳定、快、无需 AI Key |

## 3. 架构总览

```
HomePage 顶部按钮 📊 今日推荐
          │
          ▼
 RecommendationDrawer (抽屉)
          │
          ├─ SessionTabs (上午盘 / 下午盘，按 Asia/Shanghai 默认选中)
          │
          ├─ MarketOverviewBlock (指数 + 领涨板块)
          │
          └─ 3× RecommendationCard
                  │
 useMarketRecommendation hook ───►  localStorage (key: dsa:recommendation:{YYYY-MM-DD}:{session})
                  │
                  ▼
           POST /api/v1/market/recommendations {session}
                  │
                  ▼
   src/services/market_recommendation_service.py
                  │
                  ├─ DataFetcherManager.get_main_indices('cn')
                  ├─ DataFetcherManager.get_market_stats()
                  ├─ DataFetcherManager.get_sector_rankings(5)
                  └─ StockScreener.screen_from_sector(sector, top_n=5, min_score=60)
                         × 领涨板块前 3 → 合并去重 → 按评分降序取前 3
```

## 4. 后端设计

### 4.1 Schema — `src/schemas/market_recommendation.py`

```python
from typing import Literal
from pydantic import BaseModel

SessionLiteral = Literal["morning", "afternoon"]

class ScoreBreakdown(BaseModel):
    trend: int          # A 趋势强度 0–30
    volume_price: int   # B 量价配合 0–25
    kline: int          # C K 线形态 0–20
    space: int          # D 乖离与空间 0–15
    momentum: int       # E 动量状态 0–10
    divergence_deduction: int  # 背离扣分 ≤ 0
    total: int

class RecommendedStock(BaseModel):
    code: str
    name: str
    price: float
    change_pct: float
    score: int
    score_breakdown: ScoreBreakdown
    trend_summary: str           # 一句话均线/量价/K线判断
    operation: Literal["buy", "watch", "hold"]
    quantity: int                # 100 的整数倍
    cost_estimate: float         # 含手续费
    fee_estimate: float
    entry_hint: str              # 介入时机描述
    stop_loss: float
    target: float
    rationale: str               # 1–2 句推荐理由

class SectorEntry(BaseModel):
    name: str
    change_pct: float

class MarketOverview(BaseModel):
    sh_index_value: float
    sh_index_change_pct: float
    top_sectors: list[SectorEntry]      # len ≤ 3
    up_count: int
    down_count: int
    limit_up_count: int
    limit_down_count: int

class RecommendationResult(BaseModel):
    session: SessionLiteral
    generated_at: str                   # ISO8601 with +08:00
    overview: MarketOverview
    recommendations: list[RecommendedStock]  # len ≤ 3
    warnings: list[str]                 # 数据缺失提示、候选不足提示
    risk_notes: list[str]               # 固定风险提示文案
```

### 4.2 Service — `src/services/market_recommendation_service.py`

- 入口：`generate(session: SessionLiteral, *, now: datetime | None = None) -> RecommendationResult`
- 依赖注入：`DataFetcherManager`、`StockScreener`（便于测试 mock）
- 硬超时：整体 20 秒（靠 `concurrent.futures.Future.result(timeout=...)` 或每步设限）
- 流程：
  1. 取主要指数 → 组装 `sh_index_*`
  2. 取市场统计 → 涨跌家数、涨停跌停数
  3. 取板块排行前 5，保留领涨前 3
  4. 对前 3 领涨板块，各跑 `screen_from_sector(top_n=5, min_score=60)`
  5. 合并结果，按股票代码去重，按 `score` 降序取前 3
  6. 对入选 3 只计算操作建议：
     - 默认 `operation="buy"`；若当日涨幅 > 7% 且动量评分接近满分，改 `watch`
     - `quantity = max(100, floor(资金基准 / price / 100) * 100)`；资金基准读常量 `DEFAULT_POSITION_BUDGET = 10000`（不读环境，避免新增配置）
     - `stop_loss = price * 0.97`（-3%）、`target = price * 1.05`（+5%）— 占位阈值，后续可在实现阶段按回测微调，但 spec 锁定此默认
     - 费用：沿用 Skill 中的 `calc_buy_cost` 公式，字段 `fee_estimate` 仅返回佣金+过户费
  7. 生成 `warnings`：不足 3 只、单板块 API 失败、K 线缺失跳过等
  8. 固定 `risk_notes`：总仓位不超 30–40%、评分为概率判断非绝对预测
- 错误：
  - 指数或市场统计失败 → 抛 `MarketDataUnavailable` → API 层转 503
  - 所有板块筛选都 0 只 → 返回 `recommendations=[]` + warning，不抛异常（200）
  - 超时 → 抛 `RecommendationTimeout` → API 层转 504

### 4.3 API — `api/v1/endpoints/market_recommendation.py`

- `POST /api/v1/market/recommendations`
  - Body: `{"session": "morning" | "afternoon"}`
  - 200: `RecommendationResult`
  - 400: `{error_code: "INVALID_SESSION", message}`
  - 503: `{error_code: "DATA_SOURCE_UNAVAILABLE", message}`
  - 504: `{error_code: "TIMEOUT", message}`
- 挂到 `api/v1/endpoints/__init__.py` 的 router 列表
- 不做鉴权（与当前其他端点一致），保持项目一致性

## 5. 前端设计

### 5.1 目录

```
apps/dsa-web/src/
├─ api/recommendation.ts
├─ types/recommendation.ts
├─ hooks/useMarketRecommendation.ts
└─ components/recommendation/
   ├─ RecommendationDrawer.tsx
   ├─ SessionTabs.tsx
   ├─ MarketOverviewBlock.tsx
   ├─ RecommendationCard.tsx
   └─ __tests__/RecommendationDrawer.test.tsx
```

### 5.2 `useMarketRecommendation` hook

- 状态：`{ session, data, loading, error }`
- 方法：`openWithAutoSession()`, `switchSession(s)`, `regenerate()`, `close()`
- 时段判断（Asia/Shanghai）：
  - 现在 < 11:30 → `morning`
  - 其他 → `afternoon`（包含 11:30–13:00 的午间休市：默认让用户先看下午盘预判，可手动切回上午盘复盘）
- localStorage key：`dsa:recommendation:v1:{YYYY-MM-DD Asia/Shanghai}:{session}`
  - 版本号 `v1` 便于未来 Schema 变更强制失效
  - 日期用 Shanghai 时区算，避免凌晨跨日误判
- 缓存读写：
  - 读：drawer 打开或切换 tab 时命中即用，仅校验 key 匹配
  - 写：API 成功后写入
  - `regenerate()` 直接 `removeItem` 当前 key 再请求
- 非交易日：前端根据 `Date().getDay()` 在 Asia/Shanghai 判断 0、6 为周末不请求，改展示提示；法定假日不在本期处理（Skill 文档也未覆盖）

### 5.3 RecommendationDrawer

- 触发：HomePage header 新按钮"📊 今日推荐"
- 展开：右侧滑入，宽度 `w-96 lg:w-[28rem]`，`Esc` 或点击遮罩关闭
- 内容区：
  - 顶部：标题 + 关闭按钮 + 生成时间 + "重新生成"按钮
  - `SessionTabs`：两个 Tab，高亮当前时段，另一个显示"（切换查看）"
  - `MarketOverviewBlock`：指数涨跌、涨跌家数、涨停家数、领涨板块 3 个
  - 推荐卡片列表：3 张 `RecommendationCard`
  - 底部：`risk_notes` 灰色小字
- 状态：
  - loading → `DashboardStateBlock` with "分析领涨板块…"
  - error → `ApiErrorAlert` + 重试按钮
  - warnings → 黄色提示条置顶
  - 非交易日 → 灰色占位"今日非交易日，暂无实时推荐"

### 5.4 RecommendationCard

字段布局（从上到下）：
1. 股票名（加粗）+ 代码 + 当前价 + 涨跌幅（涨绿跌红，遵循 A 股习惯）
2. 五维评分总分 + 星级；悬停展示五维拆分
3. 趋势一句话摘要 `trend_summary`
4. 操作建议块：操作 / 建议手数 / 所需资金 / 介入时机 / 止损 / 目标
5. 推荐理由 `rationale`

### 5.5 HomePage 改动

- 顶部 header 右侧（现有"分析"按钮左侧）加一个按钮组件
- 新增 `<RecommendationDrawer />` 作为兄弟节点，不影响现有 flex 布局
- 不动 sidebar、不动 HistoryList、不动报告展示区

## 6. 数据流

1. 点击按钮 → drawer open → hook 根据 Shanghai 时间判定默认 session
2. 读 localStorage → 命中直接渲染（无 loading）
3. 未命中 → `POST /api/v1/market/recommendations` + loading
4. 成功 → 写 localStorage → 渲染
5. 切换 Tab → 重复 2–4（另一个 key）
6. "重新生成" → 清当前 key → 强制请求

## 7. 错误与降级

| 场景 | 后端行为 | 前端展示 |
|---|---|---|
| 非交易日（周末） | 不被调用 | "今日非交易日，暂无实时推荐" |
| 指数/统计数据源失败 | 503 DATA_SOURCE_UNAVAILABLE | ApiErrorAlert + 重试 |
| 单板块筛选失败 | 跳过 + warnings | 黄色提示条 |
| 候选不足 3 只 | 200，len<3 + warnings | 渲染实际条数 + 提示 |
| 整体超时 | 504 TIMEOUT | "生成超时，请重试" |
| 单股 K 线缺失 | 跳过该股 + warnings | 黄色提示条 |

## 8. 测试

- 后端：
  - `tests/services/test_market_recommendation_service.py`
    - mock `DataFetcherManager` + `StockScreener`
    - 覆盖：正常 3 板块合并去重；板块 2 失败仍能出结果；全部 0 只返回空 + warnings；超时抛 `RecommendationTimeout`
  - `tests/api/test_market_recommendation_endpoint.py`
    - session 参数校验；错误码映射；成功路径 JSON Schema
  - 统一用 `pytest -m "not network"`
- 前端：
  - `apps/dsa-web/src/hooks/useMarketRecommendation.test.ts`
    - 缓存命中；跨日失效；跨 session 隔离；时段自动判断边界（11:29 vs 11:30）
  - `apps/dsa-web/src/components/recommendation/__tests__/RecommendationDrawer.test.tsx`
    - open/close；Tab 切换；loading；error；warnings；非交易日
- 验证命令：
  - `./scripts/ci_gate.sh`
  - `cd apps/dsa-web && npm run lint && npm run build`

## 9. 对现有代码的影响

- 不修改：`main.py`、`server.py`、`bot/`、桌面端、现有端点、历史流程
- 新增：上述后端和前端文件
- 修改：
  - `api/v1/endpoints/__init__.py` 注册新 router
  - `apps/dsa-web/src/pages/HomePage.tsx` 添加按钮 + 抽屉
- 不需要新增环境变量、不需要改 `.env.example`、不需要改 Docker / CI
- 文档：README 可选加一段"今日推荐"面板说明；`docs/CHANGELOG.md` 追加条目

## 10. YAGNI 明确排除

- 数据库持久化、历史推荐回看
- 推荐生成调度器
- 开盘前（9:00–9:30）与收盘后（15:00 后）时段
- 港股 / 美股推荐
- AI / Skill 路径（后端）
- 桌面端同步
- 多语言（本期中文一版）

## 11. 回滚方式

- 前端：移除 HomePage 按钮与抽屉节点即可关闭入口；localStorage 旧数据随 `v1` 键名自然隔离
- 后端：API 无外部消费者，删除路由 / 服务 / Schema 文件即可
- 不影响既有分析流程

## 12. 风险点

- `StockScreener.screen_from_sector` 依赖板块成分股 API，网络限流时可能单板块全失败。缓解：3 板块并行，任一成功即降级产出 `< 3` 推荐并提 warning
- `DataFetcherManager.get_main_indices('cn')` 字段是 `current` 不是 `price`，实现时注意对齐 Skill 文档
- 实时行情在盘中波动较大，相同 session 多次生成可能结果不同；本设计用 localStorage 缓存避免用户困惑
- localStorage 容量：每条结果 ~5KB，单日 ≤ 2 条，无容量风险
