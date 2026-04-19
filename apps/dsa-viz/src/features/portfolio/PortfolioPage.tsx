import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSnapshot, type Position } from "@/lib/api/portfolio";
import { KPI } from "@/components/KPI";
import { WeightRing } from "./WeightRing";
import { SectorTreemap } from "./SectorTreemap";
import { ContributionBar } from "./ContributionBar";
import { HoldingsTable } from "./HoldingsTable";
import { ErrorPanel } from "@/components/ErrorPanel";
import { extractApiError } from "@/lib/api/client";
import { TradeEntryDrawer } from "./TradeEntryDrawer";
import { CsvImportDialog } from "./CsvImportDialog";
import { CashAndActions } from "./CashAndActions";

export function PortfolioPage() {
  const snap = useQuery({ queryKey: ["portfolio", "snapshot"], queryFn: () => getSnapshot(), staleTime: 10_000 });
  const [drawer, setDrawer] = useState<{ open: boolean; position: Position | null }>({ open: false, position: null });
  const [csvOpen, setCsvOpen] = useState(false);

  const positions: Position[] = useMemo(() => {
    return snap.data?.accounts.flatMap((a) => a.positions) ?? [];
  }, [snap.data]);

  if (snap.isError) return <ErrorPanel error={extractApiError(snap.error)} />;
  if (!snap.data) return <div className="text-slate-400">加载中…</div>;
  const { total_market_value, total_equity, unrealized_pnl, account_count } = snap.data;

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <a href="/viz/portfolio/trades" className="rounded bg-slate-800 px-3 py-1 text-sm">交易历史</a>
        <button className="rounded bg-slate-800 px-3 py-1 text-sm" onClick={() => setCsvOpen(true)}>CSV 导入</button>
        <button className="rounded bg-blue-600 px-4 py-1 text-sm" onClick={() => setDrawer({ open: true, position: null })}>录入交易</button>
      </div>
      <div className="flex gap-2">
        <KPI label="总市值" value={total_market_value.toFixed(2)} />
        <KPI label="总权益" value={total_equity.toFixed(2)} />
        <KPI label="浮动盈亏" value={unrealized_pnl.toFixed(2)} delta={unrealized_pnl} />
        <KPI label="账户数" value={String(account_count)} />
        <KPI label="持仓数" value={String(positions.length)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded border border-slate-800 p-2"><WeightRing positions={positions} /></div>
        <div className="rounded border border-slate-800 p-2 col-span-2"><SectorTreemap positions={positions} /></div>
      </div>
      <div className="rounded border border-slate-800 p-2"><ContributionBar positions={positions} /></div>
      <div className="rounded border border-slate-800 p-3">
        <HoldingsTable positions={positions} totalMarketValue={total_market_value} onSelect={(p) => setDrawer({ open: true, position: p })} />
      </div>
      <CashAndActions />
      <TradeEntryDrawer
        open={drawer.open}
        onClose={() => setDrawer({ open: false, position: null })}
        prefill={drawer.position ? { symbol: drawer.position.symbol, side: "sell" } : undefined}
        currentPosition={drawer.position}
      />
      <CsvImportDialog open={csvOpen} onClose={() => setCsvOpen(false)} />
    </div>
  );
}
