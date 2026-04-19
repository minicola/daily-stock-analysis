# DSA Viz — 桌面可视化插件应用 设计文档

- Status: Draft
- Date: 2026-04-19
- Owner: 冯宇翔 (yuxiangflll@gmail.com)
- Scope: 新增 `apps/dsa-viz/` 前端子应用，复用现有 `dsa-desktop` Electron 外壳和 `api/` FastAPI 后端，交付覆盖"每日盘前/盘中/盘后分析 + 持仓操作 + 决策录入"完整闭环的桌面可视化插件

## 1. 背景与目标

`daily_stock_analysis` 当前前端是 `apps/dsa-web/`（通用 Web UI，偏操作），`apps/dsa-desktop/` 是 Electron 外壳 + PyInstaller 打包的 Python 后端，加载的是 `dsa-web` 的 SPA。

本次新增的 DSA Viz 目标是：

1. 以"数据可视化"为核心，和 `dsa-web` 完全解耦的前端代码
2. 用户无需自行运行后端，复用 `dsa-desktop` 的 sidecar 打包能力，做到一键启动
3. 工作量最小化：不新增 Electron 项目、不迁移后端、不动 `dsa-web` 源码

非目标（MVP 显式不做）：

- 不实现 WebSocket 级实时推送（后端尚未提供）
- 不做用户研究级 UI 设计规范（仅沿用成熟图库视觉）
- 不承诺离线兜底虚构数据（遵循 `AGENTS.md` Data Integrity 硬规则，失败一律显示真实错误）

## 2. 需求范围（MVP）

五条主线，覆盖"每日盘前盘中盘后 → 分析 → 决策 → 录入 → 复盘"完整工作闭环：

### 2.0 每日仪表盘（Dashboard，`/viz/` 首页）
- **定位**：打开 app 即见，按当前时段自动切换三种形态
  - **盘前（< 09:30）**：昨收汇总 + 今日可能影响持仓的主题；每只持仓拉其最新分析结果摘要（无则 CTA"立即分析"）
  - **盘中（09:30–11:30、13:00–15:00）**：订阅 `GET /api/v1/analysis/stream`（SSE），展示实时任务事件；持仓今日涨跌 + 组合 KPI 实时刷新
  - **盘后（≥ 15:00）**：当日复盘——今日组合收益、跑赢/跑输基准、关键持仓异动
- **持仓操作建议卡片**（贯穿三个时段）
  - 数据源：`GET /api/v1/portfolio/risk-report` + 每只持仓的最新 `analysis`
  - 输出：四挡建议（加仓 / 减持 / 清仓 / 持有）+ 置信度 + 关键位 + 原因要点
  - 点击"执行建议"直接预填交易录入抽屉（见 2.2）
- **时段判定**
  - 默认按本机时区 `Asia/Shanghai` 分段；用户可手动切换时段视图
  - A 股节假日由后端 `analysis` 判断，前端不硬编码节假日表

### 2.1 行情图（Market）
- 入口：独立 `/viz/market`，或从仪表盘 / 组合明细 / 筛选器点击标的跳转
- 输入 6 位 A 股代码 / 港股（`hkXXXXX`）/ 美股代码
- 后端来源：`GET /api/v1/stocks/{code}/history`（K 线 / 历史）+ `GET /api/v1/stocks/{code}/quote`（实时报价）
- 图形：
  - 主图：日 K 线 + 均线 MA5/10/20/60，可切换周期（日/周/月）
  - 副图：成交量柱 + MACD + KDJ + RSI + 布林带 + ATR（切换面板）
  - 十字光标联动，Hover 显示 OHLCV 精确值
- 实现：**KLineChart**（K 线主图，专业程度优于 ECharts K 线）

### 2.2 组合维护（Portfolio，可操作）
- 后端来源：
  - 读：`GET /api/v1/portfolio/snapshot`、`GET /api/v1/portfolio/accounts`、`GET /api/v1/portfolio/trades`、`GET /api/v1/portfolio/risk-report`
  - 写：`POST /api/v1/portfolio/trades`（买/卖/清仓）、`DELETE /api/v1/portfolio/trades/{id}`
  - 辅助：`POST /api/v1/portfolio/cash-ledger`（现金流水）、`POST /api/v1/portfolio/corporate-actions`（分红/配股）、`POST /api/v1/portfolio/import/csv`（券商流水导入）
