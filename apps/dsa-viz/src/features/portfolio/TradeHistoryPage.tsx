import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteTrade, listTrades } from "@/lib/api/portfolio";
import { ErrorPanel } from "@/components/ErrorPanel";
import { extractApiError } from "@/lib/api/client";

export function TradeHistoryPage() {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const trades = useQuery({ queryKey: ["portfolio", "trades", { code }], queryFn: () => listTrades({ code: code || undefined }) });
  const del = useMutation({
    mutationFn: (id: number) => deleteTrade(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolio", "snapshot"] });
      qc.invalidateQueries({ queryKey: ["portfolio", "trades"] });
    },
  });

  return (
    <div className="space-y-3">
      <input className="bg-slate-800 rounded px-3 py-1" placeholder="按代码筛选" value={code} onChange={(e) => setCode(e.target.value)} />
      {trades.isError && <ErrorPanel error={extractApiError(trades.error)} />}
      {del.isError && <ErrorPanel error={extractApiError(del.error)} />}
      <table className="w-full text-sm">
        <thead className="text-slate-400">
          <tr>{["日期", "账户", "代码", "方向", "股数", "价格", ""].map((h) => <th key={h} className="text-left px-2 py-1">{h}</th>)}</tr>
        </thead>
        <tbody>
          {trades.data?.items.map((t) => (
            <tr key={t.id} className="hover:bg-slate-800">
              <td className="px-2 py-1">{t.trade_date}</td>
              <td className="px-2 py-1">{t.account_id}</td>
              <td className="px-2 py-1 font-mono">{t.code}</td>
              <td className="px-2 py-1">{t.side === "buy" ? "买入" : "卖出"}</td>
              <td className="px-2 py-1">{t.shares}</td>
              <td className="px-2 py-1">{t.price.toFixed(2)}</td>
              <td className="px-2 py-1">
                <button className="text-red-400" disabled={del.isPending} onClick={() => del.mutate(t.id)}>删除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
