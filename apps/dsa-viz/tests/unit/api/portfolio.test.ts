import { describe, it, expect } from "vitest";
import MockAdapter from "axios-mock-adapter";
import { apiClient } from "@/lib/api/client";
import { getSnapshot, listAccounts, createTrade, deleteTrade, listTrades } from "@/lib/api/portfolio";

const mock = new MockAdapter(apiClient);

describe("portfolio api", () => {
  it("getSnapshot returns positions", async () => {
    mock.onGet("/v1/portfolio/snapshot").reply(200, {
      as_of: "2026-04-19",
      cost_method: "fifo",
      currency: "CNY",
      account_count: 0,
      total_cash: 0,
      total_market_value: 0,
      total_equity: 100,
      realized_pnl: 0,
      unrealized_pnl: 0,
      fee_total: 0,
      tax_total: 0,
      fx_stale: false,
      accounts: [],
    });
    const s = await getSnapshot();
    expect(s.total_equity).toBe(100);
    expect(s.accounts).toHaveLength(0);
  });

  it("listAccounts + createTrade + deleteTrade + listTrades", async () => {
    mock.onGet("/v1/portfolio/accounts").reply(200, { accounts: [] });
    mock.onPost("/v1/portfolio/trades").reply(200, { id: 1 });
    mock.onDelete("/v1/portfolio/trades/1").reply(200, { deleted: 1 });
    mock.onGet("/v1/portfolio/trades").reply(200, { items: [], total: 0, page: 1, page_size: 50 });

    const accounts = await listAccounts();
    expect(accounts).toEqual([]);

    const r = await createTrade({
      account_id: 1,
      symbol: "600519",
      side: "buy",
      quantity: 100,
      price: 1700,
      trade_date: "2026-04-19",
    });
    expect(r.id).toBe(1);

    const del = await deleteTrade(1);
    expect(del.deleted).toBe(1);

    const trades = await listTrades({});
    expect(trades.total).toBe(0);
  });
});
