import { apiClient } from "./client";

export type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type StockHistoryResponse = {
  code: string;
  candles: Candle[];
};

export type StockQuote = {
  code: string;
  price: number;
  change: number;
  name?: string;
};

export type Period = "daily" | "weekly" | "monthly";

export async function fetchQuote(code: string): Promise<StockQuote> {
  const res = await apiClient.get<StockQuote>(`/v1/stocks/${code}/quote`);
  return res.data;
}

export async function fetchHistory(code: string, period: Period, days: number): Promise<StockHistoryResponse> {
  const res = await apiClient.get<StockHistoryResponse>(`/v1/stocks/${code}/history`, {
    params: { period, days },
  });
  return res.data;
}
