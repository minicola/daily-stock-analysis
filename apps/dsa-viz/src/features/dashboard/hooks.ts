import { useQuery } from "@tanstack/react-query";
import { getRiskReport, getSnapshot } from "@/lib/api/portfolio";

export type Session = "pre" | "intra" | "post";

export function detectSession(now = new Date()): Session {
  const h = now.getHours();
  const m = now.getMinutes();
  const t = h * 60 + m;
  if (t < 9 * 60 + 30) return "pre";
  if (t >= 15 * 60) return "post";
  return "intra";
}

export function useRiskReport() {
  return useQuery({ queryKey: ["portfolio", "risk"], queryFn: () => getRiskReport(), staleTime: 60_000 });
}

export function useSnapshot() {
  return useQuery({ queryKey: ["portfolio", "snapshot"], queryFn: () => getSnapshot(), staleTime: 10_000 });
}
