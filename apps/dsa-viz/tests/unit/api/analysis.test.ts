import { describe, it, expect } from "vitest";
import MockAdapter from "axios-mock-adapter";
import { apiClient } from "@/lib/api/client";
import { triggerAnalysis, getAnalysisStatus } from "@/lib/api/analysis";

const mock = new MockAdapter(apiClient);

describe("analysis api", () => {
  it("triggerAnalysis POSTs to /v1/analysis/analyze", async () => {
    mock.onPost("/v1/analysis/analyze").reply(202, { task_id: "abc123" });
    const res = await triggerAnalysis({ stock_codes: ["600519"], async_mode: true });
    expect(res.task_id).toBe("abc123");
  });

  it("getAnalysisStatus GETs /v1/analysis/{id}", async () => {
    mock.onGet("/v1/analysis/abc123").reply(200, { task_id: "abc123", status: "done", report: "## ok" });
    const res = await getAnalysisStatus("abc123");
    expect(res.status).toBe("done");
  });
});
