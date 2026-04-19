import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "./layout/AppShell";

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <AppShell />,
      children: [
        { index: true, lazy: () => import("@/features/dashboard/DashboardPage").then((m) => ({ Component: m.DashboardPage })) },
        { path: "market", lazy: () => import("@/features/market/MarketPage").then((m) => ({ Component: m.MarketPage })) },
        { path: "portfolio", lazy: () => import("@/features/portfolio/PortfolioPage").then((m) => ({ Component: m.PortfolioPage })) },
        { path: "portfolio/trades", lazy: () => import("@/features/portfolio/TradeHistoryPage").then((m) => ({ Component: m.TradeHistoryPage })) },
        { path: "screener", lazy: () => import("@/features/screener/ScreenerPage").then((m) => ({ Component: m.ScreenerPage })) },
        { path: "analysis", lazy: () => import("@/features/analysis/AnalysisPage").then((m) => ({ Component: m.AnalysisPage })) },
        { path: "settings/accounts", lazy: () => import("@/features/accounts/AccountsPage").then((m) => ({ Component: m.AccountsPage })) },
      ],
    },
  ],
  { basename: "/viz" }
);
