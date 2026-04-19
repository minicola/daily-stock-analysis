import { useEffect, useRef } from "react";
import { echarts } from "@/lib/charts/echartsBase";

type Scores = { trend?: number; momentum?: number; volume?: number; volatility?: number; sentiment?: number };

const DIMS: Array<{ key: keyof Scores; label: string }> = [
  { key: "trend", label: "趋势" },
  { key: "momentum", label: "动量" },
  { key: "volume", label: "成交量" },
  { key: "volatility", label: "波动" },
  { key: "sentiment", label: "情绪" },
];

export function RadarScore({ scores }: { scores: Scores }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption({
      radar: {
        indicator: DIMS.map((d) => ({ name: d.label, max: 100 })),
      },
      series: [{
        type: "radar",
        data: [{ value: DIMS.map((d) => scores[d.key] ?? 0), name: "评分" }],
      }],
    });
    return () => chart.dispose();
  }, [scores]);
  return <div ref={ref} className="h-72 w-full" />;
}
