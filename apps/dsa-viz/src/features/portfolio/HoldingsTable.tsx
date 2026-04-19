import type { Position } from "@/lib/api/portfolio";

export function HoldingsTable({
  positions,
  totalMarketValue,
  onSelect,
}: {
  positions: Position[];
  totalMarketValue?: number;
  onSelect?: (p: Position) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="text-slate-400">
        <tr>
          {["代码", "股数", "成本", "现价", "市值", "盈亏", "盈亏%", "权重%"].map((h) => (
            <th key={h} className="text-left px-2 py-1">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {positions.map((p) => {
          const pnlPct = p.avg_cost > 0 ? (p.last_price - p.avg_cost) / p.avg_cost : 0;
          const weight = totalMarketValue && totalMarketValue > 0 ? p.market_value_base / totalMarketValue : 0;
          return (
            <tr key={`${p.symbol}-${p.market}`} className="hover:bg-slate-800 cursor-pointer" onClick={() => onSelect?.(p)}>
              <td className="px-2 py-1 font-mono">{p.symbol}</td>
              <td className="px-2 py-1">{p.quantity}</td>
              <td className="px-2 py-1">{p.avg_cost.toFixed(2)}</td>
              <td className="px-2 py-1">{p.last_price.toFixed(2)}</td>
              <td className="px-2 py-1">{p.market_value_base.toFixed(2)}</td>
              <td className={`px-2 py-1 ${p.unrealized_pnl_base >= 0 ? "text-up" : "text-down"}`}>{p.unrealized_pnl_base.toFixed(2)}</td>
              <td className={`px-2 py-1 ${pnlPct >= 0 ? "text-up" : "text-down"}`}>{(pnlPct * 100).toFixed(2)}</td>
              <td className="px-2 py-1">{(weight * 100).toFixed(1)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
