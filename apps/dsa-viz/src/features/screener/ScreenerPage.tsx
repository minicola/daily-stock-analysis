import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { screenStocks, type ScreenResponse } from "@/lib/api/stocks";
import { ErrorPanel } from "@/components/ErrorPanel";
import { extractApiError } from "@/lib/api/client";

export function ScreenerPage() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    board_name: "人工智能",
    board_type: "concept" as "concept" | "industry",
    top_n: 10,
    min_score: 60,
    min_market_cap: 50,
    exclude_negative_pe: true,
  });
  const [result, setResult] = useState<ScreenResponse | null>(null);

  const run = useMutation({
    mutationFn: () => screenStocks({
      board_name: form.board_name.trim(),
      board_type: form.board_type,
      top_n: form.top_n,
      min_score: form.min_score,
      min_market_cap: form.min_market_cap > 0 ? form.min_market_cap * 1e8 : null,
      exclude_negative_pe: form.exclude_negative_pe,
    }),
    onSuccess: (d) => setResult(d),
  });

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">按板块筛选</h2>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <label className="block">板块/概念名
          <input className="w-full bg-slate-800 rounded px-2 py-1 mt-1" value={form.board_name} onChange={(e) => setForm({ ...form, board_name: e.target.value })} />
        </label>
        <label className="block">类型
          <select className="w-full bg-slate-800 rounded px-2 py-1 mt-1" value={form.board_type} onChange={(e) => setForm({ ...form, board_type: e.target.value as "concept" | "industry" })}>
            <option value="concept">概念</option>
            <option value="industry">行业</option>
          </select>
        </label>
        <label className="block">Top N
          <input type="number" className="w-full bg-slate-800 rounded px-2 py-1 mt-1" value={form.top_n} onChange={(e) => setForm({ ...form, top_n: Number(e.target.value) })} />
        </label>
        <label className="block">最低评分
          <input type="number" className="w-full bg-slate-800 rounded px-2 py-1 mt-1" value={form.min_score} onChange={(e) => setForm({ ...form, min_score: Number(e.target.value) })} />
        </label>
        <label className="block">最小市值（亿元，0=不限）
          <input type="number" className="w-full bg-slate-800 rounded px-2 py-1 mt-1" value={form.min_market_cap} onChange={(e) => setForm({ ...form, min_market_cap: Number(e.target.value) })} />
        </label>
        <label className="flex items-center gap-2 mt-5">
          <input type="checkbox" checked={form.exclude_negative_pe} onChange={(e) => setForm({ ...form, exclude_negative_pe: e.target.checked })} />
          排除负 PE
        </label>
      </div>
      <button className="rounded bg-blue-600 px-4 py-1 disabled:opacity-50" disabled={!form.board_name.trim() || run.isPending} onClick={() => run.mutate()}>
        {run.isPending ? "筛选中…" : "开始筛选"}
      </button>
      {run.isError && <ErrorPanel error={extractApiError(run.error)} />}
      {result && (
        <table className="w-full text-sm">
          <thead className="text-slate-400"><tr>{["代码", "名称", "价格", "涨跌幅", "评分", "PE", "市值(亿)", ""].map((h) => <th key={h} className="text-left px-2 py-1">{h}</th>)}</tr></thead>
          <tbody>
            {result.items.map((it) => (
              <tr key={it.code} className="hover:bg-slate-800">
                <td className="px-2 py-1 font-mono">{it.code}</td>
                <td className="px-2 py-1">{it.name}</td>
                <td className="px-2 py-1">{it.price.toFixed(2)}</td>
                <td className={`px-2 py-1 ${it.change_pct >= 0 ? "text-up" : "text-down"}`}>{(it.change_pct * 100).toFixed(2)}%</td>
                <td className="px-2 py-1">{it.score}</td>
                <td className="px-2 py-1">{it.pe_ratio?.toFixed(1) ?? "-"}</td>
                <td className="px-2 py-1">{it.total_mv ? (it.total_mv / 1e8).toFixed(1) : "-"}</td>
                <td className="px-2 py-1"><button className="text-blue-400" onClick={() => nav(`/market?code=${it.code}`)}>查看 K 线</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
