import { apiClient } from "./client";

// --- Types ---

export type Market = "cn" | "hk" | "us";

export type Account = {
  id: number;
  owner_id?: string | null;
  name: string;
  broker?: string | null;
  market: Market;
  base_currency: string;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AccountCreateRequest = {
  name: string;
  broker?: string;
  market?: Market;
  base_currency?: string;
  owner_id?: string;
};

export type AccountUpdateRequest = Partial<AccountCreateRequest & { is_active: boolean }>;

export type Position = {
  symbol: string;
  market: string;
  currency: string;
  quantity: number;
  avg_cost: number;
  total_cost: number;
  last_price: number;
  market_value_base: number;
  unrealized_pnl_base: number;
  valuation_currency: string;
};

export type AccountSnapshot = {
  account_id: number;
  account_name: string;
  owner_id?: string | null;
  broker?: string | null;
  market: string;
  base_currency: string;
  as_of: string;
  cost_method: string;
  total_cash: number;
  total_market_value: number;
  total_equity: number;
  realized_pnl: number;
  unrealized_pnl: number;
  fee_total: number;
  tax_total: number;
  fx_stale: boolean;
  positions: Position[];
};

export type Snapshot = {
  as_of: string;
  cost_method: string;
  currency: string;
  account_count: number;
  total_cash: number;
  total_market_value: number;
  total_equity: number;
  realized_pnl: number;
  unrealized_pnl: number;
  fee_total: number;
  tax_total: number;
  fx_stale: boolean;
  accounts: AccountSnapshot[];
};

export type Trade = {
  id: number;
  account_id: number;
  trade_uid?: string | null;
  symbol: string;
  market: string;
  currency: string;
  trade_date: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  tax: number;
  note?: string | null;
  created_at?: string | null;
};

export type TradeCreateRequest = {
  account_id: number;
  symbol: string;
  trade_date: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee?: number;
  tax?: number;
  market?: Market;
  currency?: string;
  trade_uid?: string;
  note?: string;
};

export type Paginated<T> = { items: T[]; total: number; page: number; page_size: number };

export type CashLedgerCreateRequest = {
  account_id: number;
  event_date: string;
  direction: "in" | "out";
  amount: number;
  currency?: string;
  note?: string;
};

export type CorporateActionCreateRequest = {
  account_id: number;
  symbol: string;
  effective_date: string;
  action_type: "cash_dividend" | "split_adjustment";
  market?: Market;
  currency?: string;
  cash_dividend_per_share?: number;
  split_ratio?: number;
  note?: string;
};

export type CsvBroker = { broker: string; aliases: string[]; display_name?: string | null };

export type CsvParseResponse = {
  broker: string;
  record_count: number;
  skipped_count: number;
  error_count: number;
  records: Array<Record<string, unknown>>;
  errors: string[];
};

export type CsvCommitResponse = {
  account_id: number;
  record_count: number;
  inserted_count: number;
  duplicate_count: number;
  failed_count: number;
  dry_run: boolean;
  errors: string[];
};

// --- Accounts ---
export async function listAccounts(): Promise<Account[]> {
  const res = await apiClient.get<{ accounts: Account[] }>("/v1/portfolio/accounts");
  return res.data.accounts;
}

export async function createAccount(body: AccountCreateRequest): Promise<Account> {
  const res = await apiClient.post<Account>("/v1/portfolio/accounts", body);
  return res.data;
}

export async function updateAccount(id: number, body: AccountUpdateRequest): Promise<Account> {
  const res = await apiClient.put<Account>(`/v1/portfolio/accounts/${id}`, body);
  return res.data;
}

export async function deleteAccount(id: number): Promise<void> {
  await apiClient.delete(`/v1/portfolio/accounts/${id}`);
}

// --- Snapshot ---
export async function getSnapshot(
  params: { account_id?: number; as_of?: string; cost_method?: string } = {},
): Promise<Snapshot> {
  const res = await apiClient.get<Snapshot>("/v1/portfolio/snapshot", { params });
  return res.data;
}

// --- Trades ---
export async function listTrades(
  params: { account_id?: number; symbol?: string; page?: number; page_size?: number } = {},
): Promise<Paginated<Trade>> {
  const res = await apiClient.get<Paginated<Trade>>("/v1/portfolio/trades", { params });
  return res.data;
}

export async function createTrade(body: TradeCreateRequest): Promise<{ id: number }> {
  const res = await apiClient.post<{ id: number }>("/v1/portfolio/trades", body);
  return res.data;
}

export async function deleteTrade(id: number): Promise<{ deleted: number }> {
  const res = await apiClient.delete<{ deleted: number }>(`/v1/portfolio/trades/${id}`);
  return res.data;
}

// --- Cash ledger + corporate actions ---
export async function createCashLedger(body: CashLedgerCreateRequest) {
  const res = await apiClient.post<{ id: number }>("/v1/portfolio/cash-ledger", body);
  return res.data;
}

export async function createCorporateAction(body: CorporateActionCreateRequest) {
  const res = await apiClient.post<{ id: number }>("/v1/portfolio/corporate-actions", body);
  return res.data;
}

// --- CSV import ---
export async function listCsvBrokers(): Promise<CsvBroker[]> {
  const res = await apiClient.get<{ brokers: CsvBroker[] }>("/v1/portfolio/imports/csv/brokers");
  return res.data.brokers;
}

export async function csvImportParse(file: File, broker: string): Promise<CsvParseResponse> {
  const fd = new FormData();
  fd.append("broker", broker);
  fd.append("file", file);
  const res = await apiClient.post<CsvParseResponse>("/v1/portfolio/imports/csv/parse", fd);
  return res.data;
}

export async function csvImportCommit(body: {
  file: File;
  broker: string;
  account_id: number;
  dry_run?: boolean;
}): Promise<CsvCommitResponse> {
  const fd = new FormData();
  fd.append("account_id", String(body.account_id));
  fd.append("broker", body.broker);
  fd.append("dry_run", String(body.dry_run ?? false));
  fd.append("file", body.file);
  const res = await apiClient.post<CsvCommitResponse>("/v1/portfolio/imports/csv/commit", fd);
  return res.data;
}

// --- Risk (unchanged from Phase 7) ---
export type StopLossItem = {
  account_id?: number | null;
  symbol: string;
  avg_cost: number;
  last_price: number;
  loss_pct: number;
  near_threshold_pct: number;
  is_triggered: boolean;
};

export type RiskReport = {
  as_of: string;
  account_id?: number | null;
  cost_method: string;
  currency: string;
  thresholds: Record<string, unknown>;
  concentration: Record<string, unknown>;
  sector_concentration: Record<string, unknown>;
  drawdown: Record<string, unknown>;
  stop_loss: {
    near_alert: boolean;
    triggered_count: number;
    near_count: number;
    items: StopLossItem[];
  };
};

export async function getRiskReport(params: { account_id?: number } = {}): Promise<RiskReport> {
  const res = await apiClient.get<RiskReport>("/v1/portfolio/risk", { params });
  return res.data;
}
