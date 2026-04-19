import { useState, useMemo } from "react";
import { KPI } from "@/components/KPI";
import { ErrorPanel } from "@/components/ErrorPanel";
import { extractApiError } from "@/lib/api/client";
import { SuggestionCard } from "./SuggestionCard";
import { LiveStream } from "./LiveStream";
import { detectSession, useRiskReport, useSnapshot, type Session } from "./hooks";
import { TradeEntryDrawer } from "@/features/portfolio/TradeEntryDrawer";
import type { StopLossItem } from "@/lib/api/portfolio";

const LABEL: Record<Session, string> = { pre: "盘前", intra: "盘中", post: "盘后" };

export function DashboardPage() {
  const [session, setSession] = useState<Session>(detectSession());
  const snap = useSnapshot();
  const risk = useRiskReport();
  const [drawer, setDrawer] = useState<{ open: boolean; prefill: StopLossItem | null }>({ open: false, prefill: null });

  const positions = useMemo(() => snap.data?.accounts.flatMap((a) => a.positions) ?? [], [snap.data]);
  const currentPosition = useMemo(() => {
    if (!drawer.prefill) return null;
    return positions.find((p) => p.symbol === drawer.prefill!.symbol) ?? null;
  }, [drawer.prefill, positions]);

  const stopLossItems = risk.data?.stop_loss.items ?? [];
  const onExecute = (item: StopLossItem) => setDrawer({ open: true, prefill: item });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["pre", "intra", "post"] as Session[]).map((s) => (
          <button key={s} className={`rounded px-3 py-1 text-sm ${session === s ? "bg-blue-700" : "bg-slate-800"}`} onClick={() => setSession(s)}>
            {LABEL[s]}
          </button>
        ))}
      </div>

      {snap.isError && <ErrorPanel error={extractApiError(snap.error)} />}
      {snap.data && (
        <div className="flex gap-2">
          <KPI label="总市值" value={snap.data.total_market_value.toFixed(2)} />
          <KPI label="浮动盈亏" value={snap.data.unrealized_pnl.toFixed(2)} delta={snap.data.unrealized_pnl} />
          <KPI label="账户数" value={String(snap.data.account_count)} />
          <KPI label="持仓数" value={String(positions.length)} />
        </div>
      )}

      {risk.isError && <ErrorPanel error={extractApiError(risk.error)} />}
      {risk.data && stopLossItems.length > 0 && (
        <>
          <h3 className="text-sm text-slate-300 pt-2">持仓风险提示（止损）</h3>
          <div className="grid grid-cols-2 gap-3">
            {stopLossItems.map((item) => (
              <SuggestionCard key={`${item.account_id}-${item.symbol}`} item={item} onExecute={onExecute} />
            ))}
          </div>
        </>
      )}
      {risk.data && stopLossItems.length === 0 && (
        <div className="text-sm text-slate-500">暂无止损预警</div>
      )}

      {session === "intra" && <LiveStream enabled />}

      <TradeEntryDrawer
        open={drawer.open}
        onClose={() => setDrawer({ open: false, prefill: null })}
        prefill={drawer.prefill ? { symbol: drawer.prefill.symbol, side: "sell" } : undefined}
        currentPosition={currentPosition}
      />
    </div>
  );
}
