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

export type ScreenRequest = {
  board_name: string;
  board_type?: "concept" | "industry";
  top_n?: number;
  min_score?: number;
  min_market_cap?: number | null;
  exclude_negative_pe?: boolean;
};

export type ScreenItem = {
  code: string;
  name: string;
  price: number;
  change_pct: number;
  pe_ratio?: number | null;
  total_mv?: number | null;
  score: number;
  sector?: string;
};

export type ScreenResponse = { total: number; items: ScreenItem[] };

export async function screenStocks(req: ScreenRequest): Promise<ScreenResponse> {
  const res = await apiClient.post<ScreenResponse>("/v1/stocks/screen", req);
  return res.data;
}
