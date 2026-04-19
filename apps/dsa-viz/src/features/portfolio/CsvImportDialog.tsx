import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { csvImportCommit, csvImportPreview, listCsvBrokers } from "@/lib/api/portfolio";
import { Drawer } from "@/components/Drawer";
import { ErrorPanel } from "@/components/ErrorPanel";
import { extractApiError } from "@/lib/api/client";

type Preview = { token: string; items: Array<Record<string, unknown>> };

export function CsvImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const brokers = useQuery({ queryKey: ["csv", "brokers"], queryFn: listCsvBrokers, enabled: open });
  const [broker, setBroker] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const previewMut = useMutation({
    mutationFn: () => csvImportPreview(file!, broker),
    onSuccess: (data) => setPreview(data as Preview),
  });

  const commitMut = useMutation({
    mutationFn: () => csvImportCommit(preview!.token),
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
          {brokers.data?.brokers.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button className="rounded bg-blue-600 px-4 py-1 disabled:opacity-50" disabled={!file || !broker || previewMut.isPending} onClick={() => previewMut.mutate()}>
          {previewMut.isPending ? "解析中…" : "预览"}
        </button>
        {previewMut.isError && <ErrorPanel error={extractApiError(previewMut.error)} />}
        {preview && (
          <>
            <div className="text-slate-300">解析 {preview.items.length} 条记录</div>
            <button className="rounded bg-green-700 px-4 py-1" disabled={commitMut.isPending} onClick={() => commitMut.mutate()}>
              {commitMut.isPending ? "导入中…" : "确认导入"}
            </button>
            {commitMut.isError && <ErrorPanel error={extractApiError(commitMut.error)} />}
          </>
        )}
      </div>
    </Drawer>
  );
}