- 展示：
  - 头部 KPI：总市值 / 总盈亏 / 今日盈亏 / 持仓数量
  - 权重环形图（按市值占比，ECharts pie）
  - 行业分布 Treemap（颜色编码今日涨跌）
  - 贡献度柱状图（Top5 盈利 / Top5 亏损）
  - 明细表：代码、名称、成本、现价、市值、盈亏、盈亏比、权重；行右侧"建议"列来自 2.0 的建议卡
- 操作：
  - **交易录入抽屉**：方向（买入 / 卖出 / 清仓）、代码、股数（"清仓"快捷钮自动填当前持仓数）、价格、成交日期、费用（佣金/印花税/过户费可默认由后端推算，允许覆盖）、账户
  - **交易历史页**：按账户/代码/日期筛选，支持删除（调 `DELETE /portfolio/trades/{id}`）
  - **CSV 导入**：拖拽券商导出文件 → 调 `POST /portfolio/import/csv` 预览 → 确认 `POST /portfolio/import/csv/commit`
  - **现金流水 / 公司行动**：放高级折叠区，MVP 提供最小可用表单
- 交互：点击明细表任一标的 → 右侧抽屉打开该票的"行情图"模块复用

### 2.3 账户管理（Accounts）
- 后端来源：`POST /api/v1/portfolio/accounts`（已有）、`GET /api/v1/portfolio/accounts`（已有）、`PUT /api/v1/portfolio/accounts/{id}`（已有）、`DELETE /api/v1/portfolio/accounts/{id}`（已有）
- 入口：`/viz/settings/accounts`
- 功能：
  - 列表：账户名、类型、基础货币、创建时间、关联交易数
  - 新增：名称 + 类型 + 基础货币
  - 重命名：PUT 更新
  - 删除：二次确认；若该账户下有交易则后端将返回冲突错误，前端展示原文并提供"先删除交易"指引
- 与交易录入联动：录入抽屉的账户选择下拉实时刷新 `['portfolio', 'accounts']`
- 非目标（放 v0.2）：按账户筛选仪表盘 / 组合 KPI

### 2.4 股票筛选（Screener）
- **依赖后端追加一个新端点**（见 4.3.3），属纯追加式扩展，不改既有契约
- 入口：`/viz/screener`
- 筛选维度（MVP 取下列子集，以后端服务现有能力为准）：
  - 价量：价格区间、成交额门槛、换手率
  - 技术：MA 多空排列、MACD 金叉、RSI 区间
  - 基本面：市值、市盈率、所属行业
  - 范围限定：沪深/港股/美股、指数成份股
- 输出：结果列表（代码、名称、最新价、涨跌幅、命中的条件），每行"查看 K 线"跳 2.1、"加入组合"预填交易录入
- 结果缓存：React Query key `['screener', params]`，默认 5min
- 错误：直接展示后端错误原文

### 2.5 分析报告（Analysis）
- 后端来源：`POST /api/v1/analysis/start` + `GET /api/v1/analysis/{id}`（轮询）
- 展示：
  - 共振五维雷达图（趋势 / 动量 / 成交量 / 波动 / 情绪）
  - 结论卡片（买 / 持 / 卖 Badge + 置信度数值 + 关键位）
  - Markdown 正文按章节切成可折叠卡片（`react-markdown` + `remark-gfm`）
  - 任务状态：pending / running / done / failed（轮询间隔 2s，最长 5min 超时）
- 错误处理：任务失败显示后端返回的 `error_detail` 原文，不做兜底

## 3. 技术选型

### 3.1 前端栈（`apps/dsa-viz/`）
- 构建：Vite 5 + TypeScript 5
- 框架：React 18
- 样式：Tailwind CSS 3
- 图表：
  - K 线：**KLineChart 9.x**（按需引入指标插件）
  - 其余：**ECharts 5.x**（雷达 / Treemap / 环形 / 柱状）
- 状态：Zustand 4.x（轻量，只存全局 UI 状态，如当前选中标的、主题）
- 服务端状态：**React Query 5.x**（缓存 + 失败重试 + 状态机）
- 请求：Axios（统一拦截器做 token 注入与错误展开）
- Markdown：react-markdown + remark-gfm
- 路由：React Router 6
- 测试：Vitest + @testing-library/react + Playwright（smoke only）

