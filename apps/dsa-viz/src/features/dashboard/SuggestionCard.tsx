import type { StopLossItem } from "@/lib/api/portfolio";

export function SuggestionCard({ item, onExecute }: { item: StopLossItem; onExecute: (s: StopLossItem) => void }) {
  const triggered = item.is_triggered;
  const actionLabel = triggered ? "建议清仓" : "建议减持";
  const badgeCls = triggered ? "bg-red-700" : "bg-amber-700";
  const reason = triggered
    ? `已触发止损：亏损 ${item.loss_pct.toFixed(2)}% ≥ ${item.near_threshold_pct.toFixed(2)}%`
    : `接近止损阈值：亏损 ${item.loss_pct.toFixed(2)}%（阈值 ${item.near_threshold_pct.toFixed(2)}%）`;

  return (
    <div className="rounded border border-slate-800 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-mono">{item.symbol}</span>
        <span className={`rounded px-2 py-0.5 text-xs ${badgeCls}`}>{actionLabel}</span>
      </div>
      <div className="text-sm text-slate-300">{reason}</div>
      <div className="text-xs text-slate-400">
        成本 {item.avg_cost.toFixed(2)} · 现价 {item.last_price.toFixed(2)}
      </div>
      <button className="rounded bg-blue-700 px-2 py-1 text-xs" onClick={() => onExecute(item)}>
        执行建议
      </button>
    </div>
  );
}
