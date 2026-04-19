import { useEffect, useRef } from "react";
import { echarts } from "@/lib/charts/echartsBase";
import type { Position } from "@/lib/api/portfolio";

export function WeightRing({ positions }: { positions: Position[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption({
      tooltip: { trigger: "item" },
      series: [{
        type: "pie",
        radius: ["45%", "70%"],
        data: positions.map((p) => ({ name: p.name ?? p.code, value: p.market_value })),
      }],
    });
    return () => chart.dispose();
  }, [positions]);
  return <div ref={ref} className="h-72 w-full" />;
}