### 3.2 与后端/壳的对接
- **不新建 Electron 项目**，沿用 `apps/dsa-desktop`
- **不迁移后端**，仅在 `api/app.py` 增加一段挂载
- **不改 `dsa-web`**，保持现状

## 4. 架构

### 4.1 运行形态

```
┌─────────────────────────────────────────────────────────────┐
│  apps/dsa-desktop/main.js  (Electron 主进程，复用)              │
│    1. spawn backend PyInstaller 可执行文件                     │
│    2. 等 /api/health OK                                      │
│    3. loadURL("http://127.0.0.1:{port}/viz/")  ← 改这 1 行    │
└────────────────────────────────┬────────────────────────────┘
                                 │ HTTP
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│  FastAPI (api/app.py)                                        │
│    /api/v1/*          ← 既有业务 API                          │
│    /assets/*          ← dsa-web 资源                         │
│    /{path}            ← dsa-web SPA 回退                     │
│    /viz/assets/*      ← 新增：dsa-viz 资源                   │
│    /viz/{path}        ← 新增：dsa-viz SPA 回退               │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 `apps/dsa-viz/` 目录结构

```
apps/dsa-viz/
├── package.json
├── tsconfig.json
├── vite.config.ts              # base: "/viz/"
├── tailwind.config.js
├── postcss.config.js
├── index.html
├── public/
├── src/
│   ├── main.tsx                # 入口
│   ├── App.tsx                 # 路由 + 布局
│   ├── app/
│   │   ├── routes.tsx          # 路由表
│   │   └── layout/             # 侧边栏、顶栏、抽屉
│   ├── features/
│   │   ├── dashboard/          # 每日仪表盘（首页）
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── SessionSwitcher.tsx   # 盘前/盘中/盘后
│   │   │   ├── LiveStream.tsx        # SSE 订阅 /analysis/stream
│   │   │   ├── SuggestionCard.tsx    # 加仓/减持/清仓/持有
│   │   │   └── hooks.ts              # useSession, useRiskReport
│   │   ├── market/             # 行情图
│   │   │   ├── MarketPage.tsx
│   │   │   ├── KLineCanvas.tsx # KLineChart 封装
│   │   │   ├── IndicatorTabs.tsx
│   │   │   └── hooks.ts        # useKlineQuery 等
│   │   ├── portfolio/          # 组合（展示 + 操作）
│   │   │   ├── PortfolioPage.tsx
│   │   │   ├── WeightRing.tsx
│   │   │   ├── SectorTreemap.tsx
│   │   │   ├── ContributionBar.tsx
│   │   │   ├── HoldingsTable.tsx
│   │   │   ├── TradeEntryDrawer.tsx  # 买/卖/清仓
│   │   │   ├── TradeHistoryPage.tsx
│   │   │   ├── CsvImportDialog.tsx
│   │   │   └── CashAndActions.tsx    # 现金流水 + 公司行动
│   │   ├── accounts/           # 账户 CRUD
│   │   │   ├── AccountsPage.tsx
│   │   │   ├── AccountForm.tsx
│   │   │   └── hooks.ts
│   │   ├── screener/           # 股票筛选
│   │   │   ├── ScreenerPage.tsx
│   │   │   ├── FilterForm.tsx
│   │   │   ├── ResultTable.tsx
│   │   │   └── hooks.ts
│   │   └── analysis/           # 分析报告
│   │       ├── AnalysisPage.tsx
│   │       ├── RadarScore.tsx
│   │       ├── ConclusionCard.tsx
│   │       └── ReportMarkdown.tsx
│   ├── lib/
│   │   ├── api/                # 后端客户端
│   │   │   ├── client.ts       # axios 实例 + 拦截器
│   │   │   ├── auth.ts
│   │   │   ├── stocks.ts       # kline / quote / screen
│   │   │   ├── portfolio.ts    # snapshot / trades / accounts / cash / corp-actions / csv / risk
│   │   │   └── analysis.ts
│   │   ├── charts/             # 图表封装（主题统一）
│   │   │   ├── kline.ts
│   │   │   └── echarts.ts
│   │   └── utils/
│   ├── components/             # 通用 UI
│   │   ├── Card.tsx
│   │   ├── KPI.tsx
│   │   ├── Drawer.tsx
│   │   ├── ErrorPanel.tsx      # 展示真实后端错误，含复制按钮
│   │   └── EmptyState.tsx
│   └── store/
│       ├── session.ts          # token、backendUrl
│       └── ui.ts               # 主题、选中标的
├── tests/
│   └── unit/                   # vitest
└── e2e/                        # Playwright
```

### 4.3 后端改动

本方案有两类后端改动，都遵循"追加式、不改既有契约"原则。

#### 4.3.1 静态挂载（纯追加）

`api/app.py` 追加：

```python
# 伪代码，实际落地时放在现有 dsa-web 挂载逻辑之后
viz_static = Path(__file__).parent.parent / "apps" / "dsa-viz" / "dist"
if viz_static.exists():
    viz_assets = viz_static / "assets"
    if viz_assets.exists():
        app.mount("/viz/assets", StaticFiles(directory=viz_assets), name="viz_assets")

    @app.get("/viz/{full_path:path}", include_in_schema=False)
    async def serve_viz(request: Request, full_path: str):
        # 非 API 子路径全部回退 index.html，支持 React Router
        candidate = viz_static / full_path
        if candidate.is_file():
            return FileResponse(candidate, media_type=mimetypes.guess_type(str(candidate))[0])
        return FileResponse(viz_static / "index.html")
