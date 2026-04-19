import { useEffect, useRef } from "react";
import { echarts } from "@/lib/charts/echartsBase";
import type { Position } from "@/lib/api/portfolio";

export function ContributionBar({ positions }: { positions: Position[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const sorted = [...positions].sort((a, b) => b.unrealized_pnl_base - a.unrealized_pnl_base);
    const pick = [...sorted.slice(0, 5), ...sorted.slice(-5)];
    const chart = echarts.init(ref.current);
    chart.setOption({
      grid: { left: 80, right: 20, top: 20, bottom: 20 },
      xAxis: { type: "value" },
      yAxis: { type: "category", data: pick.map((p) => p.symbol) },
      series: [{
        type: "bar",
        data: pick.map((p) => ({ value: p.unrealized_pnl_base, itemStyle: { color: p.unrealized_pnl_base >= 0 ? "#ef4444" : "#10b981" } })),
      }],
    });
    return () => chart.dispose();
  }, [positions]);
  return <div ref={ref} className="h-72 w-full" />;
}
