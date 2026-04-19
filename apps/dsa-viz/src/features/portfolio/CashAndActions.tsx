import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { createCashLedger, createCorporateAction, listAccounts } from "@/lib/api/portfolio";
import { ErrorPanel } from "@/components/ErrorPanel";
import { extractApiError } from "@/lib/api/client";

export function CashAndActions() {
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ["portfolio", "accounts"], queryFn: listAccounts });
  const [open, setOpen] = useState(false);
  const [cashForm, setCashForm] = useState({
    account_id: 0,
    direction: "in" as "in" | "out",
    amount: 0,
    event_date: new Date().toISOString().slice(0, 10),
  });
  const [actionForm, setActionForm] = useState({
    account_id: 0,
    symbol: "",
    action_type: "cash_dividend" as "cash_dividend" | "split_adjustment",
    amount: 0,
    effective_date: new Date().toISOString().slice(0, 10),
  });

  const cashMut = useMutation({
    mutationFn: () => createCashLedger({
      account_id: cashForm.account_id,
      direction: cashForm.direction,
      amount: cashForm.amount,
      event_date: cashForm.event_date,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolio", "snapshot"] }),
  });
  const actMut = useMutation({
    mutationFn: () => createCorporateAction({
      account_id: actionForm.account_id,
      symbol: actionForm.symbol,
      effective_date: actionForm.effective_date,
      action_type: actionForm.action_type,
      cash_dividend_per_share: actionForm.action_type === "cash_dividend" ? actionForm.amount : undefined,
      split_ratio: actionForm.action_type === "split_adjustment" ? actionForm.amount : undefined,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolio", "snapshot"] }),
  });

  return (
    <details className="rounded border border-slate-800 p-3" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-slate-300">高级：现金流水 / 公司行动</summary>
      <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
        <div className="space-y-2">
          <h4 className="text-slate-400">现金流水</h4>
          <select className="w-full bg-slate-800 rounded px-2 py-1" value={cashForm.account_id} onChange={(e) => setCashForm({ ...cashForm, account_id: Number(e.target.value) })}>
            <option value={0}>选择账户</option>
            {accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="w-full bg-slate-800 rounded px-2 py-1" value={cashForm.direction} onChange={(e) => setCashForm({ ...cashForm, direction: e.target.value as "in" | "out" })}>
            <option value="in">入金</option><option value="out">出金</option>
          </select>
          <input type="number" step="0.01" placeholder="金额" className="w-full bg-slate-800 rounded px-2 py-1" value={cashForm.amount} onChange={(e) => setCashForm({ ...cashForm, amount: Number(e.target.value) })} />
          <input type="date" className="w-full bg-slate-800 rounded px-2 py-1" value={cashForm.event_date} onChange={(e) => setCashForm({ ...cashForm, event_date: e.target.value })} />
          <button className="rounded bg-blue-600 px-3 py-1 disabled:opacity-50" disabled={!cashForm.account_id || cashForm.amount <= 0 || cashMut.isPending} onClick={() => cashMut.mutate()}>提交</button>
          {cashMut.isError && <ErrorPanel error={extractApiError(cashMut.error)} />}
        </div>
        <div className="space-y-2">
          <h4 className="text-slate-400">公司行动</h4>
          <select className="w-full bg-slate-800 rounded px-2 py-1" value={actionForm.account_id} onChange={(e) => setActionForm({ ...actionForm, account_id: Number(e.target.value) })}>
            <option value={0}>选择账户</option>
            {accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input placeholder="代码" className="w-full bg-slate-800 rounded px-2 py-1" value={actionForm.symbol} onChange={(e) => setActionForm({ ...actionForm, symbol: e.target.value })} />
          <select className="w-full bg-slate-800 rounded px-2 py-1" value={actionForm.action_type} onChange={(e) => setActionForm({ ...actionForm, action_type: e.target.value as "cash_dividend" | "split_adjustment" })}>
            <option value="cash_dividend">分红（每股现金）</option>
            <option value="split_adjustment">拆股（比例）</option>
          </select>
          <input type="number" step="0.0001" placeholder={actionForm.action_type === "cash_dividend" ? "每股现金" : "拆股比例"} className="w-full bg-slate-800 rounded px-2 py-1" value={actionForm.amount} onChange={(e) => setActionForm({ ...actionForm, amount: Number(e.target.value) })} />
          <input type="date" className="w-full bg-slate-800 rounded px-2 py-1" value={actionForm.effective_date} onChange={(e) => setActionForm({ ...actionForm, effective_date: e.target.value })} />
          <button className="rounded bg-blue-600 px-3 py-1 disabled:opacity-50" disabled={!actionForm.account_id || !actionForm.symbol || actionForm.amount <= 0 || actMut.isPending} onClick={() => actMut.mutate()}>提交</button>
          {actMut.isError && <ErrorPanel error={extractApiError(actMut.error)} />}
        </div>
      </div>
    </details>
  );
}
