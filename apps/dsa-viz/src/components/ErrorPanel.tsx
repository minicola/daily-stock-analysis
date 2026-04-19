import type { ApiError } from "@/lib/api/errors";

export function ErrorPanel({ error }: { error: ApiError }) {
  const copyable = JSON.stringify(error, null, 2);
  return (
    <div className="rounded border border-red-800 bg-red-950/40 p-4 space-y-2 text-sm">
      <div className="flex gap-3 font-mono text-red-300">
        <span>{error.status}</span>
        <span>{error.code}</span>
        <span className="text-slate-400">{error.url}</span>
      </div>
      <div className="text-red-100">{error.message}</div>
      <button
        type="button"
        className="text-xs underline text-slate-400"
        onClick={() => navigator.clipboard.writeText(copyable)}
      >
        复制诊断信息
      </button>
    </div>
  );
}
