import axios, { AxiosError } from "axios";
import type { ApiError } from "./errors";

export const apiClient = axios.create({
  baseURL: "/api",
  timeout: 30_000,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("dsa_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function extractApiError(err: unknown): ApiError {
  const axiosErr = err as AxiosError<{ error?: string; message?: string; detail?: unknown }>;
  const status = axiosErr.response?.status ?? 0;
  const data = axiosErr.response?.data;
  return {
    status,
    code: data?.error ?? (status === 0 ? "network_error" : "unknown"),
    message: data?.message ?? axiosErr.message ?? "Unknown error",
    url: axiosErr.config?.url ?? "",
    detail: data?.detail,
  };
}
