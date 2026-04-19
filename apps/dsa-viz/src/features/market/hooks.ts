import { useQuery } from "@tanstack/react-query";
import { fetchHistory, fetchQuote, type Period } from "@/lib/api/stocks";

export function useKlineQuery(code: string, period: Period, days: number) {
  return useQuery({
    queryKey: ["kline", code, period, days],
    queryFn: () => fetchHistory(code, period, days),
    enabled: code.trim().length >= 1,
    staleTime: 30_000,
  });
}

export function useQuoteQuery(code: string) {
  return useQuery({
    queryKey: ["quote", code],
    queryFn: () => fetchQuote(code),
    enabled: code.trim().length >= 1,
    staleTime: 10_000,
  });
}
