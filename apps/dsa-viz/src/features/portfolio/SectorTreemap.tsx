import { useEffect, useRef, useMemo } from "react";
import { echarts } from "@/lib/charts/echartsBase";
import type { Position } from "@/lib/api/portfolio";

export function SectorTreemap({ positions }: { positions: Position[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const data = useMemo(() => {
    const byMarket = new Map<string, Position[]>();
    for (const p of positions) {
      const key = p.market ?? "未分类";
      byMarket.set(key, [...(byMarket.get(key) ?? []), p]);
    }
    return Array.from(byMarket.entries()).map(([market, items]) => ({
      name: market,
      value: items.reduce((s, p) => s + p.market_value_base, 0),
      children: items.map((p) => {
        const pnlPct = p.avg_cost > 0 ? (p.last_price - p.avg_cost) / p.avg_cost : 0;
        return {
          name: p.symbol,
          value: p.market_value_base,
          itemStyle: { color: pnlPct >= 0 ? "#ef4444" : "#10b981" },
        };
      }),
    }));
  }, [positions]);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption({ series: [{ type: "treemap", data, roam: false, breadcrumb: { show: false } }] });
    return () => chart.dispose();
  }, [data]);
  return <div ref={ref} className="h-72 w-full" />;
}
