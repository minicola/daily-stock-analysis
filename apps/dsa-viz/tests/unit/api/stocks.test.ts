import { describe, it, expect } from "vitest";
import MockAdapter from "axios-mock-adapter";
import { apiClient } from "@/lib/api/client";
import { fetchHistory, fetchQuote } from "@/lib/api/stocks";

const mock = new MockAdapter(apiClient);

describe("stocks api", () => {
  it("fetchQuote GETs /v1/stocks/{code}/quote", async () => {
    mock.onGet("/v1/stocks/600519/quote").reply(200, { code: "600519", price: 1700, change: 0.01 });
    const q = await fetchQuote("600519");
    expect(q.price).toBe(1700);
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
