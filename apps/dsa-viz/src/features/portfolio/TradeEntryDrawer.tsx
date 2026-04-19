import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Drawer } from "@/components/Drawer";
import { ErrorPanel } from "@/components/ErrorPanel";
import { extractApiError } from "@/lib/api/client";
import { createTrade, listAccounts, type Position } from "@/lib/api/portfolio";

type Props = {
  open: boolean;
  onClose: () => void;
  prefill?: Partial<{ code: string; side: "buy" | "sell"; shares: number; price: number }>;
  currentPosition?: Position | null;
};

export function TradeEntryDrawer({ open, onClose, prefill, currentPosition }: Props) {
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ["portfolio", "accounts"], queryFn: listAccounts });
  const [side, setSide] = useState<"buy" | "sell" | "liquidate">(prefill?.side ?? "buy");
  const [code, setCode] = useState(prefill?.code ?? "");
  const [shares, setShares] = useState(prefill?.shares ?? 100);
  const [price, setPrice] = useState(prefill?.price ?? 0);
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState<number | null>(null);
  const [fee, setFee] = useState<number | "">("");

  const mut = useMutation({
    mutationFn: async () => {
      const effectiveSide = side === "liquidate" ? "sell" : side;
      const effectiveShares = side === "liquidate" ? (currentPosition?.shares ?? shares) : shares;
      return createTrade({
        account_id: accountId!,
        code,
        side: effectiveSide,
        shares: effectiveShares,
        price,
        trade_date: tradeDate,
        fee: fee === "" ? undefined : Number(fee),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolio", "snapshot"] });
      qc.invalidateQueries({ queryKey: ["portfolio", "trades"] });
      qc.invalidateQueries({ queryKey: ["portfolio", "risk"] });
      onClose();
    },
  });

  const SIDE_LABEL = { buy: "买入", sell: "卖出", liquidate: "清仓" } as const;

  return (
    <Drawer open={open} onClose={onClose} title="录入交易">
      <div className="space-y-3 text-sm">
        <div className="flex gap-2">
          {(["buy", "sell", "liquidate"] as const).map((s) => (
            <button key={s} className={`rounded px-3 py-1 ${side === s ? "bg-blue-700" : "bg-slate-800"}`} onClick={() => setSide(s)}>
              {SIDE_LABEL[s]}
            </button>
          ))}
        </div>

        <label className="block">账户
          <select value={accountId ?? ""} onChange={(e) => setAccountId(Number(e.target.value) || null)} className="w-full bg-slate-800 rounded px-2 py-1 mt-1">
            <option value="">请选择</option>
            {accounts.data?.items.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>

        <label className="block">代码
          <input className="w-full bg-slate-800 rounded px-2 py-1 mt-1" value={code} onChange={(e) => setCode(e.target.value)} />
        </label>

        {side !== "liquidate" && (
          <label className="block">股数
            <input type="number" className="w-full bg-slate-800 rounded px-2 py-1 mt-1" value={shares} onChange={(e) => setShares(Number(e.target.value))} />
          </label>
        )}
        {side === "liquidate" && currentPosition && (
          <div className="text-slate-400">将以当前持仓 {currentPosition.shares} 股卖出</div>
        )}

        <label className="block">价格
          <input type="number" step="0.01" className="w-full bg-slate-800 rounded px-2 py-1 mt-1" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
        </label>

        <label className="block">日期
          <input type="date" className="w-full bg-slate-800 rounded px-2 py-1 mt-1" value={tradeDate} onChange={(e) => setTradeDate(e.target.value)} />
        </label>

        <label className="block">费用（可选）
          <input type="number" step="0.01" className="w-full bg-slate-800 rounded px-2 py-1 mt-1" value={fee} onChange={(e) => setFee(e.target.value === "" ? "" : Number(e.target.value))} />
        </label>

        {mut.isError && <ErrorPanel error={extractApiError(mut.error)} />}

        <button
          className="w-full rounded bg-blue-600 px-4 py-2 disabled:opacity-50"
          disabled={!accountId || !code || price <= 0 || mut.isPending}
          onClick={() => mut.mutate()}
        >
          {mut.isPending ? "提交中…" : "提交"}
        </button>
      </div>
    </Drawer>
  );
}
