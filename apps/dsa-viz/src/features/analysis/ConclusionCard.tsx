import type { AnalysisStatus } from "@/lib/api/analysis";

const LABEL: Record<string, { text: string; cls: string }> = {
  buy: { text: "买入", cls: "bg-red-700" },
  hold: { text: "持有", cls: "bg-slate-700" },
  sell: { text: "卖出", cls: "bg-green-700" },
};

export function ConclusionCard({ conclusion }: { conclusion: AnalysisStatus["conclusion"] }) {
  if (!conclusion) return null;
  const badge = LABEL[conclusion.action] ?? { text: conclusion.action, cls: "bg-slate-700" };
  return (
    <div className="rounded border border-slate-700 p-4 flex items-center gap-6">
      <span className={`rounded px-3 py-1 text-sm ${badge.cls}`}>{badge.text}</span>
      <span className="text-slate-300">置信度 {(conclusion.confidence * 100).toFixed(0)}%</span>
      {conclusion.key_levels && (
        <span className="text-slate-400 text-sm">
          支撑 {conclusion.key_levels.support ?? "-"} / 压力 {conclusion.key_levels.resistance ?? "-"}
        </span>
      )}
    </div>
  );
}
