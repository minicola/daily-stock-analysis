import { useEffect, useRef, useMemo } from "react";
import { echarts } from "@/lib/charts/echartsBase";
import type { Position } from "@/lib/api/portfolio";

export function SectorTreemap({ positions }: { positions: Position[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const data = useMemo(() => {
    const bySector = new Map<string, Position[]>();
    for (const p of positions) {
      const key = p.sector ?? "未分类";
      bySector.set(key, [...(bySector.get(key) ?? []), p]);
    }
    return Array.from(bySector.entries()).map(([sector, items]) => ({
      name: sector,
      value: items.reduce((s, p) => s + p.market_value, 0),
      children: items.map((p) => ({
        name: p.name ?? p.code,
        value: p.market_value,
        itemStyle: { color: p.pnl_pct >= 0 ? "#ef4444" : "#10b981" },
      })),
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
