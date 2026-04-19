import { apiClient } from "./client";

export type Position = {
  code: string;
  name: string;
  shares: number;
  cost: number;
  price: number;
  market_value: number;
  pnl: number;
  pnl_pct: number;
  weight: number;
  sector?: string;
  account_id?: number;
};

export type Snapshot = {
  total_value: number;
  total_pnl: number;
  today_pnl: number;
  positions: Position[];
};

export type Account = {
  id: number;
  name: string;
  type?: string;
  base_currency?: string;
  trade_count?: number;
  created_at?: string;
};

export type Trade = {
  id: number;
  account_id: number;
  code: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  trade_date: string;
  fee?: number;
};

export type TradeCreateRequest = {
  account_id: number;
  code: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  trade_date: string;
  fee?: number;
};

export async function getSnapshot(): Promise<Snapshot> {
  const res = await apiClient.get<Snapshot>("/v1/portfolio/snapshot");
  return res.data;
}

export async function listAccounts(): Promise<{ items: Account[] }> {
  const res = await apiClient.get<{ items: Account[] }>("/v1/portfolio/accounts");
  return res.data;
}

export async function createAccount(body: { name: string; type?: string; base_currency?: string }): Promise<Account> {
  const res = await apiClient.post<Account>("/v1/portfolio/accounts", body);
  return res.data;
}

export async function updateAccount(id: number, body: { name?: string; type?: string; base_currency?: string }): Promise<Account> {
  const res = await apiClient.put<Account>(`/v1/portfolio/accounts/${id}`, body);
  return res.data;
}

export async function deleteAccount(id: number): Promise<void> {
  await apiClient.delete(`/v1/portfolio/accounts/${id}`);
}

export async function listTrades(params: { account_id?: number; code?: string }): Promise<{ items: Trade[] }> {
  const res = await apiClient.get<{ items: Trade[] }>("/v1/portfolio/trades", { params });
  return res.data;
}

export async function createTrade(body: TradeCreateRequest): Promise<{ event_id: number }> {
  const res = await apiClient.post<{ event_id: number }>("/v1/portfolio/trades", body);
  return res.data;
}

export async function deleteTrade(id: number): Promise<{ deleted: boolean }> {
  const res = await apiClient.delete<{ deleted: boolean }>(`/v1/portfolio/trades/${id}`);
  return res.data;
}

export type RiskSuggestion = {
  code: string;
  action: "add" | "reduce" | "liquidate" | "hold";
  confidence: number;
  reason: string;
  key_levels?: { support?: number; resistance?: number };
};

export type RiskReport = {
  generated_at: string;
  suggestions: RiskSuggestion[];
};

export async function getRiskReport(): Promise<RiskReport> {
  const res = await apiClient.get<RiskReport>("/v1/portfolio/risk-report");
  return res.data;
}

export async function createCashLedger(body: { account_id: number; direction: "in" | "out"; amount: number; date: string; note?: string }) {
  const res = await apiClient.post("/v1/portfolio/cash-ledger", body);
  return res.data;
}

export async function createCorporateAction(body: { code: string; action_type: string; amount?: number; date: string }) {
  const res = await apiClient.post("/v1/portfolio/corporate-actions", body);
  return res.data;
}

export async function csvImportPreview(file: File, broker: string) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("broker", broker);
  const res = await apiClient.post("/v1/portfolio/import/csv", fd);
  return res.data;
}

export async function csvImportCommit(token: string) {
  const res = await apiClient.post(`/v1/portfolio/import/csv/commit`, { token });
  return res.data;
}

export async function listCsvBrokers(): Promise<{ brokers: string[] }> {
  const res = await apiClient.get<{ brokers: string[] }>("/v1/portfolio/import/csv/brokers");
  return res.data;
}