```

`apps/dsa-desktop/main.js` 改动：

```js
// 默认加载 /viz/，可通过环境变量切回 /
const entryPath = process.env.DSA_DESKTOP_ENTRY === "web" ? "/" : "/viz/";
await mainWindow.loadURL(`http://127.0.0.1:${port}${entryPath}`);
```

**切回老 UI 的逃生通道保留**：设置 `DSA_DESKTOP_ENTRY=web` 即可。

#### 4.3.2 Electron 入口路径切换

`apps/dsa-desktop/main.js` 改一行 loadURL 目标路径（见上）。

#### 4.3.3 新增股票筛选端点（纯追加）

在 `api/v1/endpoints/stocks.py` 追加：

```python
# 伪代码：薄胶水，逻辑完全委托给现有服务
from src.services.stock_screener import StockScreener

@router.post(
    "/screen",
    response_model=StockScreenResponse,
    summary="多条件筛选股票",
)
def screen_stocks(request: StockScreenRequest) -> StockScreenResponse:
    screener = StockScreener()
    return screener.screen(request.model_dump())
```

约束：
- 请求/响应 schema 新增于 `api/v1/schemas/stocks.py`，不复用既有 schema
- 参数集以 `src/services/stock_screener.py` 当前能力为准，前端只取其子集
- 响应需包含：`total`、`items`（代码/名称/最新价/涨跌幅/命中条件列表）
- 不新增 `src/services/` 内任何逻辑；若筛选能力不足需单独 PR

### 4.4 PyInstaller / Electron 打包

- `dist/backend/stock_analysis/` PyInstaller 需把 `apps/dsa-viz/dist/` 作为 `--add-data` 打进去
- `apps/dsa-desktop/package.json` 的 `extraResources` 无需改（后端产物已包含 viz 资源）
- 新增 `scripts/build-dsa-viz.sh`：`cd apps/dsa-viz && npm ci && npm run build`
- `scripts/build-desktop*.{sh,ps1}` 先调 viz 构建再走既有流程

## 5. 数据流与错误处理

### 5.1 请求拦截
- `client.ts` 统一注入 `Authorization: Bearer {token}`，`backendUrl` 默认 `""`（同源）
- 401 → 清 token，跳到 `/viz/login`
- 5xx / 网络错误：**原样展示后端错误体**（`ErrorPanel` 组件，含"复制请求与响应"按钮），禁止降级显示占位数据

### 5.2 服务端状态
- React Query key 统一约定：`['kline', code, period]`、`['quote', code]`、`['portfolio', 'snapshot']`、`['portfolio', 'trades', filters]`、`['portfolio', 'accounts']`、`['portfolio', 'risk-report']`、`['screener', params]`、`['analysis', id]`
- 失败重试：K 线最多 1 次；分析任务不重试（轮询由我们自己的状态机处理）；交易类写操作不重试
- 缓存时效：K 线 30s、组合 snapshot 10s、risk-report 60s、分析结果 Infinity（任务完成后不失效）
- 写操作后端变更后显式 invalidate：
  - `create_trade` / `delete_trade` / `csv_import/commit` → invalidate `['portfolio', 'snapshot' | 'trades' | 'risk-report']`
  - `create_account` / `update_account` / `delete_account` → invalidate `['portfolio', 'accounts']`
  - `create_cash_ledger` / `create_corporate_action` → invalidate `['portfolio', 'snapshot']`

### 5.3 分析任务轮询
```
提交 → 保存 jobId → 轮询 2s/次 → status=done 停止 → 展示报告
               └─ 超过 5min 或 status=failed → 展示 error_detail
