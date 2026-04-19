export function KPI({ label, value, delta }: { label: string; value: string; delta?: number }) {
  const cls = delta === undefined ? "text-slate-200" : delta >= 0 ? "text-up" : "text-down";
  return (
    <div className="rounded border border-slate-800 p-3 min-w-32">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
