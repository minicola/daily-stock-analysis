import { describe, it, expect } from "vitest";
import MockAdapter from "axios-mock-adapter";
import { apiClient } from "@/lib/api/client";
import { getSnapshot, listAccounts, createTrade, deleteTrade, listTrades } from "@/lib/api/portfolio";

const mock = new MockAdapter(apiClient);

describe("portfolio api", () => {
  it("getSnapshot returns positions", async () => {
    mock.onGet("/v1/portfolio/snapshot").reply(200, { total_value: 100, positions: [] });
    const s = await getSnapshot();
    expect(s.total_value).toBe(100);
  });
  it("listAccounts + createTrade + deleteTrade + listTrades", async () => {
    mock.onGet("/v1/portfolio/accounts").reply(200, { items: [] });
    mock.onPost("/v1/portfolio/trades").reply(200, { event_id: 1 });
    mock.onDelete("/v1/portfolio/trades/1").reply(200, { deleted: true });
    mock.onGet("/v1/portfolio/trades").reply(200, { items: [] });
    await listAccounts();
    const r = await createTrade({ account_id: 1, code: "600519", side: "buy", shares: 100, price: 1700, trade_date: "2026-04-19" });
    expect(r.event_id).toBe(1);
    await deleteTrade(1);
    await listTrades({});
  });
});