```

### 5.4 仪表盘实时流（SSE）
- 盘中视图挂载时订阅 `GET /api/v1/analysis/stream`
- 浏览器 `EventSource`，页面卸载或切换时段即断开
- 事件类型按后端契约渲染（任务开始 / 进度 / 结束 / 错误）
- 断线后 5s 退避重连，重连 3 次仍失败显示错误条并提供手动重连按钮

### 5.5 交易录入流程
```
打开抽屉 → 选方向 → 自动校验（卖出/清仓时校验当前持仓数） →
POST /portfolio/trades → 成功 → toast + invalidate → 关闭
                              └─ 400/409 → ErrorPanel 展示后端原文，表单保留
```
- 清仓操作 = 以"方向=卖出、股数=当前持仓数"提交，不新增端点

## 6. 认证与配置

- MVP 假设 `dsa-desktop` 内的 FastAPI 是本机同源，**不启用后端登录**（后端默认不强制鉴权；如项目启用了 `auth`，走 `/api/v1/auth/login` 同逻辑）
- 无后端地址配置界面（同源；如需切换远端，用环境变量 `VITE_API_BASE` 构建前注入）

## 7. 测试

### 7.1 单元
- `lib/api/*.ts` 用 msw 模拟后端；断言拦截器行为、错误透传
- 工具函数（指标计算如有 / 金额格式化 / 涨跌色映射）

### 7.2 组件
- `KPI`、`WeightRing`、`RadarScore`、`ErrorPanel` 的渲染和 snapshot

### 7.3 E2E（Playwright，smoke）
- 启动一个 mock FastAPI（或复用 msw-node），注入盘前/盘中/盘后不同响应
- 场景：
  - 进入 `/viz/` → 切换时段按钮可用 → 持仓建议卡片渲染
  - 进入 `/viz/market` → 输入 `600519` → K 线可见
  - 进入 `/viz/portfolio` → 打开交易录入抽屉 → 提交买入 → mock 返回 200 → 明细表新增一行
  - 交易录入后端返回 400 → `ErrorPanel` 展示原文
  - 进入 `/viz/settings/accounts` → 新增账户 → 列表可见；删除有交易的账户 → 冲突错误展示
  - 进入 `/viz/screener` → 提交筛选条件 → 结果表非空 → 点击一行跳转 `/viz/market`

**不测的内容**：实盘数据准确性（后端职责）、Electron 打包产物（由 `dsa-desktop` 既有流程覆盖）、SSE 事件具体内容（后端契约变化时更新 mock 即可）。

## 8. CI / 仓库配套

按 `AGENTS.md` 第 6 节"验证矩阵"：

- 修改 `apps/dsa-viz/**` 必须触发 `web-gate`
  - `.github/workflows/ci.yml` 里 `web-gate` 的 path filter 追加 `apps/dsa-viz/**`
  - 作业执行 `npm ci && npm run lint && npm run build`（在 `apps/dsa-viz/` 下）
- `docker-build` smoke 不需要引入 viz 构建产物（Docker 镜像走 API + dsa-web，不含 Electron）
- `ai-governance` 不受影响
- PR 描述需说明：是否动了 `api/app.py` 的挂载；是否改了 `dsa-desktop/main.js` 的 loadURL；是否改了打包脚本

## 9. 文档同步

按 `AGENTS.md` 第 1 节规则：

- `README.md`：入门章节追加 "Visual Desktop（Beta）"段落，说明 `DSA_DESKTOP_ENTRY=viz` 或默认加载 viz
- `docs/desktop-package.md`：补打包时 viz 构建前置步骤
- `docs/CHANGELOG.md`：`### Added` 追加 "feat: dsa-viz desktop visualization plugin"
- 英文/中文 README 都要同步；若一方未同步，PR 描述写明原因

## 10. 分期交付

### v0.1 MVP（本设计文档覆盖）
- 每日仪表盘（盘前/盘中/盘后三态 + 持仓建议卡）
- 行情图（K 线 + 指标）
- 组合维护（展示 + 交易录入 + CSV 导入 + 删除 + 现金流水/公司行动最小入口）
- 账户管理（新增 / 重命名 / 删除）
- 股票筛选（前端 UI + 新增 `POST /api/v1/stocks/screen` 后端端点）
- 分析报告（雷达 + 结论 + Markdown）
- 挂载到 `/viz/`；`dsa-desktop` 默认加载 viz
- macOS + Windows 打包走既有脚本验证

### v0.2
- 回测可视化（沿用 `POST /api/v1/backtest/*`）
- 市场全景（若后端需加端点，单独小 PR）
- 账户级 KPI 筛选（按账户切换仪表盘与组合）

### v0.3
- Agent 对话面板 + 图表内嵌
- 自选股 / 预警（需后端新增 watchlist / alerts 端点）
- 主题（暗色 / 明亮）切换
- 自动更新通道评估

## 11. 风险与缓解

| 风险 | 缓解 |
|---|---|
| KLineChart 生态/维护活跃度不足 | 实施前做一次 2h spike：跑通 K 线主图 + MA + 一个副图指标，验证够用 |
| 后端 `GET /api/v1/stocks/kline` 返回字段与 KLineChart 所需结构不匹配 | 在 `lib/api/stocks.ts` 做一层 DTO 映射；若后端缺字段，作为单独 PR 在 `api/` 追加，不改既有契约 |
| PyInstaller 体积进一步膨胀 | 仅将 `apps/dsa-viz/dist` 纳入 `--add-data`（已 gz 压缩），预计 <3MB 增量 |
| 用户切回老 UI 需求 | 环境变量 `DSA_DESKTOP_ENTRY=web` 一键切换 |
| 打包链断裂（viz 未构建） | `scripts/build-desktop*` 内置前置 `build-dsa-viz`；后端 FastAPI 挂载判断 `viz_static.exists()` 优雅降级为 404（不 crash） |

## 12. 未决项（实施前需确认或验证）

- [ ] `GET /api/v1/stocks/{code}/history` 请求/响应 schema 与 KLineChart 数据模型对齐情况
- [ ] `POST /api/v1/analysis/` 返回体是否包含"共振五维"分项评分；如无，是否要求后端扩展或在前端从 Markdown 正则提取
- [ ] `GET /api/v1/portfolio/snapshot` 是否返回行业分类字段；如无，是否在 `data_provider/` 补充
- [ ] `GET /api/v1/portfolio/risk-report` 的建议字段（建议动作、置信度、原因）是否已结构化；如仅输出 Markdown，前端需在 `lib/api/portfolio.ts` 做提取或要求后端补 structured 响应
- [ ] `GET /api/v1/analysis/stream` 的 SSE 事件 schema 和重连语义确认
- [ ] `POST /api/v1/portfolio/trades` 的必填字段（账户、费用、货币等）清单；前端是否允许账户默认值
- [ ] CSV 导入 preview/commit 的两段式流程具体接口；是否已有 staging token
- [ ] `POST /api/v1/stocks/screen` 新端点的请求 schema（筛选维度子集）与 `StockScreener` 服务参数映射
- [ ] `DELETE /api/v1/portfolio/accounts/{id}` 在存在关联交易时的冲突错误码与提示文案
- [ ] A 股时段判定是否需要后端提供 "是否开市 / 当前时段" 的单一接口，避免前端硬编码
- [ ] 是否需要在 `dsa-desktop` 窗口尺寸默认值上做调整（viz 以 1440×900 体验更佳）
- [ ] 打包产物命名是否需要区分 viz / web（例如 `Daily Stock Analysis Viz.dmg`），还是仍用同一个 AppID

## 13. 与仓库硬规则对齐自检

- [x] 遵循现有目录边界（`apps/` 新建平级子应用）
- [x] 不改现有 API 契约（仅追加静态挂载 + 追加新端点 `POST /stocks/screen`）
- [x] 不动 `dsa-web`
- [x] 新配置项（`DSA_DESKTOP_ENTRY`）将同步 `.env.example` 与 `docs/desktop-package.md`
- [x] commit message 英文、不加 `Co-Authored-By`
- [x] 不写死密钥、路径、模型名、端口
- [x] Data Integrity：失败一律显示真实错误，不伪造/不降级数据
- [x] 文档同步：`README.md` / `docs/CHANGELOG.md` / 英文 README / desktop-package.md
