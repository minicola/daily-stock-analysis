import { apiClient } from "./client";

export type AnalyzeRequest = {
  stock_codes: string[];
  async_mode: boolean;
};

export type AnalysisAccepted = {
  task_id: string;
};

export type AnalysisStatus = {
  task_id: string;
  status: "pending" | "running" | "done" | "failed";
  report?: string;
  error_detail?: string;
  scores?: {
    trend?: number;
    momentum?: number;
    volume?: number;
    volatility?: number;
    sentiment?: number;
  };
  conclusion?: {
    action: "buy" | "hold" | "sell";
    confidence: number;
    key_levels?: { support?: number; resistance?: number };
  };
};

export async function triggerAnalysis(req: AnalyzeRequest): Promise<AnalysisAccepted> {
  const res = await apiClient.post<AnalysisAccepted>("/v1/analysis/analyze", req);
  return res.data;
}

export async function getAnalysisStatus(taskId: string): Promise<AnalysisStatus> {
  const res = await apiClient.get<AnalysisStatus>(`/v1/analysis/${taskId}`);
  return res.data;
}
