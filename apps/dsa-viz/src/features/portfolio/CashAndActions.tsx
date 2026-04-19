import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createCashLedger, createCorporateAction } from "@/lib/api/portfolio";
import { ErrorPanel } from "@/components/ErrorPanel";
import { extractApiError } from "@/lib/api/client";

export function CashAndActions() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [cashForm, setCashForm] = useState({ account_id: 1, direction: "in" as "in" | "out", amount: 0, date: new Date().toISOString().slice(0, 10) });
  const [actionForm, setActionForm] = useState({ code: "", action_type: "dividend", amount: 0, date: new Date().toISOString().slice(0, 10) });

  const cashMut = useMutation({ mutationFn: () => createCashLedger(cashForm), onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolio", "snapshot"] }) });
  const actMut = useMutation({ mutationFn: () => createCorporateAction(actionForm), onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolio", "snapshot"] }) });

  return (
    <details className="rounded border border-slate-800 p-3" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-slate-300">高级：现金流水 / 公司行动</summary>
      <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
        <div className="space-y-2">
          <h4 className="text-slate-400">现金流水</h4>
          <input type="number" placeholder="账户 ID" className="w-full bg-slate-800 rounded px-2 py-1" value={cashForm.account_id} onChange={(e) => setCashForm({ ...cashForm, account_id: Number(e.target.value) })} />
          <select className="w-full bg-slate-800 rounded px-2 py-1" value={cashForm.direction} onChange={(e) => setCashForm({ ...cashForm, direction: e.target.value as "in" | "out" })}>
            <option value="in">入金</option><option value="out">出金</option>
          </select>
          <input type="number" step="0.01" placeholder="金额" className="w-full bg-slate-800 rounded px-2 py-1" value={cashForm.amount} onChange={(e) => setCashForm({ ...cashForm, amount: Number(e.target.value) })} />
          <input type="date" className="w-full bg-slate-800 rounded px-2 py-1" value={cashForm.date} onChange={(e) => setCashForm({ ...cashForm, date: e.target.value })} />
          <button className="rounded bg-blue-600 px-3 py-1" disabled={cashMut.isPending} onClick={() => cashMut.mutate()}>提交</button>
          {cashMut.isError && <ErrorPanel error={extractApiError(cashMut.error)} />}
        </div>
        <div className="space-y-2">
          <h4 className="text-slate-400">公司行动</h4>
          <input placeholder="代码" className="w-full bg-slate-800 rounded px-2 py-1" value={actionForm.code} onChange={(e) => setActionForm({ ...actionForm, code: e.target.value })} />
          <select className="w-full bg-slate-800 rounded px-2 py-1" value={actionForm.action_type} onChange={(e) => setActionForm({ ...actionForm, action_type: e.target.value })}>
            <option value="dividend">分红</option>
            <option value="split">拆股</option>
            <option value="rights">配股</option>
          </select>
          <input type="number" step="0.01" placeholder="金额/系数" className="w-full bg-slate-800 rounded px-2 py-1" value={actionForm.amount} onChange={(e) => setActionForm({ ...actionForm, amount: Number(e.target.value) })} />
          <input type="date" className="w-full bg-slate-800 rounded px-2 py-1" value={actionForm.date} onChange={(e) => setActionForm({ ...actionForm, date: e.target.value })} />
          <button className="rounded bg-blue-600 px-3 py-1" disabled={actMut.isPending} onClick={() => actMut.mutate()}>提交</button>
          {actMut.isError && <ErrorPanel error={extractApiError(actMut.error)} />}
        </div>
      </div>
    </details>
  );
}
