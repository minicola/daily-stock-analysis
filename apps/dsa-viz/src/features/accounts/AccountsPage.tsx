import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAccount, deleteAccount, listAccounts, updateAccount, type Market } from "@/lib/api/portfolio";
import { ErrorPanel } from "@/components/ErrorPanel";
import { extractApiError } from "@/lib/api/client";

export function AccountsPage() {
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ["portfolio", "accounts"], queryFn: listAccounts });
  const [newName, setNewName] = useState("");
  const [newCurrency, setNewCurrency] = useState("CNY");
  const [newMarket, setNewMarket] = useState<Market>("cn");
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);

  const createMut = useMutation({
    mutationFn: () => createAccount({ name: newName, base_currency: newCurrency, market: newMarket }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["portfolio", "accounts"] }); setNewName(""); },
  });
  const updateMut = useMutation({
    mutationFn: (body: { id: number; name: string }) => updateAccount(body.id, { name: body.name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["portfolio", "accounts"] }); setEditing(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteAccount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolio", "accounts"] }),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">账户管理</h2>
      <div className="flex gap-2">
        <input placeholder="账户名称" className="bg-slate-800 rounded px-2 py-1" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <input placeholder="货币" className="bg-slate-800 rounded px-2 py-1 w-20" value={newCurrency} onChange={(e) => setNewCurrency(e.target.value)} />
        <select className="bg-slate-800 rounded px-2 py-1" value={newMarket} onChange={(e) => setNewMarket(e.target.value as Market)}>
          <option value="cn">A 股</option>
          <option value="hk">港股</option>
          <option value="us">美股</option>
        </select>
        <button className="rounded bg-blue-600 px-4 py-1 disabled:opacity-50" disabled={!newName || createMut.isPending} onClick={() => createMut.mutate()}>新增</button>
      </div>
      {createMut.isError && <ErrorPanel error={extractApiError(createMut.error)} />}
      {deleteMut.isError && <ErrorPanel error={extractApiError(deleteMut.error)} />}
      {updateMut.isError && <ErrorPanel error={extractApiError(updateMut.error)} />}
      <table className="w-full text-sm">
        <thead className="text-slate-400"><tr>{["名称", "市场", "货币", "券商", "状态", ""].map((h) => <th key={h} className="text-left px-2 py-1">{h}</th>)}</tr></thead>
        <tbody>
          {accounts.data?.map((a) => (
            <tr key={a.id} className="hover:bg-slate-800">
              <td className="px-2 py-1">
                {editing?.id === a.id ? (
                  <input className="bg-slate-800 rounded px-2 py-1" value={editing.name} onChange={(e) => setEditing({ id: a.id, name: e.target.value })} />
                ) : a.name}
              </td>
              <td className="px-2 py-1">{a.market}</td>
              <td className="px-2 py-1">{a.base_currency}</td>
              <td className="px-2 py-1">{a.broker ?? "-"}</td>
              <td className="px-2 py-1">{a.is_active ? "活跃" : "停用"}</td>
              <td className="px-2 py-1 space-x-2">
                {editing?.id === a.id ? (
                  <>
                    <button className="text-blue-400" onClick={() => updateMut.mutate({ id: a.id, name: editing.name })}>保存</button>
                    <button className="text-slate-400" onClick={() => setEditing(null)}>取消</button>
                  </>
                ) : (
                  <>
                    <button className="text-blue-400" onClick={() => setEditing({ id: a.id, name: a.name })}>编辑</button>
                    <button className="text-red-400" onClick={() => { if (confirm(`删除账户 ${a.name}?`)) deleteMut.mutate(a.id); }}>删除</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
