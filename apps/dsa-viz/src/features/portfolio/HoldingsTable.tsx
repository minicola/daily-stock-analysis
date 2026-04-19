import type { Position } from "@/lib/api/portfolio";

export function HoldingsTable({ positions, onSelect }: { positions: Position[]; onSelect?: (p: Position) => void }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-slate-400">
        <tr>
          {["代码", "名称", "股数", "成本", "现价", "市值", "盈亏", "盈亏%", "权重%"].map((h) => (
            <th key={h} className="text-left px-2 py-1">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {positions.map((p) => (
          <tr key={p.code} className="hover:bg-slate-800 cursor-pointer" onClick={() => onSelect?.(p)}>
            <td className="px-2 py-1 font-mono">{p.code}</td>
            <td className="px-2 py-1">{p.name}</td>
            <td className="px-2 py-1">{p.shares}</td>
            <td className="px-2 py-1">{p.cost.toFixed(2)}</td>
            <td className="px-2 py-1">{p.price.toFixed(2)}</td>
            <td className="px-2 py-1">{p.market_value.toFixed(2)}</td>
            <td className={`px-2 py-1 ${p.pnl >= 0 ? "text-up" : "text-down"}`}>{p.pnl.toFixed(2)}</td>
            <td className={`px-2 py-1 ${p.pnl_pct >= 0 ? "text-up" : "text-down"}`}>{(p.pnl_pct * 100).toFixed(2)}</td>
            <td className="px-2 py-1">{(p.weight * 100).toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
