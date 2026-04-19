import { useState } from "react";
import { KLineCanvas } from "./KLineCanvas";
import { useKlineQuery, useQuoteQuery } from "./hooks";
import { ErrorPanel } from "@/components/ErrorPanel";
import { extractApiError } from "@/lib/api/client";
import type { Period } from "@/lib/api/stocks";

const INDICATORS = ["MA", "VOL", "MACD", "KDJ", "RSI", "BOLL", "ATR"];

export function MarketPage() {
  const [code, setCode] = useState("600519");
  const [pending, setPending] = useState(code);
  const [period, setPeriod] = useState<Period>("daily");
  const [days, setDays] = useState(120);
  const [indicators, setIndicators] = useState(["MA", "VOL", "MACD"]);

  const kline = useKlineQuery(code, period, days);
  const quote = useQuoteQuery(code);

  const toggle = (name: string) =>
    setIndicators((prev) => (prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]));

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2 items-center"
        onSubmit={(e) => { e.preventDefault(); setCode(pending.trim()); }}
      >
        <input
          value={pending}
          onChange={(e) => setPending(e.target.value)}
          className="rounded bg-slate-800 px-3 py-1 w-40"
          placeholder="600519 / hk00700 / AAPL"
        />
        <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="bg-slate-800 rounded px-2 py-1">
          <option value="daily">日</option>
          <option value="weekly">周</option>
          <option value="monthly">月</option>
        </select>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="bg-slate-800 rounded px-2 py-1">
          {[30, 60, 120, 250, 365].map((d) => <option key={d} value={d}>{d} 天</option>)}
        </select>
        <button type="submit" className="rounded bg-blue-600 px-4 py-1">刷新</button>
      </form>

      {quote.data && (
        <div className="text-sm text-slate-300">
          {quote.data.stock_name ?? quote.data.stock_code} · 现价 {quote.data.current_price.toFixed(2)}
          {quote.data.change_percent != null && (
            <span className={quote.data.change_percent >= 0 ? "text-up ml-2" : "text-down ml-2"}>
              {quote.data.change_percent >= 0 ? "+" : ""}{quote.data.change_percent.toFixed(2)}%
            </span>
          )}
        </div>
      )}

      <div className="flex gap-2 text-xs">
        {INDICATORS.map((i) => (
          <button
            key={i}
            type="button"
            className={`rounded px-2 py-1 ${indicators.includes(i) ? "bg-blue-700" : "bg-slate-800"}`}
            onClick={() => toggle(i)}
          >{i}</button>
        ))}
      </div>

      {kline.isError && <ErrorPanel error={extractApiError(kline.error)} />}
      {kline.data && <KLineCanvas candles={kline.data.candles} indicators={indicators} />}
      {kline.isLoading && <div className="text-slate-400">加载中…</div>}
    </div>
  );
}
