import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { triggerAnalysis, getAnalysisStatus } from "@/lib/api/analysis";
import { RadarScore } from "./RadarScore";
import { ConclusionCard } from "./ConclusionCard";
import { ReportMarkdown } from "./ReportMarkdown";
import { ErrorPanel } from "@/components/ErrorPanel";
import { extractApiError } from "@/lib/api/client";

const MAX_MS = 5 * 60_000;

export function AnalysisPage() {
  const [code, setCode] = useState("600519");
  const [taskId, setTaskId] = useState<string | null>(null);
  const startedAt = useRef<number>(0);

  const start = useMutation({
    mutationFn: () => triggerAnalysis({ stock_codes: [code], async_mode: true }),
    onSuccess: (res) => {
      startedAt.current = Date.now();
      setTaskId(res.task_id);
    },
  });

  const poll = useQuery({
    queryKey: ["analysis", taskId],
    queryFn: () => getAnalysisStatus(taskId!),
    enabled: !!taskId,
    refetchInterval: (q) => {
      const st = q.state.data?.status;
      if (!st || st === "done" || st === "failed") return false;
      if (Date.now() - startedAt.current > MAX_MS) return false;
      return 2000;
    },
    staleTime: Infinity,
  });

  const status = poll.data?.status;
  const timedOut = taskId && Date.now() - startedAt.current > MAX_MS && status !== "done" && status !== "failed";

  useEffect(() => {
    if (status === "done" || status === "failed") startedAt.current = 0;
  }, [status]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input className="rounded bg-slate-800 px-3 py-1 w-40" value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="rounded bg-blue-600 px-4 py-1" disabled={start.isPending} onClick={() => start.mutate()}>
          {start.isPending ? "提交中…" : "分析"}
        </button>
      </div>
      {start.isError && <ErrorPanel error={extractApiError(start.error)} />}
      {poll.isError && <ErrorPanel error={extractApiError(poll.error)} />}
      {timedOut && <div className="text-red-300">分析超时（超过 5 分钟），请重试。</div>}
      {poll.data?.status === "failed" && <div className="text-red-300">失败：{poll.data.error_detail}</div>}
      {poll.data?.status && ["pending", "running"].includes(poll.data.status) && (
        <div className="text-slate-400">状态：{poll.data.status}…</div>
      )}
      {poll.data?.status === "done" && (
        <>
          {poll.data.scores && <RadarScore scores={poll.data.scores} />}
          <ConclusionCard conclusion={poll.data.conclusion} />
          {poll.data.report && <ReportMarkdown content={poll.data.report} />}
        </>
      )}
    </div>
  );
}
