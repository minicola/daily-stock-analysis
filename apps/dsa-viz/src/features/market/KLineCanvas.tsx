import { useEffect, useRef } from "react";
import { init, dispose, type Chart } from "klinecharts";
import type { Candle } from "@/lib/api/stocks";

type Props = {
  candles: Candle[];
  indicators: string[];
};

export function KLineCanvas({ candles, indicators }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const paneIdsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!ref.current) return;
    chartRef.current = init(ref.current);
    return () => {
      if (ref.current) dispose(ref.current);
      chartRef.current = null;
      paneIdsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    const data = candles.map((c) => ({
      timestamp: new Date(c.date).getTime(),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
    chartRef.current.applyNewData(data);
    paneIdsRef.current.forEach((paneId) => chartRef.current!.removeIndicator(paneId));
    paneIdsRef.current = [];
    indicators.forEach((name) => {
      const paneId = chartRef.current!.createIndicator(name);
      if (paneId) paneIdsRef.current.push(paneId);
    });
  }, [candles, indicators]);

  return <div ref={ref} className="h-[520px] w-full" />;
}
