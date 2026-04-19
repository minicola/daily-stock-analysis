import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { csvImportCommit, csvImportParse, listAccounts, listCsvBrokers, type CsvParseResponse } from "@/lib/api/portfolio";
import { Drawer } from "@/components/Drawer";
import { ErrorPanel } from "@/components/ErrorPanel";
import { extractApiError } from "@/lib/api/client";

export function CsvImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const brokers = useQuery({ queryKey: ["csv", "brokers"], queryFn: listCsvBrokers, enabled: open });
  const accounts = useQuery({ queryKey: ["portfolio", "accounts"], queryFn: listAccounts, enabled: open });
  const [broker, setBroker] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [preview, setPreview] = useState<CsvParseResponse | null>(null);

  const previewMut = useMutation({
    mutationFn: () => csvImportParse(file!, broker),
    onSuccess: (data) => setPreview(data),
  });

  const commitMut = useMutation({
    mutationFn: () => csvImportCommit({ file: file!, broker, account_id: accountId!, dry_run: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      setPreview(null);
      setFile(null);
      onClose();
    },
  });

  return (
    <Drawer open={open} onClose={onClose} title="CSV 导入">
      <div className="space-y-3 text-sm">
        <select value={broker} onChange={(e) => setBroker(e.target.value)} className="w-full bg-slate-800 rounded px-2 py-1">
          <option value="">选择券商</option>
          {brokers.data?.map((b) => <option key={b.broker} value={b.broker}>{b.display_name ?? b.broker}</option>)}
        </select>
        <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button className="rounded bg-blue-600 px-4 py-1 disabled:opacity-50" disabled={!file || !broker || previewMut.isPending} onClick={() => previewMut.mutate()}>
          {previewMut.isPending ? "解析中…" : "解析预览"}
        </button>
        {previewMut.isError && <ErrorPanel error={extractApiError(previewMut.error)} />}
        {preview && (
          <>
            <div className="text-slate-300">解析 {preview.record_count} 条，跳过 {preview.skipped_count}，失败 {preview.error_count}</div>
            {preview.errors.length > 0 && (
              <ul className="text-xs text-red-300 list-disc pl-4 max-h-24 overflow-auto">
                {preview.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
            <select value={accountId ?? ""} onChange={(e) => setAccountId(Number(e.target.value) || null)} className="w-full bg-slate-800 rounded px-2 py-1">
              <option value="">选择目标账户</option>
              {accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button className="rounded bg-green-700 px-4 py-1 disabled:opacity-50" disabled={commitMut.isPending || !accountId} onClick={() => commitMut.mutate()}>
              {commitMut.isPending ? "导入中…" : "确认导入"}
            </button>
            {commitMut.isError && <ErrorPanel error={extractApiError(commitMut.error)} />}
          </>
        )}
      </div>
    </Drawer>
  );
}
