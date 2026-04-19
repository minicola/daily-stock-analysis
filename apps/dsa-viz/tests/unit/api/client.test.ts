import { describe, expect, it, vi, beforeEach } from "vitest";
import { apiClient, extractApiError } from "@/lib/api/client";

describe("apiClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends requests with /api prefix", () => {
    expect(apiClient.defaults.baseURL).toBe("/api");
  });

  it("extractApiError returns structured error from 4xx response", () => {
    const error = {
      isAxiosError: true,
      response: {
        status: 400,
        data: { error: "bad_request", message: "stock code invalid" },
      },
      message: "Request failed with status code 400",
      config: { url: "/v1/stocks/foo/quote" },
    };
    const result = extractApiError(error);
    expect(result.status).toBe(400);
    expect(result.code).toBe("bad_request");
    expect(result.message).toBe("stock code invalid");
    expect(result.url).toBe("/v1/stocks/foo/quote");
  });

  it("extractApiError falls back to raw message on network error", () => {
    const error = {
      isAxiosError: true,
      message: "Network Error",
      config: { url: "/v1/health" },
    };
    const result = extractApiError(error);
    expect(result.status).toBe(0);
    expect(result.message).toBe("Network Error");
  });
});
