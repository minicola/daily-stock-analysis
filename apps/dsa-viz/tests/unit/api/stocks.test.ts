import { describe, it, expect } from "vitest";
import MockAdapter from "axios-mock-adapter";
import { apiClient } from "@/lib/api/client";
import { fetchHistory, fetchQuote } from "@/lib/api/stocks";

const mock = new MockAdapter(apiClient);

describe("stocks api", () => {
  it("fetchQuote GETs /v1/stocks/{code}/quote", async () => {
    mock.onGet("/v1/stocks/600519/quote").reply(200, {
      stock_code: "600519",
      stock_name: "贵州茅台",
      current_price: 1700,
      change: 15,
      change_percent: 0.84,
    });
    const q = await fetchQuote("600519");
    expect(q.current_price).toBe(1700);
    expect(q.change_percent).toBe(0.84);
  });

  it("fetchHistory GETs with period/days", async () => {
    mock.onGet("/v1/stocks/600519/history").reply((config) => {
      expect(config.params).toEqual({ period: "daily", days: 60 });
      return [200, { code: "600519", candles: [{ date: "2026-04-18", open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }] }];
    });
    const h = await fetchHistory("600519", "daily", 60);
    expect(h.candles).toHaveLength(1);
  });
});
